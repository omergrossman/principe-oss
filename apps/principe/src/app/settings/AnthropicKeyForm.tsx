"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

interface Props {
  connected: boolean;
  last4: string | null;
}

export function AnthropicKeyForm({ connected }: Props) {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!key.trim().startsWith("sk-ant-")) {
      setError("Anthropic keys start with sk-ant-…");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/settings/anthropic-key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: key.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not save key.");
        return;
      }
      setSuccess(`Saved. Last 4: …${data.last4}`);
      setKey("");
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove() {
    if (!confirm("Remove the stored Anthropic key? Panels will fail until you re-paste it.")) return;
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/settings/anthropic-key", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not remove key.");
        return;
      }
      setSuccess("Key removed.");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="mt-4 space-y-3">
      <label className="block">
        <span className="text-[12px] font-medium text-ink-700 mb-1 block">
          {connected ? "Replace key" : "API key"}
        </span>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="sk-ant-api03-…"
          autoComplete="off"
          spellCheck={false}
          className="w-full h-10 px-3 rounded-md border border-ink-100 bg-elevated text-[14px] text-ink-900 placeholder:text-ink-300 focus:border-flare-600 focus:outline-none focus:ring-2 focus:ring-flare-600/20 font-mono"
        />
      </label>
      <p className="text-[11px] text-ink-300 leading-relaxed">
        Keys never leave your server. Stored AES-256-GCM encrypted. Validated
        against api.anthropic.com before saving.
      </p>
      {error && (
        <p role="alert" className="text-[12px] text-verdict-fail bg-verdict-fail/10 px-2 py-1.5 rounded-md">
          {error}
        </p>
      )}
      {success && (
        <p className="text-[12px] text-verdict-pass bg-verdict-pass/10 px-2 py-1.5 rounded-md font-mono">
          {success}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="md" disabled={submitting || !key}>
          {submitting ? "Validating…" : connected ? "Replace key" : "Save key"}
        </Button>
        {connected && (
          <Button type="button" variant="text" size="md" onClick={handleRemove} disabled={submitting}>
            Remove
          </Button>
        )}
      </div>
    </form>
  );
}
