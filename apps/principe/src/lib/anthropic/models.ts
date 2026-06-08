/**
 * Centralised Anthropic model identifiers.
 *
 * One source of truth for which model serves which task. Changing the
 * panel model here updates both the 100-agent fan-out and the
 * downstream synthesis.
 */

export const ANTHROPIC_MODELS = {
  /** Used by every persona in the 100-agent fan-out. */
  panel: "claude-haiku-4-5",
  /** Used by the synthesis pass (exec summary, pros/cons, insights). */
  synthesis: "claude-haiku-4-5",
} as const;
