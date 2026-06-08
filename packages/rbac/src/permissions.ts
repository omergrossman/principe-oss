/**
 * Role / Permission type system.
 *
 * A permission is a string in dotted form — by convention `"<resource>.<verb>"`
 * (e.g. `"tenant.delete"`, `"agent.approve"`). The package doesn't validate
 * the shape; consumers are free to use any string they want.
 *
 * A role bundles a list of permissions and optionally inherits from other
 * roles. Roles form a DAG: `fable.tenant-owner` may inherit `dp.founder`
 * which inherits `dp.admin` which inherits `dp.member`.
 *
 * The registry is module-scoped (`ROLE_REGISTRY`). Consumers register roles
 * once at app startup via `defineRole()`, then call `hasPermission()` /
 * `requirePermission()` at the point of use.
 *
 * Ships three base roles (`dp.member`, `dp.admin`, `dp.founder`) so every
 * DP-built product has a sensible starting point. Projects layer their own
 * roles on top via `defineRole({ inherits: ['dp.admin'], ... })`.
 */

export type Permission = string

export interface Role {
  id: string
  inherits?: string[]
  permissions: Permission[]
}

const ROLE_REGISTRY = new Map<string, Role>()

/**
 * Register (or overwrite) a role. Idempotent — call it as many times as you
 * like; the last definition wins. Typically called once per role at app
 * startup.
 */
export function defineRole(role: Role): void {
  ROLE_REGISTRY.set(role.id, role)
}

/** Look up a role by id. Useful for tests and introspection tools. */
export function getRole(id: string): Role | undefined {
  return ROLE_REGISTRY.get(id)
}

/**
 * Walk the inheritance chain and collect every permission the role grants.
 * Cycle-safe (a role can't pull itself in twice). Returns a fresh Set so
 * callers can mutate freely.
 */
export function resolvePermissions(roleId: string): Set<Permission> {
  const visited = new Set<string>()
  const perms = new Set<Permission>()
  function walk(id: string) {
    if (visited.has(id)) return
    visited.add(id)
    const role = ROLE_REGISTRY.get(id)
    if (!role) return
    for (const p of role.permissions) perms.add(p)
    for (const inh of role.inherits ?? []) walk(inh)
  }
  walk(roleId)
  return perms
}

export function hasPermission(roleId: string, perm: Permission): boolean {
  return resolvePermissions(roleId).has(perm)
}

/**
 * Server-side guard. Throws `RBACError` if the caller's role lacks the
 * required permission. Designed for use inside route handlers / server
 * actions:
 *
 *   requirePermission(session.role, 'tenant.delete')
 *   await prisma.tenant.delete({ where: { id } })
 */
export function requirePermission(roleId: string, perm: Permission): void {
  if (!hasPermission(roleId, perm)) {
    throw new RBACError(`Missing permission: ${perm}`)
  }
}

export class RBACError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RBACError'
  }
}

// ─── Base roles every DP product gets ──────────────────────────────────────
// Kept intentionally small. Projects extend by calling `defineRole()` with
// `inherits: ['dp.admin']` (etc.) at boot.

defineRole({ id: 'dp.member', permissions: [] })
defineRole({
  id: 'dp.admin',
  inherits: ['dp.member'],
  permissions: ['tenant.read'],
})
defineRole({
  id: 'dp.founder',
  inherits: ['dp.admin'],
  permissions: ['tenant.create', 'tenant.delete', 'billing.manage'],
})
