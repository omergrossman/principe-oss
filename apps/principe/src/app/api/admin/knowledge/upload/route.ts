// SPDX-License-Identifier: AGPL-3.0-or-later
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/require-auth";
import { appendEvolutionForSource } from "@/lib/projects/evolution";
import { fireAndForgetDistill } from "@/lib/sources/distill";

/**
 * File upload for knowledge sources. Accepts:
 *  - text/plain (.txt)
 *  - text/markdown (.md)
 *  - application/pdf (.pdf) — parsed via pdf-parse
 *
 * The file is parsed into text and stored on the KnowledgeSource row.
 * The raw binary is NOT kept — only the extracted text. Max upload
 * size is 8 MB before parse.
 */

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_CHARS = 20_000;

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await requireRole("PRINCIPE_ADMIN");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  const name = (file as File).name ?? "upload";
  const mime = file.type || guessMime(name);
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB > 8 MB).` },
      { status: 413 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  let text: string;
  try {
    text = await extractText(buf, mime, name);
  } catch (e) {
    return NextResponse.json(
      { error: `Could not parse file: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 415 },
    );
  }

  if (text.trim().length === 0) {
    return NextResponse.json({ error: "File produced no text content." }, { status: 415 });
  }

  const clipped = text.slice(0, MAX_TEXT_CHARS);
  const contentHash = crypto.createHash("sha256").update(clipped).digest("hex");
  const title = (form.get("title") as string | null)?.trim() || stripExt(name);
  const category = (form.get("category") as string | null)?.trim() || "custom";
  const region = (form.get("region") as string | null)?.trim() || "global";

  const source = await prisma.knowledgeSource.create({
    data: {
      firmId: session.firmId,
      kind: "FILE",
      filename: name,
      mimeType: mime,
      title,
      category,
      region,
      isCurated: false,
      enabled: true,
      content: clipped,
      contentHash,
      lastFetchedAt: new Date(),
      fetchEnabled: false,
    },
    select: {
      id: true,
      kind: true,
      url: true,
      filename: true,
      title: true,
      description: true,
      category: true,
      region: true,
      isCurated: true,
      enabled: true,
      publishedAt: true,
      lastFetchedAt: true,
      lastFetchError: true,
      contentHash: true,
      addedAt: true,
    },
  });

  void appendEvolutionForSource(source.id).catch(() => {});
  fireAndForgetDistill(source.id);
  return NextResponse.json({ source });
}

// pdf-parse v2's TextResult shape we depend on. Declared locally so we can
// cast once and use a typed object instead of inline `as unknown as` blobs.
interface TextResult {
  pages?: Array<{ text?: string }>;
  text?: string;
}

async function extractText(buf: Buffer, mime: string, name: string): Promise<string> {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (mime === "application/pdf" || ext === "pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buf) });
    try {
      const result = (await parser.getText()) as TextResult;
      if (Array.isArray(result.pages)) {
        return result.pages.map((p) => p.text ?? "").join("\n\n");
      }
      return result.text ?? "";
    } finally {
      await parser.destroy();
    }
  }
  if (
    mime === "text/plain" ||
    mime === "text/markdown" ||
    mime === "text/csv" ||
    ["txt", "md", "markdown", "csv", "log"].includes(ext)
  ) {
    return buf.toString("utf8");
  }
  throw new Error(`Unsupported file type (mime=${mime}, ext=${ext}).`);
}

function guessMime(name: string): string {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return "application/pdf";
  if (ext === "md" || ext === "markdown") return "text/markdown";
  if (ext === "csv") return "text/csv";
  return "text/plain";
}

function stripExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}
