// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * In-process progress tracker for the panel run.
 *
 * Keyed by VC firm id — assumes one in-flight question per firm at a
 * time (true for V1; concurrent asks from the same firm aren't a
 * supported use case yet). Lost on server restart, which is fine — a
 * client mid-poll falls back to a graceful "no active run."
 *
 * The /api/ask/progress endpoint reads from this store; AskForm polls
 * that endpoint while the question is running and maps the state to
 * the four phase progress bars.
 */

export interface PanelProgress {
  startedAt: number;
  personasTotal: number;
  personasDone: number;
  personasFailed: number;
  synthesisStartedAt: number | null;
  synthesisDoneAt: number | null;
  // Sprint 6 — Statistician validation timestamps. Validation runs
  // synchronously after synthesis completes but before the response is
  // returned. Pre-Sprint-6 the UI had no way to surface this ~1-3s wait;
  // the "Rendering dashboard" phase was a synthetic placeholder.
  validationStartedAt: number | null;
  validationDoneAt: number | null;
}

const store = new Map<string, PanelProgress>();

export function startProgress(firmId: string, total: number): void {
  store.set(firmId, {
    startedAt: Date.now(),
    personasTotal: total,
    personasDone: 0,
    personasFailed: 0,
    synthesisStartedAt: null,
    synthesisDoneAt: null,
    validationStartedAt: null,
    validationDoneAt: null,
  });
}

export function incrementPersona(firmId: string, failed: boolean): void {
  const s = store.get(firmId);
  if (!s) return;
  s.personasDone += 1;
  if (failed) s.personasFailed += 1;
}

export function markSynthesisStarted(firmId: string): void {
  const s = store.get(firmId);
  if (s) s.synthesisStartedAt = Date.now();
}

export function markSynthesisDone(firmId: string): void {
  const s = store.get(firmId);
  if (s) s.synthesisDoneAt = Date.now();
}

export function markValidationStarted(firmId: string): void {
  const s = store.get(firmId);
  if (s) s.validationStartedAt = Date.now();
}

export function markValidationDone(firmId: string): void {
  const s = store.get(firmId);
  if (s) s.validationDoneAt = Date.now();
}

export function clearProgress(firmId: string): void {
  store.delete(firmId);
}

export function getProgress(firmId: string): PanelProgress | null {
  return store.get(firmId) ?? null;
}
