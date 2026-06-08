import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/require-auth";
import { getProgress } from "@/lib/ciso-panel/progress";

/**
 * Lightweight progress polling endpoint. Returns the in-process
 * PanelProgress state for the current user's firm, or {active:false}
 * if no run is in flight.
 *
 * AskForm polls this every ~700ms while waiting on POST /api/ask.
 */
export async function GET() {
  const session = await requireAuth("/workspace");
  if (!session.firmId) {
    return NextResponse.json({ active: false });
  }
  const state = getProgress(session.firmId);
  if (!state) {
    return NextResponse.json({ active: false });
  }
  return NextResponse.json({
    active: true,
    personasTotal: state.personasTotal,
    personasDone: state.personasDone,
    personasFailed: state.personasFailed,
    synthesisStartedAt: state.synthesisStartedAt,
    synthesisDoneAt: state.synthesisDoneAt,
    validationStartedAt: state.validationStartedAt,
    validationDoneAt: state.validationDoneAt,
    startedAt: state.startedAt,
  });
}
