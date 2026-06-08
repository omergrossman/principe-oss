// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startRegistration } from "@simplewebauthn/browser";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function EnrollPasskeyPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "running" | "error">("idle");
  const [error, setError] = useState("");

  async function handleEnroll() {
    setStatus("running");
    setError("");
    try {
      const optsRes = await fetch("/api/auth/register", { method: "GET" });
      if (!optsRes.ok) {
        const data = await optsRes.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not start enrollment");
      }
      const options = await optsRes.json();
      const attestation = await startRegistration({ optionsJSON: options });
      const verifyRes = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(attestation),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.verified) {
        throw new Error(verifyData.error ?? "Could not verify passkey");
      }
      router.push("/workspace");
    } catch (e) {
      // Mid-ceremony cancel / network drop / browser refused — AC-Story-01.2
      const message = e instanceof Error ? e.message : "Enrollment failed";
      setError(message);
      setStatus("error");
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <h1 className="text-[28px] font-bold text-ink-900 mb-2 tracking-tight">
          Register a passkey
        </h1>
        <p className="text-[14px] text-ink-500 mb-6 leading-relaxed">
          Príncipe uses passkeys (Touch ID, Face ID, security key) for
          sign-in. No passwords. You can enroll additional passkeys later
          from Settings.
        </p>

        {status === "error" && (
          <div className="mb-4 p-3 rounded-md bg-verdict-fail/10 text-verdict-fail text-[13px]" role="alert">
            <p className="font-semibold mb-1">Enrollment didn&apos;t finish</p>
            <p>{error}</p>
            <p className="mt-2 text-ink-500">
              No partial state was saved. Try again, or sign out and use a
              different account.
            </p>
          </div>
        )}

        <Button
          variant="primary"
          size="lg"
          className="w-full"
          onClick={handleEnroll}
          disabled={status === "running"}
        >
          {status === "running" ? "Waiting for passkey…" : "Register passkey"}
        </Button>
        <p className="text-[12px] text-ink-300 mt-3 text-center font-mono">
          Your browser will prompt for biometrics or a security key.
        </p>
      </Card>
    </main>
  );
}
