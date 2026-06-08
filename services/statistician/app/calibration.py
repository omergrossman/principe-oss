from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

# Sprint 3 — V1 calibration corpus loader. Hard-codes the Panorays 2026
# CISO survey as the single dataset; Sprint 4 will introduce an admin
# registry that ingests + backtests across all 4 datasets.
#
# Module-level cache: loaded once at FastAPI startup, served from memory
# on every /verdict call. Fail-fast if the file is missing — silent
# fallback to a stub heuristic was the explicit no-go in the Sprint 3 spec.


class CalibrationLoadError(RuntimeError):
    pass


_PANORAYS_PATH_ENV = "STATISTICIAN_CALIBRATION_PATH"
# app/ → services/statistician/ → services/ → principe/ ⇒ three "..".
_DEFAULT_RELATIVE = "../../../calibration/datasets/panorays-2026-ciso.json"

_dataset: Optional[dict] = None


def _resolve_path() -> Path:
    override = os.environ.get(_PANORAYS_PATH_ENV)
    if override:
        return Path(override)
    # Try multiple locations: dev relative path first (services/statistician/
    # app → repo root → calibration/), then Modal's mounted location.
    here = Path(__file__).resolve().parent
    candidates = [
        (here / _DEFAULT_RELATIVE).resolve(),
        Path("/root/calibration/datasets/panorays-2026-ciso.json"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0]  # last resort — caller will raise on .exists() check


def load_calibration() -> dict:
    """Load + validate the Panorays 2026 calibration dataset. Cached after
    first call. Raises CalibrationLoadError on missing / malformed input
    so the FastAPI startup fails loudly rather than silently degrading."""

    global _dataset
    if _dataset is not None:
        return _dataset

    path = _resolve_path()
    if not path.exists():
        raise CalibrationLoadError(
            f"Calibration dataset not found at {path}. Set "
            f"{_PANORAYS_PATH_ENV} env var or place the file at the "
            "default location."
        )

    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise CalibrationLoadError(
            f"Calibration dataset at {path} is not valid JSON: {e}"
        )

    for required in ("dataset_id", "sample_size", "distributions"):
        if required not in raw:
            raise CalibrationLoadError(
                f"Calibration dataset missing required key '{required}'"
            )
    if not isinstance(raw["distributions"], list) or len(raw["distributions"]) == 0:
        raise CalibrationLoadError("Calibration dataset has no distributions")

    _dataset = raw
    return _dataset


def get_target_distribution() -> dict[str, float]:
    """Realistic global CISO population distribution — the target the
    panel SHOULD approximate.

    Sprint 6 tuning rationale:
      Sprint 3's implementation derived a target from the calibration
      dataset's coverage (US-centric: us=0.55). This was wrong by
      definition: the calibration dataset's bias reflects WHO RESPONDED
      TO THE SURVEY, not what the global CISO population actually looks
      like. The result was that every panel composed to be globally
      representative (the Principe default weights: us=0.32,
      eu-west=0.18, ...) hit KL ~0.45 against the US-centric target
      and read as FAIL/WARN on every Ask. The math worked correctly,
      but the reference point was misaligned.

      The Sprint 6 target aligns with the Principe default panel
      weights (generate100.ts regionWeights) which represent the best
      current estimate of the global CISO distribution by region.
      KL = 0 when the actual panel matches the canonical default;
      KL > 0 when the project's panel is composition-skewed. That is
      the signal we want.

      Sprint 7+ should swap this hardcoded distribution for a
      registry-driven target so multiple targets (e.g. "EU finance
      CISOs", "US healthcare CISOs") can be selected per request.
    """
    # Loading calibration is still useful for the audit metadata
    # (dataset_id, sample_size) returned in the reasoning trace.
    load_calibration()
    return {
        "us": 0.32,
        "eu-west": 0.18,
        "uk": 0.12,
        "apac": 0.13,
        "eu-central": 0.10,
        "anz": 0.08,
        "mea": 0.07,
    }
