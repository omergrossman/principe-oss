import Link from "next/link";
import { requireAuth } from "@/lib/auth/require-auth";
import { AppTopBar } from "@/components/app/AppTopBar";
import { ProjectWizard } from "./ProjectWizard";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const session = await requireAuth("/projects/new");
  if (!session.firmId) {
    return <p className="p-8 text-ink-500">Organisation required.</p>;
  }
  return (
    <>
      <AppTopBar />
      <main className="max-w-4xl mx-auto px-8 py-10">
        <nav className="flex items-center gap-2 text-[13px] text-ink-300 mb-3 font-mono">
          <Link href="/projects" className="hover:text-ink-700">
            projects
          </Link>
          <span>›</span>
          <span className="text-ink-700">new</span>
        </nav>
        <header className="mb-6">
          <p className="text-[12px] text-flare-600 uppercase tracking-wide font-semibold mb-2">
            New project
          </p>
          <h1 className="text-[36px] font-bold text-ink-900 tracking-tight">
            Compose your panel
          </h1>
          <p className="text-ink-500 mt-2 max-w-2xl">
            Pick a preset for the fast path, or open <strong>Custom</strong> to
            tune regions, industries, stance, and company size. 100 agents
            are materialised when you create.
          </p>
        </header>
        <ProjectWizard />
      </main>
    </>
  );
}
