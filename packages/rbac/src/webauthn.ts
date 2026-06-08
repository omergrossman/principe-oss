/**
 * WebAuthn ceremony helpers — pure wrappers around `@simplewebauthn/server`.
 *
 * These helpers are stateless: they don't read or write a database, and they
 * don't touch cookies. They take the inputs the consumer already has (the
 * authenticator response, the expected challenge, the credential record from
 * the consumer's storage, etc.) and return the verification result.
 *
 * The consumer (e.g. Fable's `api/auth/login` and `api/auth/register` route
 * handlers) keeps the DB lookups: pull the user's challenge, pull the
 * credential row, then hand both to these helpers.
 *
 * Re-exports the `AuthenticatorTransportFuture` type so consumers don't need
 * a direct dep on `@simplewebauthn/server` just for the type.
 */

import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  generateRegistrationOptions,
  verifyRegistrationResponse,
  type GenerateAuthenticationOptionsOpts,
  type VerifyAuthenticationResponseOpts,
  type VerifiedAuthenticationResponse,
  type GenerateRegistrationOptionsOpts,
  type VerifyRegistrationResponseOpts,
  type VerifiedRegistrationResponse,
  type AuthenticatorTransportFuture,
} from '@simplewebauthn/server'

export type {
  AuthenticatorTransportFuture,
  GenerateAuthenticationOptionsOpts,
  VerifyAuthenticationResponseOpts,
  VerifiedAuthenticationResponse,
  GenerateRegistrationOptionsOpts,
  VerifyRegistrationResponseOpts,
  VerifiedRegistrationResponse,
}

/**
 * Generate options for a WebAuthn authentication ceremony.
 *
 * Returns the same `PublicKeyCredentialRequestOptionsJSON` shape that
 * `@simplewebauthn/server` returns — the consumer hands it back to the
 * browser unchanged.
 */
export function generateAuthOptions(opts: GenerateAuthenticationOptionsOpts) {
  return generateAuthenticationOptions(opts)
}

/**
 * Verify a WebAuthn authentication response against a stored credential.
 *
 * The consumer is responsible for looking the credential up in its store
 * (by `body.id`) and passing the resulting public-key material in via the
 * `credential` option. This package never touches the consumer's DB.
 */
export function verifyAuthResponse(opts: VerifyAuthenticationResponseOpts) {
  return verifyAuthenticationResponse(opts)
}

/**
 * Generate options for a WebAuthn registration ceremony.
 */
export function generateRegOptions(opts: GenerateRegistrationOptionsOpts) {
  return generateRegistrationOptions(opts)
}

/**
 * Verify a WebAuthn registration attestation. On success the consumer should
 * persist the returned `credential` (id + publicKey + counter + transports)
 * to its own store keyed by the user id.
 */
export function verifyRegResponse(opts: VerifyRegistrationResponseOpts) {
  return verifyRegistrationResponse(opts)
}
