import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

/**
 * /login layout — fresh-install gate.
 *
 * If no users exist yet, bounce to /setup so the visitor lands on the
 * first-run wizard instead of a login form with nothing to log into.
 * Once any user has been created, /login behaves normally.
 */
export default async function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const userCount = await prisma.user.count();
  if (userCount === 0) {
    redirect("/setup");
  }
  return children;
}
