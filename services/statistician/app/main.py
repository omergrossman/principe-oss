from __future__ import annotations

import json
import os
from typing import Awaitable, Callable

from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from .auth import verify_signature
from .bayesian import BAYESIAN_AVAILABLE, compute_verdict_pymc
from .calibration import CalibrationLoadError, load_calibration
from .models import VerdictRequest, VerdictResponse
from .verdict import compute_verdict as compute_verdict_stub

# Per Story 04.1 AC: request bodies larger than this return HTTP 413
# Payload Too Large. The Next.js client raises a typed PayloadTooLargeError
# and does NOT retry on this status.
MAX_BODY_BYTES = 256 * 1024  # 256 KB

app = FastAPI(
    title="Principe Statistician",
    version=os.environ.get("GIT_SHA", "dev"),
    description=(
        "Sprint 3 — PyMC hierarchical Bayesian verdict when available; "
        "falls back to the Sprint 2 stub heuristic if PyMC isn't importable "
        "(local Python 3.9 dev). The `stub` field in the response reflects "
        "which path served the request."
    ),
)


@app.on_event("startup")
async def _startup_load_calibration() -> None:
    # AC: missing/invalid calibration must fail loudly at startup. We
    # surface the load attempt eagerly so Modal logs the error.
    try:
        data = load_calibration()
        print(f"[startup] Loaded calibration dataset: {data['dataset_id']}")
    except CalibrationLoadError as e:
        print(f"[startup] ERROR: {e}")
        raise
    if BAYESIAN_AVAILABLE:
        print("[startup] PyMC available; serving real Bayesian verdicts")
    else:
        print("[startup] PyMC NOT available; falling back to stub heuristic")


@app.middleware("http")
async def cap_body_size(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    """Rejects oversized requests before they reach handlers.

    Trusts Content-Length when present (cheap path). When absent (e.g. chunked
    transfers), reads the body once and lets handlers re-read it from the
    request scope cache."""

    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            if int(content_length) > MAX_BODY_BYTES:
                return JSONResponse(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    content={
                        "error": "PayloadTooLarge",
                        "message": f"Request body exceeds {MAX_BODY_BYTES} bytes",
                        "limitBytes": MAX_BODY_BYTES,
                    },
                )
        except ValueError:
            pass

    return await call_next(request)


@app.get("/healthz")
async def healthz() -> dict:
    return {"ok": True, "version": os.environ.get("GIT_SHA", "dev")}


@app.post("/verdict", response_model=VerdictResponse)
async def verdict(body: bytes = Depends(verify_signature)) -> VerdictResponse:
    # Second guard for chunked transfers where Content-Length is absent.
    if len(body) > MAX_BODY_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Request body exceeds {MAX_BODY_BYTES} bytes",
        )

    try:
        payload = json.loads(body) if body else {}
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid JSON: {e.msg}",
        )

    try:
        req = VerdictRequest.model_validate(payload)
    except ValidationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.errors())

    # Sprint 3 — try PyMC first; fall back to the Sprint 2 stub if PyMC
    # isn't importable (local Python 3.9 dev). The response's `stub` flag
    # truthfully reports which path served the verdict.
    if BAYESIAN_AVAILABLE:
        try:
            result = compute_verdict_pymc(
                req.panelComposition,
                hypothesis_text=req.hypothesisText,
                question_type=req.questionType,
                region_distribution=req.regionDistribution,
                target_distribution=req.targetDistribution,
                industry_distribution=req.industryDistribution,
                target_industry_distribution=req.targetIndustryDistribution,
                agreement_observations=req.agreementObservations,
            )
            if result is not None:
                return result
        except Exception as e:
            # Sampling can diverge on degenerate inputs. Surface as 500
            # so the Next.js client retries per its existing 5x60s logic.
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"InferenceFailure: {e}"[:500],
            )

    return compute_verdict_stub(req.panelComposition)
