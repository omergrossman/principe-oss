// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";

interface Member {
  membershipId: string;
  userId: string;
  email: string;
  displayName: string;
  role: "ADMIN" | "MEMBER";
  lastSignInAt: string | null;
  isYou: boolean;
}

interface Invite {
  id: string;
  email: string;
  role: "ADMIN" | "MEMBER";
  expiresAt: string;
  createdAt: string;
}

interface AdminQuota {
  current: number;
  pending: number;
  remaining: number;
  cap: number;
}

export function MembersAdminClient({
  members,
  invites,
  adminQuota,
  keyConnected,
}: {
  members: Member[];
  invites: Invite[];
  adminQuota: AdminQuota;
  keyConnected: boolean;
}) {
  const router = useRouter();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "MEMBER">("MEMBER");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lastCreatedLink, setLastCreatedLink] = useState<{
    email: string;
    link: string;
  } | null>(null);

  async function createInvite() {
    setError("");
    setLastCreatedLink(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not create invite.");
        return;
      }
      setLastCreatedLink({
        email: data.invite.email,
        link: data.link,
      });
      setInviteEmail("");
      setInviteRole("MEMBER");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string, email: string) {
    if (
      !confirm(
        `Revoke the invite for ${email}? The link will stop working immediately.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/invites/${id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not revoke invite.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const adminCapExhausted =
    inviteRole === "ADMIN" && adminQuota.remaining <= 0;

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-[18px] font-semibold text-ink-900 mb-1">
          Invite a teammate
        </h2>
        <p className="text-[13px] text-ink-500 mb-3">
          Generate an invite link for their email, valid for 7 days. Send
          it to them however you like — the link appears below to copy once
          it&apos;s created.
        </p>
        {!keyConnected && (
          <p className="text-[13px] text-ink-700 bg-flare-100 border border-flare-600/30 px-3 py-2 rounded-md mb-3">
            This workspace has no Anthropic key yet. People you invite can
            sign in, but won&apos;t be able to run asks until you add one in{" "}
            <a
              href="/settings"
              className="underline underline-offset-4 hover:text-ink-900"
            >
              Settings
            </a>
            .
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="teammate@firm.com"
            disabled={busy}
            className="flex-1 h-10 px-3 rounded-md border border-ink-100 bg-elevated text-[14px] text-ink-900 disabled:opacity-50"
          />
          <select
            value={inviteRole}
            onChange={(e) =>
              setInviteRole(e.target.value as "ADMIN" | "MEMBER")
            }
            disabled={busy}
            className="h-10 px-3 rounded-md border border-ink-100 bg-elevated text-[14px] text-ink-900 disabled:opacity-50"
          >
            <option value="MEMBER">Member</option>
            <option value="ADMIN">Admin</option>
          </select>
          <Button
            variant="primary"
            size="md"
            onClick={createInvite}
            disabled={busy || !inviteEmail.trim() || adminCapExhausted}
          >
            Create invite link
          </Button>
        </div>
        <p className="text-[12px] text-ink-300 mt-2">
          Admin slots: {adminQuota.current} active · {adminQuota.pending}{" "}
          pending · {adminQuota.remaining} of {adminQuota.cap} remaining.
        </p>
        {adminCapExhausted && (
          <p className="text-[12px] text-verdict-fail mt-1">
            Admin cap reached. Revoke a pending admin invite or remove an
            existing admin before inviting another.
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="text-[13px] text-verdict-fail bg-verdict-fail/10 px-3 py-2 rounded-md mt-3"
          >
            {error}
          </p>
        )}
        {lastCreatedLink && (
          <div className="mt-3 p-3 rounded-md bg-verdict-pass/10 border border-verdict-pass/30">
            <p className="text-[13px] text-ink-700 mb-2">
              Invite created for{" "}
              <strong>{lastCreatedLink.email}</strong>. Share this link with
              them:
            </p>
            <CopyableLink link={lastCreatedLink.link} />
          </div>
        )}
      </section>

      <section>
        <h2 className="text-[18px] font-semibold text-ink-900 mb-3">
          Pending invites ({invites.length})
        </h2>
        {invites.length === 0 ? (
          <p className="text-[13px] text-ink-300 italic">No pending invites.</p>
        ) : (
          <ul className="space-y-2">
            {invites.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-md border border-ink-100"
              >
                <div className="min-w-0">
                  <p className="text-[14px] text-ink-900 truncate">
                    {inv.email}
                  </p>
                  <p className="text-[11px] text-ink-300 font-mono">
                    {inv.role.toLowerCase()} · expires{" "}
                    {new Date(inv.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => revoke(inv.id, inv.email)}
                  disabled={busy}
                  className="text-[12px] text-ink-500 hover:text-verdict-fail font-mono"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-[18px] font-semibold text-ink-900 mb-3">
          Members ({members.length})
        </h2>
        <ul className="space-y-2">
          {members.map((m) => (
            <li
              key={m.membershipId}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-md border border-ink-100"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[14px] text-ink-900 truncate">
                  {m.displayName}{" "}
                  {m.isYou && (
                    <span className="text-[11px] text-ink-300 font-mono ml-1">
                      (you)
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-ink-300 font-mono truncate">
                  {m.email} ·{" "}
                  {m.lastSignInAt
                    ? `last seen ${new Date(m.lastSignInAt).toLocaleDateString()}`
                    : "never signed in"}
                </p>
              </div>
              <Pill tone={m.role === "ADMIN" ? "accent" : "default"}>
                {m.role.toLowerCase()}
              </Pill>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function CopyableLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={link}
        readOnly
        className="flex-1 h-9 px-2 rounded-md border border-ink-100 bg-canvas text-[12px] text-ink-700 font-mono"
        onFocus={(e) => e.currentTarget.select()}
      />
      <Button
        variant="secondary"
        size="sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            // clipboard blocked; user can still select manually
          }
        }}
      >
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
