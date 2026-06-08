import { NextResponse } from "next/server";

// Sprint 4 (2026-06-04) — Knowledge sources moved to /api/admin/knowledge.
// This shim returns 410 Gone with a Location header so in-flight clients
// (the KnowledgeSources React component's poll loop) redirect cleanly
// across the deployment cutover. Remove after Sprint 5.

const NEW_LOCATION = "/api/admin/knowledge";

function gone() {
  return NextResponse.json(
    {
      error: "Endpoint moved",
      message: `Use ${NEW_LOCATION} (admin-only)`,
      newLocation: NEW_LOCATION,
    },
    {
      status: 410,
      headers: { Location: NEW_LOCATION },
    },
  );
}

export const GET = gone;
export const POST = gone;
