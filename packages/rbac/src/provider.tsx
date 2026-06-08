// SPDX-License-Identifier: AGPL-3.0-or-later
'use client'

/**
 * Client-side RBAC context + `useCan` hook.
 *
 * The consumer wraps its protected app tree with `<RBACProvider roleId={...}>`
 * — typically pulling `roleId` from a server-rendered session/membership row
 * and passing it as a prop. The provider resolves the role's permissions
 * once (memoized) so child `useCan(perm)` calls are O(1) Set lookups.
 *
 * Server components should NOT use this hook — they have direct access to
 * the session and can call `hasPermission(roleId, perm)` directly. This
 * provider is for interactive client components that need to hide/show
 * actions based on the current user's role.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { resolvePermissions, type Permission } from './permissions'

interface RBACContextValue {
  roleId: string
  permissions: Set<Permission>
}

const RBACContext = createContext<RBACContextValue | null>(null)

export function RBACProvider({
  roleId,
  children,
}: {
  roleId: string
  children: ReactNode
}): React.ReactElement {
  const value = useMemo<RBACContextValue>(
    () => ({ roleId, permissions: resolvePermissions(roleId) }),
    [roleId],
  )
  return <RBACContext.Provider value={value}>{children}</RBACContext.Provider>
}

/**
 * Returns `true` iff the current role has the given permission. Returns
 * `false` when called outside an `<RBACProvider>` — fail-closed so a missing
 * provider doesn't accidentally unlock actions.
 */
export function useCan(perm: Permission): boolean {
  const ctx = useContext(RBACContext)
  if (!ctx) return false
  return ctx.permissions.has(perm)
}

/**
 * Returns the active role id, or `null` outside an `<RBACProvider>`.
 * Occasionally useful for analytics / debug overlays.
 */
export function useRoleId(): string | null {
  const ctx = useContext(RBACContext)
  return ctx?.roleId ?? null
}
