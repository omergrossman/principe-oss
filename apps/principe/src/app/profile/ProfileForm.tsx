// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function ProfileForm({
  initialDisplayName,
  email,
  organisationName,
}: {
  initialDisplayName: string;
  email: string;
  organisationName: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialDisplayName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function save() {
    setError("");
    setSuccess("");
    const trimmed = name.trim();
    if (trimmed.length < 1) {
      setError("Display name can't be empty.");
      return;
    }
    if (trimmed.length > 60) {
      setError("Display name is too long (max 60 characters).");
      return;
    }
    if (trimmed === initialDisplayName) {
      setSuccess("No change.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not save.");
        return;
      }
      setSuccess("Saved.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-[14px] font-semibold text-ink-900 mb-1">
          Display name
        </h3>
        <p className="text-[12px] text-ink-500 mb-3">
          How others see you in Principe. Use a nickname if you prefer.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            maxLength={60}
            placeholder="Your name"
            className="flex-1 h-10 px-3 rounded-md border border-ink-100 bg-elevated text-[14px] text-ink-900 disabled:opacity-50"
          />
          <Button
            variant="primary"
            size="md"
            onClick={save}
            disabled={busy || name.trim().length < 1}
          >
            Save
          </Button>
        </div>
      </div>

      <LockedField
        label="Email"
        value={email}
        hint="Set during initial setup and used as your account identity."
      />

      <LockedField
        label="Organisation"
        value={organisationName}
        hint="Managed by your admin. Members can't change this."
      />

      {error && (
        <p
          role="alert"
          className="text-[13px] text-verdict-fail bg-verdict-fail/10 px-3 py-2 rounded-md"
        >
          {error}
        </p>
      )}
      {success && (
        <p className="text-[13px] text-verdict-pass bg-verdict-pass/10 px-3 py-2 rounded-md">
          {success}
        </p>
      )}
    </div>
  );
}

function LockedField({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="pt-5 border-t border-ink-100">
      <h3 className="text-[14px] font-semibold text-ink-900 mb-1">{label}</h3>
      <p className="text-[12px] text-ink-500 mb-3">{hint}</p>
      <input
        type="text"
        value={value}
        readOnly
        disabled
        className="w-full h-10 px-3 rounded-md border border-ink-100 bg-ink-100/40 text-[14px] text-ink-500 cursor-not-allowed"
      />
    </div>
  );
}
