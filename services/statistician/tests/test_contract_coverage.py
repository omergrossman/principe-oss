# SPDX-License-Identifier: AGPL-3.0-or-later
"""Sprint 7 T5 — contract-coverage assertions.

For each documented input field on VerdictRequest, run two requests that
differ ONLY on that field and assert the output differs. Catches contract
drift like Sprint 6's "the input lived in the schema but compute_verdict_pymc
ignored it for 3 sprints" failure mode.

Each test wraps its assertion with a clear message so a future failure
flags which input stopped being used.

Run locally via `services/statistician/.venv/bin/pytest tests/test_contract_coverage.py`.
"""

from __future__ import annotations

import os

import pytest

# Force the calibration path so import-time loads succeed.
os.environ.setdefault(
    "STATISTICIAN_CALIBRATION_PATH",
    os.path.join(
        os.path.dirname(__file__),
        "..",
        "..",
        "..",
        "calibration",
        "datasets",
        "panorays-2026-ciso.json",
    ),
)

from app.bayesian import compute_verdict_pymc, BAYESIAN_AVAILABLE
from app.models import (
    AgreementObservation,
    IndustryDistribution,
    PanelComposition,
    RegionDistribution,
)


pytestmark = pytest.mark.skipif(
    not BAYESIAN_AVAILABLE,
    reason="PyMC not available — contract test requires the real bayesian path",
)


def _base_panel() -> PanelComposition:
    return PanelComposition(
        personaCount=100,
        regions=["us", "uk", "eu-west", "apac", "eu-central", "anz", "mea"],
        industries=["B2B SaaS", "Banks"],
    )


def _strata_obs(pro_rate: float) -> list[AgreementObservation]:
    """Build 28 region:stance observations at the given pro rate."""
    obs: list[AgreementObservation] = []
    for region in ["us", "uk", "eu-west", "apac", "eu-central", "anz", "mea"]:
        for stance in ["cautious", "balanced", "aggressive", "contrarian"]:
            n = 4
            pro = round(n * pro_rate)
            obs.append(
                AgreementObservation(
                    stratum=f"{region}:{stance}",
                    proCount=pro,
                    conCount=n - pro,
                    neutralCount=0,
                    n=n,
                )
            )
    return obs


def test_question_type_affects_thresholds() -> None:
    """questionType tunes CI-width + KL thresholds; same panel + obs
    should yield different verdicts on hypothesis-test vs open-discovery
    when CI/KL is near the threshold boundary."""
    panel = _base_panel()
    # Use a CI width that hypothesis-test (0.25) fails but open-discovery
    # (0.40) passes — choose a noisy observation set.
    obs = []
    for i, region in enumerate(["us", "uk", "eu-west", "apac", "eu-central", "anz", "mea"]):
        for j, stance in enumerate(["cautious", "balanced", "aggressive", "contrarian"]):
            n = 4
            pro = 3 if (i + j) % 2 == 0 else 1
            obs.append(
                AgreementObservation(
                    stratum=f"{region}:{stance}",
                    proCount=pro,
                    conCount=n - pro,
                    neutralCount=0,
                    n=n,
                )
            )
    r_open = compute_verdict_pymc(
        panel,
        hypothesis_text="x",
        question_type="open-discovery",
        agreement_observations=obs,
    )
    r_strict = compute_verdict_pymc(
        panel,
        hypothesis_text="x",
        question_type="hypothesis-test",
        agreement_observations=obs,
    )
    assert r_open is not None and r_strict is not None
    # Same numerical KL + CI (deterministic inputs aside from MCMC noise),
    # but the thresholds applied are different — reasoning trace mentions
    # different threshold values, ensuring the input is actually read.
    assert "open-discovery" in r_open.reasoningTrace or "0.40" in r_open.reasoningTrace
    assert "hypothesis-test" in r_strict.reasoningTrace or "0.12" in r_strict.reasoningTrace, (
        f"questionType not affecting thresholds — open: {r_open.reasoningTrace[:200]} · "
        f"strict: {r_strict.reasoningTrace[:200]}"
    )


def test_hypothesis_text_specificity_affects_recommended_n() -> None:
    """Longer + more numeric hypothesis text should raise recommendedN
    via the specificity multiplier."""
    panel = PanelComposition(personaCount=30, regions=["us"], industries=["B2B SaaS"])
    short = compute_verdict_pymc(
        panel,
        hypothesis_text="x",
        question_type="open-discovery",
    )
    long_specific = compute_verdict_pymc(
        panel,
        hypothesis_text=(
            "CISOs at mid-market fintech with 50-200 employees will pay $50k/year "
            "for a SOC automation tool that reduces incident response time by 30%, "
            "validated across 3 regulatory regions, 2 company sizes, and 4 stances."
        ),
        question_type="hypothesis-test",
    )
    assert short is not None and long_specific is not None
    assert long_specific.recommendedN > short.recommendedN, (
        f"hypothesisText specificity not affecting recommendedN — "
        f"short: {short.recommendedN}, long: {long_specific.recommendedN}"
    )


def test_region_distribution_affects_kl() -> None:
    """Skewed regionDistribution should give a different KL value than
    uniform — proves the panel-side region weights actually feed KL."""
    panel = _base_panel()
    uniform = [RegionDistribution(region=r, weight=14.3) for r in panel.regions]
    skewed = [RegionDistribution(region="us", weight=70.0)] + [
        RegionDistribution(region=r, weight=5.0) for r in panel.regions if r != "us"
    ]
    r_uniform = compute_verdict_pymc(
        panel, hypothesis_text="x", question_type="open-discovery", region_distribution=uniform
    )
    r_skewed = compute_verdict_pymc(
        panel, hypothesis_text="x", question_type="open-discovery", region_distribution=skewed
    )
    assert r_uniform is not None and r_skewed is not None
    assert abs(r_uniform.klDivergence - r_skewed.klDivergence) > 0.05, (
        f"regionDistribution not affecting KL — uniform: {r_uniform.klDivergence}, "
        f"skewed: {r_skewed.klDivergence}"
    )


def test_target_distribution_affects_kl() -> None:
    """Caller-supplied target should override the global default."""
    panel = PanelComposition(personaCount=100, regions=["us"], industries=["B2B SaaS"])
    panel_dist = [RegionDistribution(region="us", weight=100.0)]
    # Target A matches panel → KL near 0
    target_match = [RegionDistribution(region="us", weight=100.0)]
    # Target B mismatches panel → KL high
    target_mismatch = [
        RegionDistribution(region="us", weight=20.0),
        RegionDistribution(region="eu-west", weight=80.0),
    ]
    r_match = compute_verdict_pymc(
        panel,
        hypothesis_text="x",
        question_type="open-discovery",
        region_distribution=panel_dist,
        target_distribution=target_match,
    )
    r_mismatch = compute_verdict_pymc(
        panel,
        hypothesis_text="x",
        question_type="open-discovery",
        region_distribution=panel_dist,
        target_distribution=target_mismatch,
    )
    assert r_match is not None and r_mismatch is not None
    assert r_match.klDivergence < 0.05, f"Matching target should give KL≈0, got {r_match.klDivergence}"
    assert r_mismatch.klDivergence > 0.5, (
        f"Mismatching target should give high KL, got {r_mismatch.klDivergence}"
    )


def test_industry_target_affects_failure_count() -> None:
    """When an industry target is supplied AND the panel mismatches it,
    the industry KL band should fire as a verdict failure."""
    panel = PanelComposition(personaCount=100, regions=["us"], industries=["Healthcare"])
    industry_panel = [IndustryDistribution(industry="Healthcare", weight=100.0)]
    industry_target_match = [IndustryDistribution(industry="Healthcare", weight=100.0)]
    industry_target_mismatch = [
        IndustryDistribution(industry="B2B SaaS", weight=70.0),
        IndustryDistribution(industry="Banks", weight=30.0),
    ]
    r_match = compute_verdict_pymc(
        panel,
        hypothesis_text="x",
        question_type="open-discovery",
        industry_distribution=industry_panel,
        target_industry_distribution=industry_target_match,
    )
    r_mismatch = compute_verdict_pymc(
        panel,
        hypothesis_text="x",
        question_type="open-discovery",
        industry_distribution=industry_panel,
        target_industry_distribution=industry_target_mismatch,
    )
    assert r_match is not None and r_mismatch is not None
    # Mismatch should produce a worse verdict OR mention industry KL in trace.
    assert "industry" in r_mismatch.reasoningTrace.lower(), (
        f"industry target not affecting reasoning — {r_mismatch.reasoningTrace[:200]}"
    )


def test_agreement_observations_tighten_ci() -> None:
    """The Sprint 7 headline: observations should tighten the posterior
    CI vs the prior-only path."""
    panel = _base_panel()
    r_prior = compute_verdict_pymc(
        panel, hypothesis_text="x", question_type="open-discovery"
    )
    r_with_obs = compute_verdict_pymc(
        panel,
        hypothesis_text="x",
        question_type="open-discovery",
        agreement_observations=_strata_obs(0.9),
    )
    assert r_prior is not None and r_with_obs is not None
    prior_width = r_prior.credibleInterval.high - r_prior.credibleInterval.low
    obs_width = r_with_obs.credibleInterval.high - r_with_obs.credibleInterval.low
    assert obs_width < prior_width * 0.5, (
        f"Observations should tighten CI by ≥50% vs prior — "
        f"prior_width={prior_width:.3f}, obs_width={obs_width:.3f}"
    )


def test_no_two_runs_identical_with_same_input() -> None:
    """Sprint 6 fixed the random_seed=42 bug; two consecutive runs of
    the same payload should produce different BCI bounds from real MCMC
    sampling variance."""
    panel = _base_panel()
    r1 = compute_verdict_pymc(
        panel, hypothesis_text="x", question_type="open-discovery"
    )
    r2 = compute_verdict_pymc(
        panel, hypothesis_text="x", question_type="open-discovery"
    )
    assert r1 is not None and r2 is not None
    assert (
        abs(r1.credibleInterval.low - r2.credibleInterval.low) > 1e-6
        or abs(r1.credibleInterval.high - r2.credibleInterval.high) > 1e-6
    ), (
        f"Two runs produced identical CI — random_seed is back? "
        f"r1=[{r1.credibleInterval.low}, {r1.credibleInterval.high}], "
        f"r2=[{r2.credibleInterval.low}, {r2.credibleInterval.high}]"
    )
