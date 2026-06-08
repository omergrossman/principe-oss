// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextResponse } from "next/server";

// Sprint 4 cutover shim — see /api/settings/sources/route.ts for context.

const NEW_LOCATION = "/api/admin/knowledge/upload";

function gone() {
  return NextResponse.json(
    {
      error: "Endpoint moved",
      message: `Use ${NEW_LOCATION} (admin-only)`,
      newLocation: NEW_LOCATION,
    },
    { status: 410, headers: { Location: NEW_LOCATION } },
  );
}

export const POST = gone;
