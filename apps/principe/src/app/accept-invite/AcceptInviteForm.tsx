// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

function deriveDisplayName(email: string): string {
  const local = email.split("@")[0] ?? email;
  return (
    local
      .split(/[._-]+/)
      .filter(Boolean)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ") || email
  );
}

export function AcceptInviteForm({
  token,
  email,
  firmName,
}: {
  token: string;
  email: string;
  firmName: string;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(deriveDisplayName(email));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function accept() {
    setError("");
    if (!displayName.trim()) {
      setError("Display name can't be empty.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/accept-invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, displayName: displayName.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not accept invite.");
        return;
      }
      router.push(data.redirectTo ?? "/onboarding/enroll-passkey");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Field label="Email (set by admin)" value={email} readOnly />
      <Field label="Organisation" value={firmName} readOnly />
      <div>
        <label className="text-[13px] text-ink-700 font-medium mb-1.5 block">
          Display name
        </label>
        <p className="text-[12px] text-ink-500 mb-2">
          How you&apos;ll appear in Príncipe. A nickname is fine.
        </p>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          disabled={busy}
          maxLength={60}
          autoComplete="name"
          autoFocus
          className="w-full h-10 px-3 rounded-md border border-ink-100 bg-elevated text-[14px] text-ink-900 disabled:opacity-50"
        />
      </div>
      {error && (
        <p
          role="alert"
          className="text-[13px] text-verdict-fail bg-verdict-fail/10 px-3 py-2 rounded-md"
        >
          {error}
        </p>
      )}
      <Button
        variant="primary"
        size="md"
        onClick={accept}
        disabled={busy || !displayName.trim()}
      >
        {busy ? "Accepting…" : "Accept invite & continue"}
      </Button>
    </div>
  );
}

function Field({
  label,
  value,
  readOnly,
}: {
  label: string;
  value: string;
  readOnly?: boolean;
}) {
  return (
    <div>
      <label className="text-[13px] text-ink-700 font-medium mb-1.5 block">
        {label}
      </label>
      <input
        type="text"
        value={value}
        readOnly={readOnly}
        disabled={readOnly}
        className="w-full h-10 px-3 rounded-md border border-ink-100 bg-ink-100/40 text-[14px] text-ink-500 cursor-not-allowed"
      />
    </div>
  );
}
