// SPDX-License-Identifier: AGPL-3.0-or-later
import { requireAuth } from "@/lib/auth/require-auth";
import { AppTopBar } from "@/components/app/AppTopBar";

/**
 * /about — the Eddington story + acknowledgements.
 */

export const metadata = {
  title: "About — Príncipe",
  description:
    "Why Príncipe? The 1919 island that proved Einstein right — and what that means for your cybersecurity idea.",
};

export default async function AboutPage() {
  const session = await requireAuth("/about");
  return (
    <>
      <AppTopBar />
      <main className="bg-canvas">
        <article className="max-w-3xl mx-auto px-8 py-16">
          <p className="text-[12px] text-flare-600 uppercase tracking-wide font-semibold mb-3">
            Why Príncipe
          </p>
          <h1 className="text-[52px] font-bold text-ink-900 tracking-tight leading-[1.05] mb-8">
            An island. An eclipse.<br />A theory worth proving.
          </h1>

          <section className="space-y-5 text-[16px] leading-relaxed text-ink-700">
            <p>
              In May 1919, the British astrophysicist <strong>Arthur Eddington</strong>{" "}
              sailed to a small volcanic island off the west coast of Africa called
              <strong> Príncipe</strong>. He went to watch the sky go dark.
            </p>
            <p>
              For a few minutes during a total solar eclipse, the moon blocked
              the sun and made it possible — for the first time — to see the
              stars sitting just behind it. Eddington photographed those stars
              and measured how far they appeared to shift from where they
              should have been.
            </p>
            <p>
              That shift was the proof of a theory the world had not yet
              accepted: that <strong>gravity bends light</strong>. That spacetime
              is curved. That a quiet patent clerk turned physicist named
              Einstein had, against the consensus of his entire field, been
              right.
            </p>
            <p>
              Príncipe didn&apos;t prove relativity by accident. The island was
              chosen because it was the only place on earth where you could see
              the eclipse against the right background of stars. To prove
              something extraordinary, Eddington had to{" "}
              <strong>look from a different angle</strong> — somewhere nobody
              had thought to stand.
            </p>
          </section>

          <section className="my-12 py-8 border-y border-ink-100">
            <p className="text-[20px] leading-relaxed text-ink-900 italic font-medium">
              Your cybersecurity idea is worth proving.
            </p>
            <p className="text-[16px] leading-relaxed text-ink-700 mt-4">
              Whether you&apos;re a <strong>founder</strong> about to spend a
              year of runway hunting for a hundred real CISOs, a{" "}
              <strong>VC</strong> stress-testing an investment thesis without
              ever sitting across from the buyer, or a <strong>security
              leader</strong> betting your next roadmap on an unverified
              hunch — Príncipe lets you measure the idea from a hundred
              different angles in an afternoon. We won&apos;t tell you
              whether your idea is right. We&apos;ll show you where the sky
              shifts — and where it doesn&apos;t.
            </p>
            <p className="text-[16px] leading-relaxed text-ink-700 mt-4">
              That&apos;s the only useful definition of validation we know.
            </p>
          </section>

          <section className="mt-16">
            <h2 className="text-[14px] uppercase tracking-wide font-semibold text-ink-500 mb-6">
              The author and the agent behind it
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <HumanCard
                portrait={
                  <HumanPhoto src="/team/omer.png" alt="Omer Grossman" />
                }
                name="Omer Grossman"
                role="Builder"
                accent="#2C7E7D"
                bio="Two decades in cybersecurity — CyberArk, the IDF, and a handful of advisory roles in between. Príncipe is what happens when that experience gets pointed at the moment before the first hire, when a founder is still trying to figure out whether they're solving a real problem."
              />
              <HumanCard
                portrait={<ClaudeSprite />}
                name="Claude"
                role="Acting CTO"
                accent="#E0671E"
                bio="The chair is open. Until a co-founder CTO joins, Claude is holding the keyboard — pair-programming the agents, drafting the runbooks, and shipping the prototypes. If you read code like a story and care about getting validation right, the chair is yours."
              />
            </div>
          </section>

          <footer className="mt-16 pt-8 border-t border-ink-100 text-[12px] text-ink-300 font-mono">
            <p>
              Eddington&apos;s 1919 photographic plate is the image you saw on
              the launch screen. The original is in the archive of the Royal
              Astronomical Society.
            </p>
          </footer>
        </article>
      </main>
    </>
  );
}

function HumanCard({
  portrait,
  name,
  role,
  accent,
  bio,
}: {
  portrait: React.ReactNode;
  name: string;
  role: string;
  accent: string;
  bio: string;
}) {
  return (
    <div
      className="rounded-xl bg-elevated p-5 border-2 border-ink-900"
      style={{ boxShadow: `0 4px 0 ${accent}, 0 14px 28px rgba(10,20,48,0.08)` }}
    >
      <div className="flex items-center gap-4 mb-3">
        {portrait}
        <div className="flex-1 min-w-0">
          <p className="text-[16px] font-bold text-ink-900 tracking-tight">
            {name}
          </p>
          <p className="text-[12px] font-mono uppercase tracking-wide" style={{ color: accent }}>
            {role}
          </p>
        </div>
      </div>
      <p className="text-[13px] text-ink-700 leading-relaxed">{bio}</p>
    </div>
  );
}

function HumanPhoto({ src, alt }: { src: string; alt: string }) {
  return (
    <div
      className="shrink-0 overflow-hidden border-2 border-ink-900 rounded-2xl"
      style={{ width: 88, height: 88, background: "#DAEAE7" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
    </div>
  );
}

function ClaudeSprite() {
  return (
    <div
      className="shrink-0 overflow-hidden border-2 border-ink-900 rounded-2xl"
      style={{ width: 88, height: 88, background: "#FCF1E5" }}
    >
      <svg viewBox="0 0 80 80" width="100%" height="100%" role="img" aria-label="Claude">
        <rect width="80" height="80" fill="#FCF1E5" />
        <circle cx="40" cy="40" r="22" fill="#F8DEC6" opacity="0.8" />
        <g transform="translate(40 40)">
          <rect x="-2.6" y="-26" width="5.2" height="52" rx="2.6" fill="#D97757" />
          <rect x="-22" y="-2.6" width="44" height="5.2" rx="2.6" fill="#D97757" />
          <rect x="-2.4" y="-20" width="4.8" height="40" rx="2.4" fill="#D97757" transform="rotate(45)" />
          <rect x="-2.4" y="-16" width="4.8" height="32" rx="2.4" fill="#D97757" transform="rotate(-45)" />
        </g>
      </svg>
    </div>
  );
}
