from __future__ import annotations

import hashlib
import hmac
import os

from fastapi import HTTPException, Request, status

SIGNATURE_HEADER = "x-principe-signature"
SIGNATURE_PREFIX = "sha256="


def _get_secret() -> bytes:
    secret = os.environ.get("STATISTICIAN_SHARED_SECRET", "")
    if not secret:
        # In dev with no secret set, refuse to start the verification path —
        # all requests will 401. This makes a missing secret loud, not silent.
        return b""
    return secret.encode("utf-8")


async def verify_signature(request: Request) -> bytes:
    """FastAPI dependency: verifies the HMAC-SHA256 signature of the raw request
    body. Returns the body bytes for downstream handlers to parse. Raises 401
    on any mismatch (constant-time compare). Use this on every protected route."""

    secret = _get_secret()
    if not secret:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Shared secret not configured")

    provided = request.headers.get(SIGNATURE_HEADER, "")
    if not provided.startswith(SIGNATURE_PREFIX):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing signature")

    body = await request.body()
    expected = hmac.new(secret, body, hashlib.sha256).hexdigest()
    given = provided[len(SIGNATURE_PREFIX):]
    if not hmac.compare_digest(expected, given):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid signature")

    return body
