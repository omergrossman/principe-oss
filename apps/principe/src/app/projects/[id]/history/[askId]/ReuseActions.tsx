// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

/**
 * Sprint 6 — reuse a past Ask. Two buttons:
 *   - "Re-ask" runs the same question again on the current panel
 *     composition (passes ?run=1)
 *   - "Edit & ask" opens the workspace with the question prefilled
 *     in the textarea so the user can adjust before running
 *
 * Both navigate to /workspace; the AskForm there reads the query
 * params on mount.
 */
export function ReuseActions({ question }: { question: string }) {
  const router = useRouter();
  const encoded = encodeURIComponent(question);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button
        variant="primary"
        size="md"
        onClick={() => router.push(`/workspace?q=${encoded}&run=1`)}
      >
        Re-ask
      </Button>
      <Button
        variant="secondary"
        size="md"
        onClick={() => router.push(`/workspace?q=${encoded}`)}
      >
        Edit & ask
      </Button>
    </div>
  );
}
