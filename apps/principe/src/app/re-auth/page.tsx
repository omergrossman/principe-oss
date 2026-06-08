"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { startAuthentication } from "@simplewebauthn/browser";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function ReAuthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/workspace";

  const [status, setStatus] = useState<"idle" | "running" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    // Auto-trigger on mount — re-auth is friction; minimise it.
    void handleReAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleReAuth() {
    setStatus("running");
    setError("");
    try {
      const optsRes = await fetch("/api/auth/re-auth", { method: "GET" });
      if (!optsRes.ok) {
        const data = await optsRes.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not start re-auth");
      }
      const options = await optsRes.json();
      const assertion = await startAuthentication({ optionsJSON: options });
      const verifyRes = await fetch("/api/auth/re-auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(assertion),
      });
      const data = await verifyRes.json();
      if (!verifyRes.ok || !data.verified) {
        throw new Error(data.error ?? "Verification failed");
      }
      router.push(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Re-auth failed");
      setStatus("error");
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <h1 className="text-[24px] font-bold text-ink-900 mb-2 tracking-tight">
          Confirm it&apos;s you
        </h1>
        <p className="text-[14px] text-ink-500 mb-6 leading-relaxed">
          This action requires fresh authentication. Use your passkey to confirm.
        </p>
        {status === "running" && (
          <p className="text-[13px] text-ink-300 font-mono">
            Waiting for passkey…
          </p>
        )}
        {status === "error" && (
          <>
            <div
              className="mb-4 p-3 rounded-md bg-verdict-fail/10 text-verdict-fail text-[13px]"
              role="alert"
            >
              {error}
            </div>
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={handleReAuth}
            >
              Try again
            </Button>
          </>
        )}
      </Card>
    </main>
  );
}
