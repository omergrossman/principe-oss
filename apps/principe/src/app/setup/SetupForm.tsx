// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface FormState {
  workspaceName: string;
  adminName: string;
  adminEmail: string;
  anthropicKey: string;
  resendKey: string;
}

export function SetupForm() {
  const router = useRouter();
  const [state, setState] = useState<FormState>({
    workspaceName: "",
    adminName: "",
    adminEmail: "",
    anthropicKey: "",
    resendKey: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  const ready =
    state.workspaceName.trim().length >= 2 &&
    state.adminName.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.adminEmail.trim()) &&
    state.anthropicKey.trim().startsWith("sk-ant-");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceName: state.workspaceName.trim(),
          adminName: state.adminName.trim(),
          adminEmail: state.adminEmail.trim().toLowerCase(),
          anthropicKey: state.anthropicKey.trim(),
          resendKey: state.resendKey.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Setup failed.");
        return;
      }
      router.push(data.redirectTo ?? "/onboarding/enroll-passkey");
    } catch {
      setError("Network error — is the database reachable?");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Card>
        <h2 className="text-[13px] font-semibold text-ink-700 mb-3">
          1. Your workspace
        </h2>
        <label className="block mb-3">
          <span className="text-[11px] uppercase tracking-wide font-medium text-ink-500 mb-1 block">
            Workspace name
          </span>
          <input
            type="text"
            value={state.workspaceName}
            onChange={(e) => set("workspaceName", e.target.value)}
            placeholder="e.g. Acme Capital"
            maxLength={80}
            className="w-full h-10 px-3 rounded-md border border-ink-100 bg-elevated text-[14px] text-ink-900 placeholder:text-ink-300 focus:border-flare-600 focus:outline-none focus:ring-2 focus:ring-flare-600/20"
          />
        </label>
      </Card>

      <Card>
        <h2 className="text-[13px] font-semibold text-ink-700 mb-3">
          2. You (admin)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[11px] uppercase tracking-wide font-medium text-ink-500 mb-1 block">
              Display name
            </span>
            <input
              type="text"
              value={state.adminName}
              onChange={(e) => set("adminName", e.target.value)}
              placeholder="Jane Doe"
              maxLength={80}
              className="w-full h-10 px-3 rounded-md border border-ink-100 bg-elevated text-[14px] text-ink-900 placeholder:text-ink-300 focus:border-flare-600 focus:outline-none focus:ring-2 focus:ring-flare-600/20"
            />
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wide font-medium text-ink-500 mb-1 block">
              Email
            </span>
            <input
              type="email"
              value={state.adminEmail}
              onChange={(e) => set("adminEmail", e.target.value)}
              placeholder="jane@acme.cap"
              autoComplete="email"
              className="w-full h-10 px-3 rounded-md border border-ink-100 bg-elevated text-[14px] text-ink-900 placeholder:text-ink-300 focus:border-flare-600 focus:outline-none focus:ring-2 focus:ring-flare-600/20"
            />
          </label>
        </div>
      </Card>

      <Card>
        <h2 className="text-[13px] font-semibold text-ink-700 mb-3">
          3. Your Anthropic key
        </h2>
        <label className="block mb-2">
          <input
            type="password"
            value={state.anthropicKey}
            onChange={(e) => set("anthropicKey", e.target.value)}
            placeholder="sk-ant-api03-…"
            autoComplete="off"
            spellCheck={false}
            className="w-full h-10 px-3 rounded-md border border-ink-100 bg-elevated text-[14px] text-ink-900 placeholder:text-ink-300 focus:border-flare-600 focus:outline-none focus:ring-2 focus:ring-flare-600/20 font-mono"
          />
        </label>
        <p className="text-[11px] text-ink-500 leading-relaxed">
          BYO Anthropic key. The panel uses it to simulate every CISO
          response. Encrypted AES-256-GCM at rest. Validated against
          api.anthropic.com before persisting.
        </p>
      </Card>

      <Card>
        <h2 className="text-[13px] font-semibold text-ink-700 mb-3">
          Optional — Resend key for emails
        </h2>
        <label className="block mb-2">
          <input
            type="password"
            value={state.resendKey}
            onChange={(e) => set("resendKey", e.target.value)}
            placeholder="re_… (leave blank if you don't need email)"
            autoComplete="off"
            spellCheck={false}
            className="w-full h-10 px-3 rounded-md border border-ink-100 bg-elevated text-[14px] text-ink-900 placeholder:text-ink-300 focus:border-flare-600 focus:outline-none focus:ring-2 focus:ring-flare-600/20 font-mono"
          />
        </label>
        <p className="text-[11px] text-ink-500 leading-relaxed">
          Used only for passkey-reset emails. Skip it for a fully
          passwordless setup — you can paste a key later in Settings.
        </p>
      </Card>

      {error && (
        <Card className="border-verdict-fail/30 bg-verdict-fail/5">
          <p role="alert" className="text-[13px] text-verdict-fail">
            {error}
          </p>
        </Card>
      )}

      <div className="flex justify-end">
        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={!ready || submitting}
        >
          {submitting ? "Validating + creating…" : "Create workspace →"}
        </Button>
      </div>
    </form>
  );
}
