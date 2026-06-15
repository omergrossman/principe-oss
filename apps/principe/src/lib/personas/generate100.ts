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
  posture: "enablement-first" | "pragmatic" | "security-purist";
  mandate: "reactive" | "embedded" | "strategic";
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
  { label: "150-400", budgetFactor: 0.6 },
  { label: "400-1k", budgetFactor: 1.0 },
  { label: "1k-5k", budgetFactor: 2.5 },
  { label: "5k-20k", budgetFactor: 6.0 },
  { label: "20k+", budgetFactor: 18.0 },
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

// Disposition axis — ORTHOGONAL to `stance` (which is about evaluation rigour).
// Posture is the persona's security-vs-business worldview AND their org's
// confidence / maturity / resourcing. Calibration (2026-06-14) showed the panel
// was a MONOLITHIC security-skeptic: it returned ~0% on "is GenAI enablement a
// priority?", "are you confident in your resilience?", "do you have resources
// for AI assessments?" while 34–64% of real CISOs say yes. The panel had no
// business-pragmatist / well-resourced CISOs to produce those yeses. This axis
// supplies them. Distribution (~35/40/25) is set so the panel can SPLIT on
// enablement / confidence / resourcing questions instead of collapsing to no.
const POSTURES: AgenticPersona["posture"][] = [
  "enablement-first",
  "pragmatic",
  "security-purist",
];

// Lottery weights (out of 100). Reflects that the real CISO population leans
// pragmatic, with a substantial enablement-first minority — NOT all purists.
const POSTURE_WEIGHTS: Record<AgenticPersona["posture"], number> = {
  "enablement-first": 35,
  pragmatic: 40,
  "security-purist": 25,
};

const POSTURE_COLORING: Record<AgenticPersona["posture"], string> = {
  "enablement-first":
    "You treat security as a business ENABLER, not a gatekeeper. Your programme is well-funded and you're broadly confident in your org's resilience — you do NOT feel acutely at risk of a material breach, because you've invested to prevent one. You actively push to adopt AI, cloud and automation for velocity, and you DO treat 'enable the business safely and fast' as a top-tier priority. On hard, contentious calls you reason from business continuity, not security dogma — e.g. you WOULD consider paying a ransom if that's the rational way to restore operations. On 'is X a priority / are you confident / are you resourced / do you already use modern tech' questions you'll often say yes — because for your org it's true.",
  pragmatic:
    "You balance enablement against risk case by case. Your org has real strengths AND real gaps — confident in some areas, exposed in others; resourced for some things, not others. You adopt new tech when the business case is clear. On contentious calls (e.g. whether to pay a ransom) you weigh business continuity over dogma and would at least CONSIDER the pragmatic option rather than rejecting it on principle. You're the median CISO: neither a blocker nor a cheerleader, and your answers split accordingly rather than defaulting to one side.",
  "security-purist":
    "Security first, business convenience second. You're cautious about new tech (AI, cloud sprawl) until it's proven, candid that your org has resilience gaps and is under-resourced, and you treat 'move faster / enable more' as a risk to manage rather than a priority to chase. You hold hard lines on principle — e.g. you would NOT pay a ransom. You often answer no to confidence, resourcing and enablement-priority questions — because for your org that's the honest answer.",
};

const STANCE_COLORING: Record<AgenticPersona["stance"], string> = {
  cautious: "Risk-averse by default. Demands proof, references, and an exit clause. When evidence is weak you say no — not maybe. When the evidence and risk story are solid, you commit; safety doesn't mean indecision.",
  balanced: "Pragmatic. Weighs evidence against operational reality. Says yes when an idea is 80%-right and addresses a real pain; says no when it's wrong-headed or the premise is broken. Neutral only when you genuinely lack information.",
  aggressive: "Action-oriented. Moves fast when conviction is high — backs strong pitches publicly, pushes back hard when the pitch is weak. Comfortable being the first to commit AND the first to walk away.",
  contrarian: "Default to skepticism of consensus and security-industry hype. Vote con and call out flawed premises when warranted; vote pro when a pitch genuinely cuts against the consensus narrative in a useful way. Equally allergic to herd 'yes' and reflexive 'no.'",
};

// AI posture — a THIRD axis, narrower than `posture`. Where `posture` is the
// broad security-vs-business worldview, AI posture is specifically how much the
// persona trusts AI to ACT autonomously (the sharp edge for AI-security pitches:
// autonomy, AI-for-defense, "trust the model"). Distinct from posture so an
// enablement-first CISO can still be autonomy-skeptical, and vice versa — the
// real-world combination. Mix reflects 2026 data: AI is the #1 CISO priority and
// ~78% plan AI investment (most engage), but real AI-attack experience drives
// genuine skepticism of autonomy.
const AI_POSTURE_COLORING = {
  forward:
    "AI posture: forward. You already run AI agents in production and you lean toward letting automation ACT, accepting bounded risk for the leverage. You push to adopt early rather than wait for the category to mature.",
  pragmatic:
    "AI posture: pragmatic. You're investing in AI but you want guardrails — human oversight on consequential actions, and evidence before you cede control. Interested, not credulous.",
  skeptic:
    "AI posture: skeptic. You've watched 'AI-powered' overpromise for years. You'll use AI to augment analysts, but you resist autonomy and 'trust the model' claims and assume vendor AI is marketing until proven.",
} as const;
type AiPosture = keyof typeof AI_POSTURE_COLORING;

// Mandate axis — the persona's organisational AUTHORITY and program maturity,
// orthogonal to posture (worldview). This is the CISO-Assembly V1.0↔V2.0 split:
// a reactive bolt-on with no leverage vs a board-level shaper with budget power.
// It's the lever on the willingness-vs-feasibility gap we measured on intent
// questions ("would you move org-wide to X in 12 months?") — a reactive CISO
// answers feasibility ("I can't drive that"), a strategic one answers willingness
// ("yes, I'd lead it"). Distributed so the panel reflects that most CISOs are NOT
// yet V2.0. Kept independent of size on purpose (a 400-person co can have a
// strategic CISO; a 20k one can have a reactive bolt-on).
const MANDATES: AgenticPersona["mandate"][] = ["reactive", "embedded", "strategic"];
const MANDATE_WEIGHTS: Record<AgenticPersona["mandate"], number> = {
  reactive: 40,
  embedded: 38,
  strategic: 22,
};
const MANDATE_COLORING: Record<AgenticPersona["mandate"], string> = {
  reactive:
    "Mandate: reactive. You bolt security onto what IT and the business hand you — limited authority, limited budget, and a real talent for defending an environment that was never designed to be defended. You answer through operational drag and feasibility: 'what can we actually do with what we've got?' You discount anything that needs organisational leverage you don't have, and you're honest that org-wide change you can't personally drive often just won't happen on the stated timeline.",
  embedded:
    "Mandate: embedded. You have real partnership with engineering and some budget authority, and you're integrating security into delivery — but you're not yet a board-level peer. You'll champion what you can credibly drive and defer what needs authority above your level. Your answers split case by case on how much of this you can actually own.",
  strategic:
    "Mandate: strategic. You run security like its CEO — a peer-level executive with budget authority who shapes the organisation and plays the long game. You answer from a shaping, willingness lens: if a direction is right you'll commit to driving it org-wide and assume you can marshal the org to get there, even if full rollout outlasts the stated window. You evaluate the direction, not whether you personally have the leverage — because you do.",
};

// Shared 2026 world the personas operate in — narrative grounding drawn from the
// public CISO surveys in /calibration + YL Ventures' State of the Cyber Nation.
// Context to react to through each persona's OWN seat/stance/posture, never a
// consensus to echo (echoing it would homogenise the panel — the opposite goal).
const CISO_REALITY_2026 = [
  `The world you operate in (2026) — react to it through YOUR own seat, stance, and posture; do NOT just echo it:`,
  `- A flood of well-funded security startups: a record ~$4.4B into cyber in 2025 across ~130 rounds, with global VCs now leading seed. You are pitched constantly; "another AI-security seed company" is a weekly occurrence. Tool sprawl and early-stage-vendor risk are daily realities.`,
  `- AI is the #1 stated CISO priority for 2026 (~78% plan to invest in AI security tools; ~70% of enterprises already run AI agents in production) — yet ~1 in 4 CISOs has already seen an AI-generated attack, and many distrust autonomy.`,
  `- Identity is the dominant attack surface (~67% of incidents are identity-rooted). ~73% of CISOs say they are NOT fully ready for a major attack.`,
  `- Budgets are tightening: only ~52% report an increase (down from ~70%). Consolidation is contested — ~60% still prefer best-of-breed over broad platforms.`,
  `- Most CISOs (~64%) still report into IT; a growing minority report to the business or board.`,
].join("\n");

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

function buildSystemPrompt(
  p: Omit<AgenticPersona, "markdown" | "systemPrompt">,
  aiPosture: AiPosture,
): string {
  return [
    `You are ${p.name}, an experienced CISO. ${p.tenure} in the role.`,
    `Region: ${p.region}. Industry: ${p.industry}. Company size: ${p.companySize}. Budget responsibility: ${p.budget}. Reports to: ${p.reportsTo}.`,
    `Background: ${p.background}.`,
    `Stance (how you evaluate): ${STANCE_COLORING[p.stance]}`,
    `Posture (your security-vs-business worldview and your org's maturity): ${POSTURE_COLORING[p.posture]}`,
    AI_POSTURE_COLORING[aiPosture],
    MANDATE_COLORING[p.mandate],
    `Current top concerns: ${p.concerns.join("; ")}.`,
    `Active initiative right now: ${p.initiative}.`,
    ``,
    CISO_REALITY_2026,
    ``,
    `Respond to the founder's question by outputting EXACTLY this JSON object — no prose before, no prose after:`,
    `{"verdict": "pro" | "con" | "neutral", "sentiment": <integer 1-10>, "headline": "<one-sentence verdict, max 18 words, in your voice>", "reasoning": "<2-3 sentences explaining your verdict, in your voice>"}`,
    ``,
    `Field meanings:`,
    `- verdict:`,
    `    pro = you'd commit / buy / champion / endorse the direction, OR you genuinely think the founder is solving the right problem in a way that beats what's on the market today`,
    `    con = you'd push back, refuse to engage, call it foolish, OR you think the premise is wrong / the founder is focused on the wrong problem / the cited framework doesn't apply / the question is wrong-headed`,
    `    neutral = directionally interested but won't commit without more evidence, OR the question simply doesn't apply to your context`,
    `- sentiment: your overall enthusiasm. 1 = strongly negative, 5 = ambivalent, 10 = strongly positive`,
    `- headline: punchy one-liner in YOUR voice`,
    `- reasoning: specific to your region / industry / size / initiative. Generic answers waste the founder's time.`,
    ``,
    `Rules:`,
    `- Output JSON ONLY. No code fences. No commentary.`,
    `- Both endorsement AND dissent are calibration. Vote pro when the pitch genuinely addresses your top concerns or beats what you have today — saying yes to a good idea isn't flattery. Vote con when you'd actually push back — don't soften to neutral to be polite.`,
    `- Neutral means "this doesn't apply to me" or "I'd need more data." It does NOT mean "I disagree but I'm being nice" (that's con) or "I'd buy this but I'm being cautious" (that's pro).`,
    `- If the founder's premise is wrong, vote con and say why — even if the topic is in your wheelhouse.`,
    `- If the founder's pitch genuinely cuts your MTTR / consolidates a vendor you'd love to drop / addresses a top concern with credible evidence, vote pro and say why — even if you don't typically buy from early-stage vendors.`,
    `- No corporate-speak. No buzzwords unless you're explicitly mocking them.`,
  ].join("\n");
}

function buildMarkdown(p: Omit<AgenticPersona, "markdown" | "systemPrompt">): string {
  return `${p.name} · ${p.region} · ${p.industry} · ${p.companySize} · ${p.tenure} as CISO. ${p.background}. Stance: ${p.stance}. Posture: ${p.posture}. Mandate: ${p.mandate}. Top concerns: ${p.concerns.join("; ")}. Active initiative: ${p.initiative}.`;
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

  // Posture lottery sized to N from fixed weights (~35/40/25). Deterministic:
  // built in declared order then drawn with the seeded rng like stance.
  const postureLottery: AgenticPersona["posture"][] = [];
  for (const p of POSTURES) {
    const w = Math.round((POSTURE_WEIGHTS[p] / 100) * n);
    for (let i = 0; i < w; i++) postureLottery.push(p);
  }
  while (postureLottery.length < n) {
    postureLottery.push(POSTURES[postureLottery.length % POSTURES.length]);
  }

  // Mandate lottery sized to N from fixed weights (~40/38/22). Same shape as
  // the posture lottery — deterministic, drawn with the seeded rng.
  const mandateLottery: AgenticPersona["mandate"][] = [];
  for (const m of MANDATES) {
    const w = Math.round((MANDATE_WEIGHTS[m] / 100) * n);
    for (let i = 0; i < w; i++) mandateLottery.push(m);
  }
  while (mandateLottery.length < n) {
    mandateLottery.push(MANDATES[mandateLottery.length % MANDATES.length]);
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
    const posture = postureLottery[Math.floor(rng() * postureLottery.length)];
    // AI-posture lottery — ~30% forward, ~45% pragmatic, ~25% skeptic. A distinct
    // axis from posture so AI-autonomy pitches genuinely split the panel.
    const aiRoll = rng();
    const aiPosture: AiPosture =
      aiRoll < 0.3 ? "forward" : aiRoll < 0.75 ? "pragmatic" : "skeptic";
    const mandate = mandateLottery[Math.floor(rng() * mandateLottery.length)];
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
      posture,
      mandate,
      concerns,
      initiative,
    };

    personas.push({
      ...partial,
      markdown: buildMarkdown(partial),
      systemPrompt: buildSystemPrompt(partial, aiPosture),
    });
  }

  return personas;
}

export const PANEL_KEY = "ciso-v2-agentic-100";
export const PANEL_VERSION = "v2.0-agentic-100";
