import Link from "next/link";
import { Card } from "@/components/ui/Card";

/**
 * Self-service signup is closed in V1. Principe is delivered per
 * customer with the first admin seeded by the Delivery Platform; new
 * teammates join via invite links from their admin.
 *
 * The legacy /api/auth/signup endpoint is still in the codebase but no
 * longer linked from anywhere user-facing. If someone hits /signup
 * directly we tell them to ask their admin.
 */
export default function SignupPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <h1 className="text-[24px] font-bold text-ink-900 mb-2 tracking-tight">
          Sign-up is invite-only
        </h1>
        <p className="text-[14px] text-ink-500 mb-4 leading-relaxed">
          Príncipe is delivered per organisation. Ask your admin to send
          you an invite link — you&apos;ll join your team&apos;s workspace
          from there.
        </p>
        <p className="text-[13px] text-ink-300">
          Already set up?{" "}
          <Link href="/login" className="text-flare-600 hover:text-flare-500">
            Sign in
          </Link>
        </p>
      </Card>
    </main>
  );
}
