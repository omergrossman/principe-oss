// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { startAuthentication } from "@simplewebauthn/browser";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/workspace";

  const [status, setStatus] = useState<
    "idle" | "checking" | "ready" | "running" | "empty" | "error"
  >("checking");
  const [error, setError] = useState("");
  const [webauthnSupported, setWebauthnSupported] = useState<boolean | null>(null);

  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      typeof window.PublicKeyCredential !== "undefined";
    setWebauthnSupported(ok);
    if (!ok) {
      setStatus("error");
      setError("This browser doesn't support passkeys.");
      return;
    }
    // Probe whether any passkeys are enrolled at all.
    fetch("/api/auth/login", { method: "GET" })
      .then((res) => {
        if (res.status === 404) {
          setStatus("empty");
        } else if (res.ok) {
          setStatus("ready");
        } else {
          setStatus("error");
          setError("Could not start sign-in");
        }
      })
      .catch(() => {
        setStatus("error");
        setError("Network error");
      });
  }, []);

  async function handleSignIn() {
    setStatus("running");
    setError("");
    try {
      const optsRes = await fetch("/api/auth/login", { method: "GET" });
      if (!optsRes.ok) {
        const data = await optsRes.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not start sign-in");
      }
      const options = await optsRes.json();
      const assertion = await startAuthentication({ optionsJSON: options });
      const verifyRes = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(assertion),
      });
      const data = await verifyRes.json();
      if (!verifyRes.ok || !data.verified) {
        throw new Error(data.error ?? "Could not verify passkey");
      }
      router.push(next);
    } catch (e) {
      // Translate the raw WebAuthn / server errors into plain language. The
      // browser's NotAllowedError is its catch-all for "cancelled, timed out,
      // or no matching passkey was offered" — not something a user can act on
      // as written.
      const name = e instanceof Error ? e.name : "";
      const msg = e instanceof Error ? e.message : "";
      let friendly =
        "Sign-in didn’t go through. Tap “Sign in with passkey” and try again.";
      if (name === "NotAllowedError" || name === "AbortError") {
        friendly =
          "Sign-in was cancelled or timed out. Tap “Sign in with passkey” again and approve the Touch ID / Face ID prompt.";
      } else if (/not found|no credential/i.test(msg)) {
        friendly =
          "No matching passkey on this device. Use the passkey you created for Príncipe — or, if you don’t have one yet, ask your admin for an invite.";
      } else if (/expired|challenge/i.test(msg)) {
        friendly = "That took too long. Tap “Sign in with passkey” and try again.";
      }
      setError(friendly);
      setStatus("error");
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <h1 className="text-[28px] font-bold text-ink-900 mb-2 tracking-tight">
          Sign in to Príncipe
        </h1>

        {status === "empty" && (
          <>
            <p className="text-[14px] text-ink-500 mb-6 leading-relaxed">
              No passkeys are registered yet. Enroll one at{" "}
              <Link
                href="/onboarding/enroll-passkey"
                className="text-flare-600 hover:text-flare-500 underline underline-offset-4"
              >
                /onboarding/enroll-passkey
              </Link>
              .
            </p>
          </>
        )}

        {(status === "ready" || status === "running" || status === "error") && (
          <>
            <p className="text-[14px] text-ink-500 mb-6 leading-relaxed">
              Authenticate with your passkey (Touch ID, Face ID, or security key).
            </p>
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={handleSignIn}
              disabled={status === "running" || !webauthnSupported}
            >
              {status === "running" ? "Waiting for passkey…" : "Sign in with passkey"}
            </Button>
            {error && (
              <div
                className="mt-4 p-3 rounded-md bg-verdict-fail/10 text-verdict-fail text-[13px]"
                role="alert"
              >
                <p className="font-semibold mb-1">Couldn&apos;t sign in</p>
                <p>{error}</p>
                <p className="mt-2 text-ink-500 text-[12px]">
                  No passkey for Príncipe yet? Ask your workspace admin for an
                  invite to set one up.
                </p>
              </div>
            )}
          </>
        )}

        {status === "checking" && (
          <p className="text-[13px] text-ink-300 font-mono">Checking passkeys…</p>
        )}

      </Card>
    </main>
  );
}
