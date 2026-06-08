// First-run bootstrap stub.
//
// In the SaaS donor repo this module read INSTANCE_TENANT_NAME +
// INSTANCE_ADMIN_EMAIL env vars (set by DP master at provision time) and
// auto-created the Firm + admin User. The OSS distribution has no DP
// master and no env-driven provisioning — first-run setup happens via
// the /setup wizard (Sprint 8 EP-OSS-06), which collects workspace name,
// admin identity, and API keys interactively then writes them through.
//
// This stub keeps existing call sites from breaking while the wizard ships.
// It returns "missing-env" unconditionally so any caller falls through to
// the legacy path or the wizard redirect.

export const MAX_ADMINS_PER_FIRM = 3;

export interface BootstrapResult {
  created: boolean;
  firmId: string | null;
  adminUserId: string | null;
  reason?: "missing-env" | "already-bootstrapped" | "created";
}

export async function ensureInstanceBootstrap(): Promise<BootstrapResult> {
  return {
    created: false,
    firmId: null,
    adminUserId: null,
    reason: "missing-env",
  };
}

export function __resetBootstrapCacheForTesting() {
  // no-op
}
