// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextResponse } from "next/server";
import { destroySession } from "@/lib/session";

export async function POST(req: Request) {
  await destroySession();
  // 303 See Other so the browser switches to GET on /login after the POST.
  return NextResponse.redirect(new URL("/login", req.url), 303);
}
