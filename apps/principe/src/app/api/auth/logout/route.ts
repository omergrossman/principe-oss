// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextResponse } from "next/server";
import { destroySession } from "@/lib/session";

export async function POST() {
  await destroySession();
  // 303 See Other so the browser switches to GET on /login after the POST.
  // Relative Location — the browser resolves it against its own origin;
  // building from req.url would use the container's internal :3000 port.
  return new NextResponse(null, {
    status: 303,
    headers: { Location: "/login" },
  });
}
