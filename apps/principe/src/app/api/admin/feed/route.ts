// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-auth";
import { feedConfig, getFeedState, addUrl, removeUrl, addFile, removeFile } from "@/lib/feed/repo";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireRole("VC_ADMIN", "PRINCIPE_ADMIN");
  const cfg = feedConfig();
  if (!cfg) return NextResponse.json({ ok: false, error: "feed not configured" }, { status: 404 });
  try {
    return NextResponse.json({ ok: true, ...(await getFeedState(cfg)) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "failed" }, { status: 502 });
  }
}

export async function POST(req: Request) {
  await requireRole("VC_ADMIN", "PRINCIPE_ADMIN");
  const cfg = feedConfig();
  if (!cfg) return NextResponse.json({ ok: false, error: "feed not configured" }, { status: 404 });

  let body: { action?: string; url?: string; name?: string; sha?: string; contentBase64?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  try {
    switch (body.action) {
      case "add-url": {
        const url = (body.url ?? "").trim();
        if (!/^https?:\/\/.+/.test(url)) {
          return NextResponse.json({ ok: false, error: "Enter a valid http(s) URL." }, { status: 400 });
        }
        await addUrl(cfg, url);
        break;
      }
      case "remove-url":
        await removeUrl(cfg, (body.url ?? "").trim());
        break;
      case "add-file": {
        const name = (body.name ?? "").trim();
        const content = body.contentBase64 ?? "";
        if (!name || !content) {
          return NextResponse.json({ ok: false, error: "name + contentBase64 required" }, { status: 400 });
        }
        await addFile(cfg, name, content);
        break;
      }
      case "remove-file":
        await removeFile(cfg, (body.name ?? "").trim(), (body.sha ?? "").trim());
        break;
      default:
        return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, ...(await getFeedState(cfg)) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "failed" }, { status: 502 });
  }
}
