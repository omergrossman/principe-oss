# SPDX-License-Identifier: AGPL-3.0-or-later
from __future__ import annotations

from app.models import PanelComposition
from app.verdict import MIN_PERSONAS_FOR_PASS, MIN_REGIONS_FOR_PASS, compute_verdict


def _panel(n: int, regions: list[str]) -> PanelComposition:
    return PanelComposition(personaCount=n, regions=regions, industries=[])


def test_pass_when_size_and_regions_meet_floors() -> None:
    v = compute_verdict(_panel(MIN_PERSONAS_FOR_PASS, ["us", "uk"]))
    assert v.verdict == "PASS"
    assert v.recommendedN == MIN_PERSONAS_FOR_PASS
    assert v.credibleInterval.low < v.credibleInterval.high
    assert v.stub is True


def test_fail_when_size_below_floor() -> None:
    v = compute_verdict(_panel(MIN_PERSONAS_FOR_PASS - 1, ["us", "uk"]))
    assert v.verdict == "FAIL"
    assert "below the V1 stub floor" in v.reasoningTrace
    assert v.recommendedN == MIN_PERSONAS_FOR_PASS


def test_warn_when_only_one_region() -> None:
    v = compute_verdict(_panel(MIN_PERSONAS_FOR_PASS, ["us"]))
    assert v.verdict == "WARN"
    assert "region" in v.reasoningTrace.lower()


def test_size_fail_dominates_region_warn() -> None:
    # Below-size with single region: FAIL beats WARN.
    v = compute_verdict(_panel(5, ["us"]))
    assert v.verdict == "FAIL"


def test_blank_regions_collapse_to_zero() -> None:
    v = compute_verdict(_panel(MIN_PERSONAS_FOR_PASS, ["", " "]))
    # Both regions are falsy strings, distinct set = empty after filtering — < 2.
    # Actual filtering keeps non-empty; empty/whitespace handled as falsy in the
    # set comprehension. Outcome: WARN (0 regions).
    assert v.verdict == "WARN"
    assert v.perStratumRepresentation == []
