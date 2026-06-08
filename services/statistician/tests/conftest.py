# SPDX-License-Identifier: AGPL-3.0-or-later
from __future__ import annotations

import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

SECRET = "test-shared-secret-do-not-use-in-prod"


@pytest.fixture(autouse=True)
def _set_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("STATISTICIAN_SHARED_SECRET", SECRET)


@pytest.fixture
def client() -> TestClient:
    from app.main import app

    return TestClient(app)


def sign(body: bytes) -> str:
    return "sha256=" + hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()


@pytest.fixture
def signed_post(client: TestClient):
    def _post(path: str, json_body: dict) -> "object":
        body = json.dumps(json_body).encode()
        return client.post(
            path,
            content=body,
            headers={
                "x-principe-signature": sign(body),
                "content-type": "application/json",
            },
        )

    return _post
