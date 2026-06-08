import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/require-auth";
import { encryptSecret, last4 } from "@/lib/secrets";

export async function POST(req: Request) {
  const session = await requireRole("VC_ADMIN", "PRINCIPE_ADMIN");
  const body = await req.json().catch(() => ({}));
  const key = typeof body.key === "string" ? body.key.trim() : "";

  if (!key.startsWith("sk-ant-")) {
    return NextResponse.json(
      { error: "Anthropic keys start with sk-ant-…" },
      { status: 400 },
    );
  }

  // Validate the key with a cheap real API call (lists models).
  try {
    const client = new Anthropic({ apiKey: key });
    await client.models.list({ limit: 1 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown";
    return NextResponse.json(
      {
        error:
          msg.toLowerCase().includes("401") || msg.toLowerCase().includes("auth")
            ? "Key rejected by Anthropic (auth failure)."
            : `Key validation failed: ${msg.slice(0, 120)}`,
      },
      { status: 400 },
    );
  }

  const ciphertext = encryptSecret(key);
  await prisma.firm.update({
    where: { id: session.firmId },
    data: {
      anthropicKeyCiphertext: ciphertext,
      anthropicKeyLast4: last4(key),
    },
  });

  return NextResponse.json({ ok: true, last4: last4(key) });
}

export async function DELETE() {
  const session = await requireRole("VC_ADMIN", "PRINCIPE_ADMIN");
  await prisma.firm.update({
    where: { id: session.firmId },
    data: { anthropicKeyCiphertext: null, anthropicKeyLast4: null },
  });
  return NextResponse.json({ ok: true });
}
