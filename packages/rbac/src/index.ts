// SPDX-License-Identifier: AGPL-3.0-or-later
// Session crypto (pure, no IO)
export {
  encodeSession,
  decodeSession,
  DEFAULT_SESSION_COOKIE_NAME,
  DEFAULT_SESSION_MAX_AGE_SEC,
  type BaseSessionPayload,
} from './session'

// WebAuthn ceremony helpers (pure wrappers around @simplewebauthn/server)
export {
  generateAuthOptions,
  verifyAuthResponse,
  generateRegOptions,
  verifyRegResponse,
  type AuthenticatorTransportFuture,
  type GenerateAuthenticationOptionsOpts,
  type VerifyAuthenticationResponseOpts,
  type VerifiedAuthenticationResponse,
  type GenerateRegistrationOptionsOpts,
  type VerifyRegistrationResponseOpts,
  type VerifiedRegistrationResponse,
} from './webauthn'

// Permission type system
export {
  defineRole,
  getRole,
  resolvePermissions,
  hasPermission,
  requirePermission,
  RBACError,
  type Permission,
  type Role,
} from './permissions'

// React provider + client hook (use only in 'use client' trees)
export { RBACProvider, useCan, useRoleId } from './provider'
