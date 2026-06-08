// SPDX-License-Identifier: AGPL-3.0-or-later
// Single source of truth for the canonical enum-ish values used across
// the app: industries (24), regions (7), company sizes (5), threat
// types (12). These match what ProjectAgent stores so cross-table
// matching works without normalisation.

export const INDUSTRIES = [
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
] as const;

export type Industry = (typeof INDUSTRIES)[number];

export const REGION_KEYS = [
  "us",
  "uk",
  "eu-west",
  "eu-central",
  "apac",
  "anz",
  "mea",
] as const;

export type RegionKey = (typeof REGION_KEYS)[number];

export const REGION_LABELS: Record<RegionKey, string> = {
  us: "US",
  uk: "UK",
  "eu-west": "EU West",
  "eu-central": "EU Central",
  apac: "APAC",
  anz: "ANZ",
  mea: "MEA",
};

export const COMPANY_SIZES = [
  "150-400",
  "400-1k",
  "1k-5k",
  "5k-20k",
  "20k+",
] as const;

export type CompanySize = (typeof COMPANY_SIZES)[number];

// Threat-type taxonomy — used by P2 routing's keyword classifier. ~12
// categories cover the ground a CISO panel argues about. Each maps to
// a list of keywords (case-insensitive substring match against the
// founder's question). Sprint 6 may swap this for an LLM classifier
// but the simple version handles >80% of real questions correctly.
export const THREAT_TYPES = [
  "ransomware",
  "supply-chain",
  "ai-security",
  "cloud-security",
  "identity",
  "vendor-risk",
  "compliance",
  "insider-threat",
  "data-exfiltration",
  "vulnerability-management",
  "email-and-bec",
  "network-security",
] as const;

export type ThreatType = (typeof THREAT_TYPES)[number];

export const THREAT_TYPE_KEYWORDS: Record<ThreatType, string[]> = {
  ransomware: ["ransomware", "encryption attack", "extortion", "wiper", "lockbit", "blackcat"],
  "supply-chain": ["supply chain", "supply-chain", "third party", "solarwinds", "log4j", "kaseya", "xz utils"],
  "ai-security": ["ai security", "llm", "prompt injection", "model risk", "ai governance", "shadow ai", "ai policy"],
  "cloud-security": ["cloud security", "cspm", "cnapp", "cwpp", "aws", "azure", "gcp", "cloud misconfiguration", "s3"],
  identity: ["identity", "iam", "okta", "entra", "auth0", "passkey", "mfa", "sso", "privileged access", "pam", "active directory"],
  "vendor-risk": ["vendor risk", "tprm", "third-party risk", "due diligence", "vendor consolidation", "vendor selection"],
  compliance: ["dora", "nis2", "gdpr", "hipaa", "pci", "sox", "fedramp", "iso 27001", "soc 2", "regulatory", "regulator"],
  "insider-threat": ["insider threat", "rogue employee", "ueba", "user behavior", "exfiltration by insider"],
  "data-exfiltration": ["exfiltration", "data theft", "dlp", "data loss prevention", "snowflake breach", "data leakage"],
  "vulnerability-management": ["vulnerability", "patch management", "cve", "exploitation", "zero day", "vuln", "spotlight"],
  "email-and-bec": ["email", "bec", "business email compromise", "phishing", "spearphishing", "email security"],
  "network-security": ["network", "firewall", "sase", "ztna", "segmentation", "microsegmentation", "edr", "xdr"],
};

/**
 * Classify a panel question into a set of likely threat types via
 * case-insensitive keyword match. Returns an empty array if no match —
 * the briefing builder then routes insights without the +3 threat boost.
 */
export function classifyQuestionThreatTypes(question: string): ThreatType[] {
  const q = question.toLowerCase();
  const matches: ThreatType[] = [];
  for (const threat of THREAT_TYPES) {
    if (THREAT_TYPE_KEYWORDS[threat].some((kw) => q.includes(kw))) {
      matches.push(threat);
    }
  }
  return matches;
}
