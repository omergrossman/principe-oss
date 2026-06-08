import { getInviteByToken } from "@/lib/invites/repo";
import { Card } from "@/components/ui/Card";
import { AcceptInviteForm } from "./AcceptInviteForm";

export const dynamic = "force-dynamic";

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const token = params.token?.trim() ?? "";
  const invite = token ? await getInviteByToken(token) : null;

  // Invalid / missing token
  if (!invite) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md">
          <h1 className="text-[24px] font-bold text-ink-900 mb-2 tracking-tight">
            Invite not found
          </h1>
          <p className="text-[14px] text-ink-500 leading-relaxed">
            This invite link is invalid or has been revoked. Ask your admin
            to send you a new one.
          </p>
        </Card>
      </main>
    );
  }

  // Already accepted
  if (invite.acceptedAt) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md">
          <h1 className="text-[24px] font-bold text-ink-900 mb-2 tracking-tight">
            Invite already accepted
          </h1>
          <p className="text-[14px] text-ink-500 leading-relaxed">
            This invite has already been used. <a href="/login" className="text-flare-600 underline">Sign in</a> instead.
          </p>
        </Card>
      </main>
    );
  }

  // Expired
  if (invite.expiresAt < new Date()) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md">
          <h1 className="text-[24px] font-bold text-ink-900 mb-2 tracking-tight">
            Invite expired
          </h1>
          <p className="text-[14px] text-ink-500 leading-relaxed">
            This invite has expired. Ask your admin to send you a new one.
          </p>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <p className="text-[12px] text-flare-600 uppercase tracking-wide font-semibold mb-2">
          Invitation
        </p>
        <h1 className="text-[24px] font-bold text-ink-900 mb-2 tracking-tight">
          Join {invite.firmName}
        </h1>
        <p className="text-[14px] text-ink-500 mb-6 leading-relaxed">
          You&apos;ve been invited as{" "}
          <strong className="text-ink-700">
            {invite.role === "VC_ADMIN" ? "an admin" : "a member"}
          </strong>{" "}
          on Príncipe — synthetic CISO validation for your hypotheses.
          Pick a display name and accept to set up your account.
        </p>
        <AcceptInviteForm
          token={invite.token}
          email={invite.email}
          firmName={invite.firmName}
        />
      </Card>
    </main>
  );
}
