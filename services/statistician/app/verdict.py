from __future__ import annotations

# Sprint 2 stub. Real Bayesian inference (PyMC/NumPyro) replaces this in Sprint 3
# without changing the API contract. Heuristics here are deliberately crude —
# their job is to unblock EP-03 (real Validate button) and exercise the
# infrastructure path, NOT to provide statistically meaningful verdicts.

from .models import (
    CredibleInterval,
    PanelComposition,
    StratumRepresentation,
    VerdictResponse,
)


MIN_PERSONAS_FOR_PASS = 30
MIN_REGIONS_FOR_PASS = 2


def compute_verdict(panel: PanelComposition) -> VerdictResponse:
    regions = sorted({r.strip() for r in panel.regions if r and r.strip()})
    n = panel.personaCount
    strata = [
        StratumRepresentation(
            stratum=r,
            observedCount=1,
            floor=1,
            meetsFloor=True,
        )
        for r in regions
    ]

    if n < MIN_PERSONAS_FOR_PASS:
        return VerdictResponse(
            verdict="FAIL",
            credibleInterval=CredibleInterval(low=0.0, high=1.0),
            klDivergence=1.0,
            perStratumRepresentation=strata,
            recommendedN=MIN_PERSONAS_FOR_PASS,
            reasoningTrace=(
                f"FAIL: panel size N={n} is below the V1 stub floor of "
                f"N={MIN_PERSONAS_FOR_PASS}. Recommended N={MIN_PERSONAS_FOR_PASS} "
                "for ≥95% credible-interval coverage. Sprint 3 will replace this "
                "heuristic with a hierarchical Bayesian model that returns a real "
                "credible interval."
            ),
        )

    if len(regions) < MIN_REGIONS_FOR_PASS:
        return VerdictResponse(
            verdict="WARN",
            credibleInterval=CredibleInterval(low=0.15, high=0.85),
            klDivergence=0.35,
            perStratumRepresentation=strata,
            recommendedN=n,
            reasoningTrace=(
                f"WARN: panel covers {len(regions)} region(s) "
                f"({', '.join(regions) or 'none'}); the V1 stub asks for at least "
                f"{MIN_REGIONS_FOR_PASS} regions to mark PASS. Cross-regional "
                "variance may produce a wide credible interval. Add a region or "
                "accept the wider interval to proceed."
            ),
        )

    return VerdictResponse(
        verdict="PASS",
        credibleInterval=CredibleInterval(low=0.42, high=0.58),
        klDivergence=0.08,
        perStratumRepresentation=strata,
        recommendedN=n,
        reasoningTrace=(
            f"PASS (stub heuristic): N={n} ≥ {MIN_PERSONAS_FOR_PASS}, "
            f"regions={len(regions)} ≥ {MIN_REGIONS_FOR_PASS} "
            f"({', '.join(regions)}). Sprint 3 will replace this with a real "
            "Bayesian credible interval + KL divergence vs target population."
        ),
    )
