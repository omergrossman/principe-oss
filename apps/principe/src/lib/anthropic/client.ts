// SPDX-License-Identifier: AGPL-3.0-or-later
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db/prisma";
import { decryptSecret } from "@/lib/secrets";

/**
 * Load the firm's stored Anthropic key and return a ready-to-use SDK client.
 * Throws if no key is configured.
 */
export async function getAnthropicClientForFirm(
  firmId: string,
): Promise<Anthropic> {
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: { anthropicKeyCiphertext: true },
  });
  if (!firm?.anthropicKeyCiphertext) {
    throw new Error("ANTHROPIC_KEY_MISSING");
  }
  const apiKey = decryptSecret(firm.anthropicKeyCiphertext);
  // maxRetries=5 (default is 2) gives 429s more chances to recover after
  // we burst-dispatch the panel. With the concurrency limiter on top,
  // most rate-limit hits should resolve before we surface them as errors.
  return new Anthropic({ apiKey, maxRetries: 5 });
}
