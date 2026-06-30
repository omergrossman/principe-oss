# Market Trend Layer

Príncipe's CISO panel tells you what security practitioners think. The market trend layer tells you what the _market_ shows — independently. When a question is in consensus territory, the panel can echo the field rather than the opportunity. The trend layer quantifies three signals into a composite viability score and tempers the synthesis prompt when the numbers warrant it.

---

## What it does

After the 100-agent panel completes and before synthesis runs, `analyzeTrends()` makes a lightweight Haiku call that produces a `TrendContext`:

| Field | Values | Meaning |
|-------|--------|---------|
| `marketSaturation` | low / moderate / high | How crowded is the space? |
| `vcMomentum` | accelerating / stable / cooling | Is deal flow growing or slowing? |
| `timingSignal` | early / peak / late | Where is the category in its hype cycle? |
| `viabilityScore` | 0–100 | Weighted composite (see below) |
| `narrative` | string | 1–2 sentence analyst read |
| `dataSource` | corpus-only / corpus+updates | What knowledge was available |
| `matchedCategories` | string[] | Calibration categories that fired |

### Viability score weights

```
Panel agreement rate    40%
Trend alignment score   35%
VC momentum score       25%
```

### Tempering rules

When any of the following are true, the synthesis prompt gets a market context block injected — the model is instructed to lead with the risk rather than echo the panel:

| Condition | Instruction added |
|-----------|------------------|
| `viabilityScore < 60` | Lead with market risk before panel agreement |
| `marketSaturation === "high"` | Explicitly name crowding in the summary |
| `vcMomentum === "cooling"` | Flag timing risk |

When none of these fire (`viabilityScore >= 60`, saturation is low/moderate, momentum is stable/accelerating), the Market Signal card renders but the synthesis is unchanged — additive context, not a correction.

---

## Data flow

```
runPanelAsk()
  ↓
route.ts queries KnowledgeSource rows (corpus + optionally live feed)
  ↓
analyzeTrends(question, aggregates, questionType, client, knowledgeSources)
  ↓ TrendContext | null  (null = Haiku failed, missing seeding, etc.)
synthesizePanel(..., { trendContext })
  ↓ prompt gets market block injected when tempering rules fire
requestVerdict()
  ↓
ProjectAsk saved with trendContext JSONB column
  ↓
API response includes trendContext
  ↓
MarketSignalCard renders below ValidationBanner
```

Failures anywhere in `analyzeTrends()` set `trendContext = null`. Synthesis runs exactly as it did before the feature existed. The panel result is never gated on the trend pass.

---

## Setup (new instance)

### Step 1 — Get your firm ID

```bash
docker exec principlecisomock-db-1 psql -U postgres -d principe \
  -c 'SELECT id, name FROM "Firm" LIMIT 5;'
```

### Step 2 — Seed the knowledge corpus (one-time per firm)

The analyst-reports and pitch-deck snapshots live in `calibration/knowledge/` and need to be loaded into the DB before the trend layer has real content to reason from.

```bash
# Analyst market reports (category: "analyst")
docker exec principlecisomock-web-1 sh -c \
  "cd /workspace/apps/principe && \
   pnpm tsx scripts/_seed-knowledge.ts --target=kb-analyst-reports --firm-id=<YOUR_FIRM_ID>"

# Pitch-deck competitive references (category: "pitch_deck_reference")
docker exec principlecisomock-web-1 sh -c \
  "cd /workspace/apps/principe && \
   pnpm tsx scripts/_seed-knowledge.ts --target=kb-pitch-decks --firm-id=<YOUR_FIRM_ID>"
```

After seeding, every `/api/ask` call automatically runs `analyzeTrends()`. No env var needed — this is **corpus-only mode**.

---

## Live feed mode (corpus+updates)

Set `PRINCIPE_UPDATES_URL` in `.env.local` to a non-empty, non-`"disabled"` value:

```env
PRINCIPE_UPDATES_URL=https://your-feed-url
```

When the env var is set, the route additionally queries `KnowledgeSource` rows where:

```
kind = "BUNDLE"  AND  category = "market-trend"
```

These rows are written by the existing `applyBundle()` mechanism in `lib/updates/apply.ts`. To publish market-trend entries, add manifest entries with `category: "market-trend"` to your signed bundle. No schema change is needed — the `category` field already exists.

`TrendContext.dataSource` will be `"corpus+updates"` when the env var is set, `"corpus-only"` otherwise. The Market Signal card shows which mode was active.

---

## UI

The **Market Signal card** renders below the statistical validation banner on every ask result (live and history). It is hidden when `trendContext` is null.

```
┌─────────────────────────────────────────────────────────┐
│  [Market]  Market Signal               Viability 71/100 │
│  ──────────────────────────────────────────────────────  │
│  Saturation   ●○○  low                                  │
│  VC Momentum  ●●●  accelerating                         │
│  Timing       ●●○  peak                                 │
│                                                         │
│  Identity security tooling is crowded but VC momentum   │
│  is strong — differentiation matters more than category │
│  entry here.                                            │
│                                                         │
│  Based on corpus · 2 calibration category matches       │
└─────────────────────────────────────────────────────────┘
```

Color convention (matches the rest of the design system):
- Green (`verdict-pass`): favorable signal (low saturation, accelerating VC, peak timing)
- Orange (`verdict-warn`): moderate signal
- Red (`verdict-fail`): risk signal (high saturation, cooling VC, late timing)
- Card border is orange/grey when tempering fired, green when the signal is clean

---

## Files

| File | Role |
|------|------|
| `apps/principe/src/lib/ciso-panel/trend-analysis.ts` | All pure functions + `analyzeTrends()` |
| `apps/principe/src/app/api/ask/route.ts` | Queries knowledge, calls `analyzeTrends()`, saves + returns `trendContext` |
| `apps/principe/src/lib/ciso-panel/synthesize.ts` | `buildSynthesisUserPayload()` — injects market block when tempering fires |
| `apps/principe/src/app/workspace/MarketSignalCard.tsx` | UI card component |
| `apps/principe/src/app/workspace/AskForm.tsx` | Live result — renders card |
| `apps/principe/src/app/workspace/SavedAskDashboard.tsx` | History view — renders card |
| `apps/principe/src/app/projects/[id]/history/[askId]/page.tsx` | Loads `trendContext` from DB for history |
| `apps/principe/prisma/schema.prisma` | `ProjectAsk.trendContext Json?` column |
| `apps/principe/scripts/_seed-knowledge.ts` | Seeder for `kb-analyst-reports` and `kb-pitch-decks` targets |

---

## Tests

```bash
# Run all trend-layer tests
docker exec principlecisomock-web-1 sh -c \
  "cd /workspace/apps/principe && node_modules/.bin/vitest run src/lib/ciso-panel/__tests__/trend-analysis.test.ts src/lib/ciso-panel/__tests__/synthesize-trend.test.ts src/lib/ciso-panel/__tests__/analyze-trends.test.ts src/lib/ciso-panel/__tests__/analyze-trends-prompt.test.ts"
```

| Test file | What it covers |
|-----------|---------------|
| `trend-analysis.test.ts` | `computeViabilityScore`, `buildTrendContext`, `shouldTemperSynthesis` |
| `synthesize-trend.test.ts` | `buildSynthesisUserPayload` — injection on/off, tempering language |
| `analyze-trends.test.ts` | `parseAnalyzeTrendsResponse` — JSON parsing, validation, fence stripping |
| `analyze-trends-prompt.test.ts` | `buildAnalyzeTrendsPrompt` — knowledge source injection, truncation |

All 41 tests are pure (no DB, no network) and run in ~300ms.

---

## Extending

The trend pass follows the same pattern as the adversarial review pass: a named `analyze*()` function returns a typed struct, which is optionally injected into the synthesis prompt.

A future pass (e.g. regulatory sentiment, competitor density) would:
1. Add a function to `trend-analysis.ts` or a new sibling file
2. Return a typed struct
3. Call it in `route.ts` between the panel and synthesis
4. Optionally inject its output into `buildSynthesisUserPayload()`
5. Persist to a new nullable JSONB column on `ProjectAsk`

No formal interface is defined yet (YAGNI — fewer than 3 passes exist). When a third pass lands, extract a shared interface.
