# SPDX-License-Identifier: AGPL-3.0-or-later
from __future__ import annotations

import hashlib
import hmac
import json

from fastapi.testclient import TestClient


def test_verdict_401_when_signature_header_missing(client: TestClient) -> None:
    r = client.post(
        "/verdict",
        json={
            "panelComposition": {"personaCount": 30, "regions": ["us", "uk"]},
            "hypothesisText": "h",
            "questionType": "q",
        },
    )
    assert r.status_code == 401


def test_verdict_401_when_signature_invalid(client: TestClient) -> None:
    body = json.dumps(
        {
            "panelComposition": {"personaCount": 30, "regions": ["us", "uk"]},
            "hypothesisText": "h",
            "questionType": "q",
        }
    ).encode()
    r = client.post(
        "/verdict",
        content=body,
        headers={
            "x-principe-signature": "sha256=" + "0" * 64,
            "content-type": "application/json",
        },
    )
    assert r.status_code == 401


def test_verdict_401_when_secret_not_configured(monkeypatch, client: TestClient) -> None:
    monkeypatch.setenv("STATISTICIAN_SHARED_SECRET", "")
    body = b"{}"
    sig = "sha256=" + hmac.new(b"", body, hashlib.sha256).hexdigest()
    r = client.post(
        "/verdict",
        content=body,
        headers={"x-principe-signature": sig, "content-type": "application/json"},
    )
    assert r.status_code == 401
