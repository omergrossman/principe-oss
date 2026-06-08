from __future__ import annotations

from fastapi.testclient import TestClient


def test_healthz_unsigned(client: TestClient) -> None:
    r = client.get("/healthz")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert "version" in body


def test_verdict_pass_path(signed_post) -> None:
    r = signed_post(
        "/verdict",
        {
            "panelComposition": {
                "personaCount": 30,
                "regions": ["us", "uk"],
                "industries": ["fintech"],
            },
            "hypothesisText": "CISOs in regulated industries prefer agent-based EDR over agentless when audit logging is mandated.",
            "questionType": "feature-preference",
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["verdict"] == "PASS"
    assert body["stub"] is True
    assert isinstance(body["reasoningTrace"], str)


def test_verdict_fail_when_size_below_floor(signed_post) -> None:
    r = signed_post(
        "/verdict",
        {
            "panelComposition": {"personaCount": 10, "regions": ["us", "uk"]},
            "hypothesisText": "h",
            "questionType": "q",
        },
    )
    assert r.status_code == 200
    assert r.json()["verdict"] == "FAIL"


def test_verdict_warn_when_one_region(signed_post) -> None:
    r = signed_post(
        "/verdict",
        {
            "panelComposition": {"personaCount": 50, "regions": ["us"]},
            "hypothesisText": "h",
            "questionType": "q",
        },
    )
    assert r.status_code == 200
    assert r.json()["verdict"] == "WARN"


def test_verdict_400_on_missing_required_field(signed_post) -> None:
    r = signed_post(
        "/verdict",
        {
            "panelComposition": {"personaCount": 30, "regions": ["us", "uk"]},
            # hypothesisText missing
            "questionType": "q",
        },
    )
    assert r.status_code == 400


def test_verdict_400_on_invalid_json(client: TestClient) -> None:
    import hashlib
    import hmac

    secret = "test-shared-secret-do-not-use-in-prod"
    body = b"not-json"
    sig = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    r = client.post(
        "/verdict",
        content=body,
        headers={"x-principe-signature": sig, "content-type": "application/json"},
    )
    assert r.status_code == 400


def test_verdict_413_when_content_length_exceeds_cap(client: TestClient) -> None:
    big = b"x" * (256 * 1024 + 1)
    r = client.post(
        "/verdict",
        content=big,
        headers={
            "content-type": "application/json",
            "content-length": str(len(big)),
            "x-principe-signature": "sha256=deadbeef",
        },
    )
    assert r.status_code == 413
    assert r.json()["error"] == "PayloadTooLarge"
