// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Deterministic generator for the agentic CISO panel — 100 distinct
 * synthesized personas spread across geographies, industries, sizes,
 * tenures, and stances. All experienced (3+ year CISOs).
 *
 * These are NOT modelled on specific real CISOs. They are synthetic
 * agents whose system prompts are constructed from combinations of
 * curated dimensions, designed to produce distinct responses across
 * the panel when asked the same question.
 *
 * Determinism matters: re-running this should produce the exact same
 * 100 personas so calibration + back-testing remain reproducible.
 */

export interface AgenticPersona {
  key: string;
  name: string;
  region: string;
  industry: string;
  companySize: string;
  tenure: string;
  background: string;
  reportsTo: string;
  budget: string;
  stance: "cautious" | "balanced" | "aggressive" | "contrarian";
  concerns: string[];
  initiative: string;
  markdown: string;
  systemPrompt: string;
}

const REGIONS: Array<{ key: string; weight: number; names: string[]; reports: string[]; currency: string }> = [
  {
    key: "us",
    weight: 32,
    currency: "$",
    reports: ["CTO", "CIO", "COO", "CEO", "Risk Committee"],
    names: [
      "Sarah Chen", "Mike Reyes", "Aisha Kapoor", "David Park", "Jennifer Liu",
      "Marcus Johnson", "Priya Sundaram", "Tom Brennan", "Diana Vargas", "Andre Wilkins",
      "Rachel Nguyen", "Carlos Mendez", "Beth Sutherland", "Jamal Foster", "Linda Park-Howell",
      "Eric Tanaka", "Vanessa Cruz", "Patrick O'Donnell", "Renee Holloway", "Kenji Watanabe-Smith",
      "Tara Pillai", "Doug Henderson", "Maya Williams", "Sergei Kovalenko", "Christine Ramos",
      "Bill Cartwright", "Aiyana Redfeather", "Greg Calloway", "Nina Petrov", "Hassan Mehta",
      "Brooke Sandoval", "Quentin Hayes",
    ],
  },
  {
    key: "eu-west",
    weight: 18,
    currency: "€",
    reports: ["Risk Committee", "CIO", "CFO", "Group COO"],
    names: [
      "Helena Voss", "Florian Mertens", "Camille Dupont", "Joost van der Berg", "Sophie Laurent",
      "Niels Andersen", "Aurélie Lefebvre", "Pieter Janssen", "Margot Bernard", "Tobias Schmidt",
      "Inès Moreau", "Hugo Vermeer", "Solène Dubois", "Lars Bergström", "Femke de Vries",
      "Étienne Rousseau", "Anna Eriksson", "Mathis Hofmann",
    ],
  },
  {
    key: "uk",
    weight: 12,
    currency: "£",
    reports: ["CEO", "CFO", "Audit Committee", "Board"],
    names: [
      "James Okafor", "Charlotte Ainsley", "Rohan Bhatt", "Eleanor Whitfield", "Imran Choudhury",
      "Olivia Marchant", "Daniel Eze", "Catherine Pemberton", "Aaron Lambert", "Sanjana Iyer",
      "Theo Blackwood", "Niamh Sullivan",
    ],
  },
  {
    key: "eu-central",
    weight: 10,
    currency: "€",
    reports: ["CIO", "Vorstand", "Risk Committee", "CTO"],
    names: [
      "Lukas Pawlik", "Klara Novotná", "Tomáš Veselý", "Marta Wójcik", "Stefan Adler",
      "Hana Kovács", "Jakub Bartoš", "Annika Müller", "Mateusz Lewandowski", "Petra Horváth",
    ],
  },
  {
    key: "apac",
    weight: 13,
    currency: "$",
    reports: ["Group CTO", "CIO", "Country CEO", "Regional Risk Head"],
    names: [
      "Kenji Tan", "Wei Liang", "Anjali Mehrotra", "Hiroshi Yamada", "Sunita Raman",
      "Junichi Sato", "Mei-Ling Wong", "Karthik Subramanian", "Yuki Nakamura", "Soo-Jin Park",
      "Vikram Desai", "Aarav Krishnan", "Lin Hua",
    ],
  },
  {
    key: "anz",
    weight: 8,
    currency: "A$",
    reports: ["CTO", "CIO", "CRO"],
    names: [
      "Aaron Walsh", "Tama Henare", "Caitlin Murphy", "Rohan Pillay", "Hannah Whitelaw",
      "Liam Donovan", "Ngaire Tipene", "Maddy Atkinson",
    ],
  },
  {
    key: "mea",
    weight: 7,
    currency: "$",
    reports: ["CIO", "Group CEO", "Risk Committee"],
    names: [
      "Yael Shapira", "Karim El-Said", "Reem Al-Mansouri", "Ofir Levi", "Tariq Hassan",
      "Adi Ben-Ari", "Layla Rahman",
    ],
  },
];

// GICS Industry Group taxonomy, adjusted for CISO buyer segmentation:
//   - Fintech & Payments split out of Banks / Financial Services (distinct
//     security posture: cloud-native, faster procurement, modern regs).
//   - Software & Services split into B2B SaaS vs Consumer Internet &
//     E-commerce (very different threat models and buyers).
//   - Government, Public Sector & Education added (not GICS — not
//     publicly traded — but the most distinct CISO profile we have:
//     FedRAMP / FERPA / NIST CSF, multi-year procurement, classified
//     clearance gates).
const INDUSTRIES = [
  "Banks",
  "Insurance",
  "Financial Services",
  "Fintech & Payments",
  "B2B SaaS",
  "Consumer Internet & E-commerce",
  "Tech Hardware & Devices",
  "Semiconductors",
  "Healthcare Providers",
  "Pharmaceuticals & Biotech",
  "Medical Devices & Health-tech",
  "Telecommunications",
  "Media & Entertainment",
  "Manufacturing",
  "Aerospace & Defense",
  "Transportation & Logistics",
  "Automotive",
  "Energy (Oil, Gas, Renewables)",
  "Utilities (Power & Water)",
  "Materials & Chemicals",
  "Retail & Consumer Goods",
  "Hospitality & Travel",
  "Real Estate & Construction",
  "Government, Public Sector & Education",
];

const SIZES = [
  { label: "150-400 (Series B)", budgetFactor: 0.6 },
  { label: "400-1k (Series C)", budgetFactor: 1.0 },
  { label: "1k-5k (Series D+/pre-IPO)", budgetFactor: 2.5 },
  { label: "5k-20k (mid-market)", budgetFactor: 6.0 },
  { label: "20k+ (enterprise)", budgetFactor: 18.0 },
];

const TENURES = [
  "3 years", "4 years", "5 years", "6 years", "7 years", "8 years",
  "10 years", "12 years", "15+ years",
];

const BACKGROUNDS: Array<{ label: string; coloring: string }> = [
  { label: "ex-engineer", coloring: "still writes code on weekends. Skeptical of marketing claims; demands architecture diagrams before any conversation about value." },
  { label: "ex-Big4 consultant", coloring: "thinks in frameworks (NIST CSF, ISO 27001, MITRE ATT&CK). Quick to map any vendor pitch to a control gap." },
  { label: "ex-regulator", coloring: "operates inside-out: regulatory mandates first, vendor selection second. Reads every contract appendix." },
  { label: "ex-military / intelligence", coloring: "treats every threat model as adversarial. Will war-game your product against a determined attacker before evaluating." },
  { label: "ex-founder", coloring: "speaks startup. Will tell you if your pricing or onboarding is broken. Sympathetic to roadmap gaps if execution is credible." },
  { label: "ex-pentester", coloring: "thinks in attack chains. Will ask how you'd be exploited before asking what you do." },
  { label: "career CISO (internal promotion)", coloring: "deeply networked inside the company. Trades adoption velocity for organizational fit." },
];

const STANCES: AgenticPersona["stance"][] = ["cautious", "balanced", "aggressive", "contrarian"];

const STANCE_COLORING: Record<AgenticPersona["stance"], string> = {
  cautious: "Risk-averse by default. Demands proof, references, and an exit clause before agreeing to anything. When evidence is weak, you say no — not maybe.",
  balanced: "Pragmatic. Weighs evidence against operational reality. Will tell you when an idea is 80%-right AND when it's wrong-headed.",
  aggressive: "Action-oriented. Moves fast when conviction is high. Pushes back hard and publicly when it isn't — including telling founders their question is the wrong question.",
  contrarian: "Default to skepticism of consensus and security-industry hype. Vote con and call out flawed premises unless the founder's case is genuinely strong. Comfortable saying 'this is foolish', 'you're focused on the wrong problem', or 'the framework you cite doesn't apply here.'",
};

const CONCERN_POOL = [
  "vendor consolidation pressure from the CFO",
  "AI tool sprawl across the org",
  "board-reporting fatigue",
  "data-residency compliance (region-specific)",
  "third-party risk management depth",
  "M&A IT integration backlog",
  "ransomware tabletop readiness",
  "SOC analyst attrition",
  "shadow SaaS proliferation",
  "identity provider migration",
  "zero-trust architecture rollout",
  "SBOM and supply-chain visibility",
  "post-quantum crypto planning",
  "incident-response retainer renewal",
  "cyber insurance premium negotiations",
  "regulator examination preparation",
  "OT/IT convergence (where applicable)",
  "DLP false-positive overload",
  "privileged access governance",
  "endpoint detection coverage gaps",
];

const INITIATIVES = [
  "rolling out passwordless authentication org-wide",
  "consolidating from 4 SIEMs to 1",
  "evaluating an AI-SOC pilot",
  "rewriting the access review process",
  "migrating IAM to a new platform",
  "standing up a red team for the first time",
  "implementing CIS controls v8 baseline",
  "preparing for SOC 2 Type II",
  "running a phishing-simulation upgrade",
  "transitioning to a 24/7 in-house SOC",
  "building a security data lake",
  "rationalizing the GRC tool stack",
  "rolling out DLP across SaaS",
  "negotiating MSSP contract renewal",
  "drafting an AI-acceptable-use policy",
  "executing a posture management roll-up",
  "deploying CNAPP across cloud workloads",
  "running the annual board cyber briefing",
];

// Simple seeded PRNG (mulberry32) so the matrix is deterministic.
function makeRng(seed: number) {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function pickN<T>(arr: readonly T[], n: number, rng: () => number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(rng() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

function buildBudget(size: typeof SIZES[number], currency: string): string {
  const base = size.budgetFactor;
  if (base < 1) return `${currency}${Math.round(base * 1000)}k/yr`;
  if (base < 10) return `${currency}${base.toFixed(1)}M/yr`;
  return `${currency}${Math.round(base)}M/yr`;
}

function buildSystemPrompt(p: Omit<AgenticPersona, "markdown" | "systemPrompt">): string {
  return [
    `You are ${p.name}, an experienced CISO. ${p.tenure} in the role.`,
    `Region: ${p.region}. Industry: ${p.industry}. Company size: ${p.companySize}. Budget responsibility: ${p.budget}. Reports to: ${p.reportsTo}.`,
    `Background: ${p.background}.`,
    `Stance: ${STANCE_COLORING[p.stance]}`,
    `Current top concerns: ${p.concerns.join("; ")}.`,
    `Active initiative right now: ${p.initiative}.`,
    ``,
    `Respond to the founder's question by outputting EXACTLY this JSON object — no prose before, no prose after:`,
    `{"verdict": "pro" | "con" | "neutral", "sentiment": <integer 1-10>, "headline": "<one-sentence verdict, max 18 words, in your voice>", "reasoning": "<2-3 sentences explaining your verdict, in your voice>"}`,
    ``,
    `Field meanings:`,
    `- verdict:`,
    `    pro = you'd commit / agree / buy / champion / endorse the direction`,
    `    con = you'd push back, refuse to engage, call it foolish, OR you think the premise is wrong, the founder is focused on the wrong problem, the cited framework doesn't apply, or the question itself is wrong-headed`,
    `    neutral = directionally interested but won't commit without more evidence, OR the question simply doesn't apply to your context`,
    `- sentiment: your overall enthusiasm. 1 = strongly negative, 5 = ambivalent, 10 = strongly positive`,
    `- headline: punchy one-liner in YOUR voice`,
    `- reasoning: specific to your region / industry / size / initiative. Generic answers waste the founder's time.`,
    ``,
    `Rules:`,
    `- Output JSON ONLY. No code fences. No commentary.`,
    `- Dissent is valuable feedback. If you'd genuinely push back, vote con — don't soften to neutral to be polite. A founder learns more from one well-reasoned "this is foolish" than from ten "interesting, tell me more."`,
    `- Neutral means "this doesn't apply to me" or "I'd need more data." It does NOT mean "I disagree but I'm being nice about it" — that's con.`,
    `- If the founder's premise is wrong, vote con and say why, even if the topic is in your wheelhouse.`,
    `- No corporate-speak. No buzzwords unless you're explicitly mocking them.`,
  ].join("\n");
}

function buildMarkdown(p: Omit<AgenticPersona, "markdown" | "systemPrompt">): string {
  return `${p.name} · ${p.region} · ${p.industry} · ${p.companySize} · ${p.tenure} as CISO. ${p.background}. Stance: ${p.stance}. Top concerns: ${p.concerns.join("; ")}. Active initiative: ${p.initiative}.`;
}

/**
 * Composition input — parameterises which regions/industries/stances/
 * sizes the generator samples from. NULL means "use the deterministic
 * Sprint-1 default" (preserves current behaviour for the default
 * project).
 */
export interface GenerationConfig {
  regionWeights?: Record<string, number>;
  industries?: string[]; // empty/missing = all 24
  stanceWeights?: Record<string, number>; // sums to 1.0
  sizeMinIndex?: number; // 0-4 into SIZES
  sizeMaxIndex?: number; // 0-4 into SIZES
}

/**
 * Sprint 7 — variable panel size. Defaults to 100 to preserve legacy
 * caller behaviour; min 30, max 200 (statistical bounds — see Sprint 7
 * grooming for rationale). Region slot allocation scales proportionally
 * so a 50-persona panel keeps the same region ratio as 100; stance
 * lottery sizing scales too.
 */
export function generatePersonas(
  seed = 19190529,
  config?: GenerationConfig,
  panelSize = 100,
): AgenticPersona[] {
  const n = Math.max(30, Math.min(200, Math.round(panelSize)));
  const rng = makeRng(seed);

  // Resolve composition — fall back to Sprint-1 defaults if config is absent.
  const regionWeights = config?.regionWeights ?? {
    us: 32,
    "eu-west": 18,
    uk: 12,
    "eu-central": 10,
    apac: 13,
    anz: 8,
    mea: 7,
  };
  const allowedIndustries =
    config?.industries && config.industries.length > 0
      ? INDUSTRIES.filter((i) => config.industries!.includes(i))
      : INDUSTRIES;
  const allowedStanceKeys: AgenticPersona["stance"][] = config?.stanceWeights
    ? (STANCES.filter((s) => (config.stanceWeights![s] ?? 0) > 0))
    : STANCES;
  const sizeMin = Math.max(0, Math.min(4, config?.sizeMinIndex ?? 0));
  const sizeMax = Math.max(sizeMin, Math.min(4, config?.sizeMaxIndex ?? 4));
  const allowedSizes = SIZES.slice(sizeMin, sizeMax + 1);

  // Build region slots — weights are interpreted as percentages, scaled to N.
  // Sprint 7: scaling preserves region ratios as N varies (50 → 7 regions
  // with proportional counts; 200 → same ratios with 2x counts each).
  const totalWeight = Object.values(regionWeights).reduce(
    (a, b) => a + (b ?? 0),
    0,
  );
  const slots: string[] = [];
  if (totalWeight > 0) {
    for (const [regionKey, weight] of Object.entries(regionWeights)) {
      if (!REGIONS.find((r) => r.key === regionKey)) continue;
      const count = Math.round((weight / totalWeight) * n);
      for (let i = 0; i < count; i++) slots.push(regionKey);
    }
  }
  // Clamp to exactly N (rounding can drift by ±1 per region).
  while (slots.length > n) slots.pop();
  if (slots.length < n) {
    const heaviest = Object.entries(regionWeights).sort((a, b) => b[1] - a[1])[0];
    while (slots.length < n && heaviest) slots.push(heaviest[0]);
  }

  // Build a stance lottery sized to N (proportional to weights).
  const stanceLottery: AgenticPersona["stance"][] = [];
  if (config?.stanceWeights) {
    for (const s of allowedStanceKeys) {
      const w = Math.round((config.stanceWeights[s] ?? 0) * n);
      for (let i = 0; i < w; i++) stanceLottery.push(s);
    }
  }
  while (stanceLottery.length < n) {
    stanceLottery.push(allowedStanceKeys[stanceLottery.length % allowedStanceKeys.length]);
  }

  // Track name uniqueness per region.
  const usedNamesByRegion = new Map<string, Set<string>>();
  for (const r of REGIONS) usedNamesByRegion.set(r.key, new Set());

  const personas: AgenticPersona[] = [];

  for (let i = 0; i < n; i++) {
    const regionKey = slots[i];
    const region = REGIONS.find((r) => r.key === regionKey)!;

    const used = usedNamesByRegion.get(regionKey)!;
    let name = "";
    const available = region.names.filter((n) => !used.has(n));
    if (available.length > 0) {
      name = pick(available, rng);
    } else {
      name = `${pick(region.names, rng)} ${used.size + 1}`;
    }
    used.add(name);

    const size = pick(allowedSizes, rng);
    const industry = pick(allowedIndustries, rng);
    const tenure = pick(TENURES, rng);
    const background = pick(BACKGROUNDS, rng);
    const stance = stanceLottery[Math.floor(rng() * stanceLottery.length)];
    const concerns = pickN(CONCERN_POOL, 2, rng);
    const initiative = pick(INITIATIVES, rng);
    const reportsTo = pick(region.reports, rng);
    const budget = buildBudget(size, region.currency);

    const partial = {
      // Key padding fits up to 999 personas — well above the 200 cap.
      key: `agent-${String(i + 1).padStart(3, "0")}`,
      name,
      region: region.key,
      industry,
      companySize: size.label,
      tenure,
      background: `${background.label} — ${background.coloring}`,
      reportsTo,
      budget,
      stance,
      concerns,
      initiative,
    };

    personas.push({
      ...partial,
      markdown: buildMarkdown(partial),
      systemPrompt: buildSystemPrompt(partial),
    });
  }

  return personas;
}

export const PANEL_KEY = "ciso-v2-agentic-100";
export const PANEL_VERSION = "v2.0-agentic-100";
