// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

const MIN_PASSWORD_LENGTH = 8;

interface Props {
  // Whether the signed-in user already has a password set.
  hasPassword: boolean;
}

export function PasswordForm({ hasPassword }: Props) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirm) {
      setError("Passwords don’t match.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not update password.");
        return;
      }
      setSuccess(
        data.hadPassword ? "Password changed." : "Password set.",
      );
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-3">
      {hasPassword && (
        <label className="block">
          <span className="text-[12px] font-medium text-ink-700 mb-1 block">
            Current password
          </span>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full h-10 px-3 rounded-md border border-ink-100 bg-elevated text-[14px] text-ink-900 placeholder:text-ink-300 focus:border-flare-600 focus:outline-none focus:ring-2 focus:ring-flare-600/20"
          />
        </label>
      )}
      <label className="block">
        <span className="text-[12px] font-medium text-ink-700 mb-1 block">
          {hasPassword ? "New password" : "Password"}
        </span>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="At least 8 characters"
          autoComplete="new-password"
          className="w-full h-10 px-3 rounded-md border border-ink-100 bg-elevated text-[14px] text-ink-900 placeholder:text-ink-300 focus:border-flare-600 focus:outline-none focus:ring-2 focus:ring-flare-600/20"
        />
      </label>
      <label className="block">
        <span className="text-[12px] font-medium text-ink-700 mb-1 block">
          Confirm password
        </span>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          className="w-full h-10 px-3 rounded-md border border-ink-100 bg-elevated text-[14px] text-ink-900 placeholder:text-ink-300 focus:border-flare-600 focus:outline-none focus:ring-2 focus:ring-flare-600/20"
        />
      </label>
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
      <Button
        type="submit"
        variant="primary"
        size="md"
        disabled={submitting || newPassword.length === 0}
      >
        {submitting
          ? "Saving…"
          : hasPassword
            ? "Change password"
            : "Set password"}
      </Button>
    </form>
  );
}
