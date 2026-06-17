# Principe — Calibration Corpus V1

**Date:** 2026-06-01
**Status:** V1 corpus — US/Western-skewed; global expansion deferred per Option C (Phase 3 sign-off 2026-06-01)
**Used by:** EP-09 Calibration Registry + Backtest Harness; EP-04 Statistician Agent (for KL divergence reference distributions)

---

## Purpose

The calibration corpus is the data foundation that makes Principe's "honest calibration" brand promise credible. Without it, the Statistician has no ground truth to compute KL divergence against; the backtest harness has no targets to score correlation against; and confidence scores in the UI become marketing fiction.

Every dataset here contains **aggregate distributions only** — never raw individual respondent rows (per Product Council 2026-06-01 ruling). When Principe synthesizes a CISO panel response, it compares the synthetic distribution to these reference distributions.

---

## V1 sources (3 datasets)

> Removed 2026-06-17: `gartner-2026-threats.json` (a paywalled Gartner research note). It
> carried proprietary, page-cited Gartner survey statistics under a "licensed — not redistributed"
> flag, which is incompatible with this being a PUBLIC repo. Its calibration coverage should
> be rebuilt only from public primaries (Verizon DBIR, IBM X-Force, NIST, CISA KEV, etc.).

| Dataset | Source | Year | Sample size | License posture |
|---|---|---|---|---|
| `verizon-2026-dbir.json` | Verizon 2026 DBIR | 2025-2026 (Nov 1, 2024 - Oct 31, 2025) | ~22,000 confirmed breaches, ~31,000 incidents, 145 countries | Public report — citable for analysis; aggregate stats are widely cited industry-wide |
| `panorays-2026-ciso.json` | Panorays 2026 CISO Survey (Global Surveyz) | 2025-2026 | 200 CISOs across finance / insurance / professional services / tech / healthcare / software | Public summary findings — citable |
| `wakefield-2026-ciso-ai.json` | Wakefield Research CISO/AI Survey | 2026 | 200 CISOs at companies with $500M+ revenue | Public summary findings — citable |

---

## Expansion — 2026 CISO surveys + cyber-VC surveys (added 2026-06)

Seven datasets added to broaden coverage beyond the original four (Omer-sourced list). They add **new dimensions** the original corpus lacked — org position, IR readiness, strategic priorities, identity-threat reality — and a deliberately **balancing** signal on the contested consolidation/budget narratives.

| Dataset | Source | Year | n | Adds | License |
|---|---|---|---|---|---|
| `ians-2026-state-of-ciso.json` | IANS + Artico Search | 2026 | 662 | reporting line (64% IT / 36% business), exec-title prevalence, scope-unmanageable | public (public infographic / press release only) |
| `evanta-2026-ciso-priorities.json` | Evanta (Gartner) | 2026 | 1000+ | AI as #1 priority, AI/DLP/IAM investment intent | public (public infographic / press release only) |
| `sygnia-2026-ir-readiness.json` | Sygnia | 2026 | 600+ | IR readiness (73% not ready), attacked-last-12mo, IR-plan adoption | public |
| `sophos-2026-ciso.json` | Sophos + Cybersecurity Ventures | 2026 | — | identity-attack share (67%/71%), human-factor breach %, workforce gap | public |
| `cribl-2025-ciso-priorities.json` | Cribl (synthesis) | 2025 | — | budget-growth slowdown, best-of-breed vs consolidation, AI budget >10% | public |
| `glilot-2026-ciso-survey.json` | Glilot Capital (IL cyber VC) | 2026 | — | AI investment intent, vendor strategy split, AI-defense-by-2026 | public |
| `team8-2025-ciso-village.json` | Team8 (IL cyber VC) | 2025 | 110+ | AI agents in production, AI-attack prevalence, SOC-replaced-by-AI | public |

**Notes:**
- The two **Israeli cyber-VC** datasets (Glilot, Team8) are the closest thing the corpus has to **MEA/Israel-network** grounding — relevant given the first Leg-2 respondent pool was all-MEA. They do NOT fully close the regional gap (participants are global), but they help.
- **Not usable (checked 2026-06):** YL Ventures publishes a "State of the Cyber Nation" *ecosystem/funding* tracker, not a CISO-opinion survey; Cyberstarts has no public CISO survey. RH-ISAC (retail/hospitality) and Hitch Partners (comp/reporting) remain to be ingested — Hitch's detail is behind an interactive report.
- **License caution:** IANS/Evanta are member-research firms; only their public press-release/infographic aggregate figures are used here (mirrors the existing Gartner posture). Confirm with counsel before any external/design-partner reliance.

---

## V1 region coverage (deliberately limited)

V1 is **US/Western-skewed** by design. Per Phase 3 Option C, we ship V1 with one source confirmed US-focused (Panorays is global but US-heavy; Wakefield is US-only; Gartner is global but US-skewed; DBIR is global multi-country):

- **US** — well covered (4 sources)
- **EU/UK** — partial coverage via DBIR (145 countries) + Gartner global findings
- **APAC/ANZ** — minimal coverage in V1

Until the EU/UK/APAC source ingestion lands (post-V1, before first EU design partner per Product Council follow-up #3), Principe outputs for non-US tenants carry an **explicit "Directional only — limited regional calibration data"** label per AC-F7.

---

## Question categories covered

A "question category" is a kind of decision a CISO makes that we have calibration data for. When a founder writes a hypothesis, the Statistician maps the hypothesis to a category, then computes KL divergence between the synthetic panel's response and the reference distribution for that category.

V1 categories with calibration:

| Category | Sources | What we can predict honestly |
|---|---|---|
| `initial_access_vector` | DBIR | How breaches start: vuln exploit, phishing, credential abuse, supply chain |
| `breach_type_distribution` | DBIR | Ransomware prevalence, third-party involvement, breach causes |
| `vendor_consolidation_priority` | Panorays | Whether CISOs are buying more or fewer tools |
| `peer_recommendation_trust` | Panorays | How CISOs evaluate vendor information |
| `third_party_visibility_gap` | Panorays | CISO confidence in third-party security |
| `ai_strategy_in_procurement` | Wakefield | Whether AI strategy is a vendor evaluation criterion |
| `budget_growth_2026` | Gartner | Budget direction expectation across the field |
| `top_threat_priorities_2026` | Gartner | Where CISOs are prioritizing investment |
| `ransomware_response_posture` | DBIR + Gartner | Pay rates, defense investment, recovery time |
| `deepfake_attack_exposure` | Gartner | Frequency of audio/video deepfake attacks |
| `vulnerability_remediation_time` | DBIR | Patch time, percentage of CISA KEV remediated |
| `shadow_ai_prevalence` | DBIR | Insider AI-data-leak incidence |

V1 calibration does NOT cover:

- Detailed product-feature buying behavior (would need vendor-specific surveys)
- Regional regulatory response patterns (deferred to global expansion)
- Industry-vertical-specific stats beyond DBIR's industry cuts
- Procurement cycle length / sales motion (no public data with comparable scale)

These categories label as "Directional only" in the UI until calibration sources are added.

---

## License + compliance notes

1. **Gartner extraction**: Gartner research notes carry a license restriction ("restricted to the personal use of [licensee]"). Aggregate percentage findings from published research are commonly cited in industry analysis under fair use; Principe extracts these as *reference distributions* for an internal statistical model (KL divergence target) — not republishing the Gartner content. **Follow-up required**: confirm with Gartner counsel that this use is permitted before first external design-partner conversation. Tracked in Product Council follow-ups.

2. **Verizon DBIR**: Verizon publicly distributes the DBIR and explicitly asks citations to link to `verizon.com/dbir`. Aggregate stats are intended for industry use. Citable without license concern.

3. **Panorays / Wakefield**: Summary findings publicly distributed by source organizations. Citable.

4. **Future ingestion**: Each new dataset added to this corpus requires a license review before integration. Add a `license_status` field to the dataset JSON.

---

## How EP-09 ingests this corpus

The Calibration Registry (EP-09, Sprint 3-4) reads each `datasets/*.json` file via the admin upload UI:

1. Schema validation per `schema.json`
2. Per-question-category indexing
3. Per-region indexing
4. Stored in Postgres + raw JSON to object storage
5. Backtest harness queries: "given panel composition X and question category Y, what is the reference distribution from the registry to compare against?"

V1 calibration loading: admin uploads these 4 JSON files manually during launch prep.

---

## Maintenance

- New surveys publish quarterly; ingest within 2 weeks of publication
- Annual refresh of all datasets — typically May (DBIR) / June (Gartner mid-year) / quarterly Panorays
- Coverage gaps logged in `coverage-gaps.md` (to be maintained)
- License changes (e.g., source paywalls or open-licenses) flagged here
