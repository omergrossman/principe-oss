-- Password auth (additive): add an optional password credential alongside
-- the existing passkey/WebAuthn sign-in. Passkeys are unchanged.

-- scrypt hash, format `scrypt$<saltHex>$<hashHex>`. Nullable: a user with
-- no password signs in with a passkey only. Set at first-run setup or later
-- in Settings → Security.
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;
