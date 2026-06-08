import { NextResponse } from "next/server";

// Sprint 4 cutover shim — see /api/settings/sources/route.ts for context.

function gone(req: Request) {
  const url = new URL(req.url);
  // Preserve the [id] segment in the redirect target.
  const id = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const newLocation = `/api/admin/knowledge/${id}`;
  return NextResponse.json(
    {
      error: "Endpoint moved",
      message: `Use ${newLocation} (admin-only)`,
      newLocation,
    },
    {
      status: 410,
      headers: { Location: newLocation },
    },
  );
}

export const PATCH = gone;
export const DELETE = gone;
