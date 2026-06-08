// SPDX-License-Identifier: AGPL-3.0-or-later
// Sprint 4 — industry-typical framework map. Used by the briefing builder
// to award +3 score when a source's `applicableFrameworks` overlaps with
// the persona's industry's typical framework set.
//
// Small, visible, easy to extend. Sprint 5 (persona enrichment) may
// derive this from the persona's archetype directly rather than from a
// static table — revisit then.

const FRAMEWORK_FIT: Record<string, string[]> = {
  "financial-services": [
    "DORA",
    "NIS2",
    "PCI-DSS",
    "SOX",
    "NIST CSF v2",
    "ISO 27001",
  ],
  insurance: ["DORA", "NIS2", "NIST CSF v2", "ISO 27001"],
  healthcare: ["HIPAA", "HITRUST", "NIST CSF v2", "ISO 27001"],
  technology: ["SOC 2", "ISO 27001", "NIST CSF v2", "MITRE ATT&CK"],
  government: ["FedRAMP", "NIST CSF v2", "NIST SP 800-53", "FISMA"],
  energy: [
    "NIS2",
    "NIST CSF v2",
    "NERC CIP",
    "IEC 62443",
    "ISO 27001",
  ],
  retail: ["PCI-DSS", "GDPR", "NIST CSF v2", "ISO 27001"],
  manufacturing: ["NIS2", "IEC 62443", "ISO 27001", "NIST CSF v2"],
  telecom: ["NIS2", "NIST CSF v2", "ISO 27001"],
  education: ["FERPA", "NIST CSF v2", "ISO 27001"],
  "critical-infrastructure": [
    "NIS2",
    "NERC CIP",
    "NIST CSF v2",
    "DORA",
    "IEC 62443",
  ],
};

/** Returns the industry-typical framework set, or `[]` for unknown
 *  industries. Case-insensitive lookup against the canonical keys. */
export function frameworksForIndustry(industry: string | null | undefined): string[] {
  if (!industry) return [];
  const key = industry.trim().toLowerCase();
  return FRAMEWORK_FIT[key] ?? [];
}

/** Returns true if any of `sourceFrameworks` appears in the industry's
 *  typical framework set. Both sides case-insensitive. */
export function frameworksOverlap(
  sourceFrameworks: string[],
  industry: string | null | undefined,
): boolean {
  if (!Array.isArray(sourceFrameworks) || sourceFrameworks.length === 0) {
    return false;
  }
  const typical = frameworksForIndustry(industry).map((f) => f.toLowerCase());
  if (typical.length === 0) return false;
  return sourceFrameworks.some((f) =>
    typeof f === "string" && typical.includes(f.trim().toLowerCase()),
  );
}
