# SPDX-License-Identifier: AGPL-3.0-or-later
from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field


Verdict = Literal["PASS", "WARN", "FAIL"]


class PanelComposition(BaseModel):
    personaCount: int = Field(ge=0, description="Total personas in the panel")
    regions: List[str] = Field(default_factory=list, description="Distinct regions covered")
    industries: List[str] = Field(default_factory=list)


class RegionDistribution(BaseModel):
    """Population reference for KL divergence (full Bayesian use in Sprint 3)."""

    region: str
    # Sprint 5.5 — weight is a non-negative number, either a fraction
    # (legacy callers) or a raw persona count (Sprint 5.5+ callers send
    # actual per-region counts). bayesian.py normalises by sum before
    # computing KL divergence, so either interpretation works for the
    # divergence math; the integer region-count block treats it as a
    # raw count via `int(round(weight))`.
    weight: float = Field(ge=0.0)


class IndustryDistribution(BaseModel):
    """Sprint 6 — analogous to RegionDistribution for the industry axis."""

    industry: str
    weight: float = Field(ge=0.0)


class AgreementObservation(BaseModel):
    """Sprint 7 — per-stratum observed verdict counts from the panel run.

    Stratum is a string key (e.g. "us:cautious") chosen by the caller —
    typically region × stance to give 28 cells with ~3-4 personas each
    at N=100. The Bayesian model fits a hierarchical Beta-Binomial on
    pro_count vs n_total, with partial pooling across strata.
    """

    stratum: str
    proCount: int = Field(ge=0)
    conCount: int = Field(ge=0)
    neutralCount: int = Field(ge=0)
    n: int = Field(ge=1)


class VerdictRequest(BaseModel):
    panelComposition: PanelComposition
    hypothesisText: str = Field(min_length=1, max_length=5000)
    questionType: str = Field(min_length=1, max_length=120)
    # Sprint 5.5 — actual per-region persona counts for THE PANEL.
    regionDistribution: Optional[List[RegionDistribution]] = None
    # Sprint 6 — per-request TARGET region distribution. When the caller
    # has explicit intent about the population the panel should approximate
    # (e.g. a US-only project for a US-only question), send the target
    # here. Server falls back to a global default when omitted. Same
    # normalisation rules as regionDistribution: counts or fractions both
    # work — bayesian.py normalises by sum before KL.
    targetDistribution: Optional[List[RegionDistribution]] = None
    # Sprint 6 — industry symmetry. Actual industry mix of THE PANEL +
    # intended industry mix for THE QUESTION. Same shape as the region
    # pair, same normalisation. When the project restricts to specific
    # industries (e.g. healthcare-only), supply both so KL on the
    # industry axis is zero for a properly-composed panel.
    industryDistribution: Optional[List[IndustryDistribution]] = None
    targetIndustryDistribution: Optional[List[IndustryDistribution]] = None
    # Sprint 7 — per-stratum observed verdict counts from the panel run.
    # When supplied, bayesian.py fits a real Beta-Binomial likelihood and
    # the posterior CI width becomes informative (vs prior-predictive in
    # Sprint 6). Re-enables the CI-width verdict gate that was disabled
    # in Sprint 6. Callers send this AFTER the panel completes.
    agreementObservations: Optional[List[AgreementObservation]] = None


class CredibleInterval(BaseModel):
    low: float
    high: float


class StratumRepresentation(BaseModel):
    stratum: str
    observedCount: int
    floor: int
    meetsFloor: bool


class VerdictResponse(BaseModel):
    verdict: Verdict
    credibleInterval: CredibleInterval
    klDivergence: float
    perStratumRepresentation: List[StratumRepresentation]
    recommendedN: int
    reasoningTrace: str
    stub: bool = Field(
        default=True,
        description="Sprint 2 ships stub heuristics; Sprint 3 replaces with PyMC/NumPyro. Flag stays in the contract so the client can render a 'stub mode' banner.",
    )
