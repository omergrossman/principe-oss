// SPDX-License-Identifier: AGPL-3.0-or-later

// Force dynamic rendering — the page uses useSearchParams() which
// Next.js 16 requires to be inside a Suspense boundary OR on a
// dynamically-rendered route. Dynamic is the right choice here
// because /re-auth is per-user (passkey ceremony) and never benefits
// from static prerendering.
export const dynamic = "force-dynamic";

export default function ReAuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
