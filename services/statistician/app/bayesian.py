from __future__ import annotations

# Sprint 3 — hierarchical Bayesian verdict via PyMC. Replaces the stub
# heuristic for environments where PyMC + NumPyro are available
# (Python 3.10+; Modal image is 3.12). On Python 3.9 (local dev), the
# `pm` import fails; main.py detects this and falls back to the stub
# with `stub: true` in the response.
#
# The model: a hierarchical Beta-Binomial that estimates an agreement
# rate (per-region) plus a population-level mean. Region effects come
# from a partial-pooling prior so small regions borrow strength from
# the global mean. KL divergence is computed between the panel's
# region distribution and the calibration's target distribution.

from typing import TYPE_CHECKING

from typing import Optional, Sequence

from .calibration import get_target_distribution, load_calibration
from .models import (
    AgreementObservation,
    CredibleInterval,
    IndustryDistribution,
    PanelComposition,
    RegionDistribution,
    StratumRepresentation,
    VerdictResponse,
)

if TYPE_CHECKING:
    pass

try:
    import numpy as np  # type: ignore
    import pymc as pm  # type: ignore

    BAYESIAN_AVAILABLE = True
except ImportError:
    BAYESIAN_AVAILABLE = False


# Verdict thresholds. Sprint 3 moves from hard cutoffs to CI-width-and-
# KL-derived verdicts. Anything within these bands lands PASS; one band
# fail → WARN; two or more → FAIL.
#
# Sprint 5.5 — thresholds become questionType-aware:
#   - hypothesis-test: testing a specific claim demands tighter bounds
#   - open-discovery: exploratory questions inherently allow wider intervals
_CI_WIDTH_PASS_MAX_DEFAULT = 0.30
_KL_PASS_MAX_DEFAULT = 0.15
_STRATUM_FLOOR = 1  # at least 1 persona per region present
_MIN_REGIONS_FOR_PASS = 2
_RECOMMENDED_N_FLOOR = 30


def _thresholds_for_question_type(qt: str) -> tuple[float, float]:
    """Return (ci_width_max, kl_max) tuned to the question shape."""
    qt_norm = (qt or "").lower().strip()
    if qt_norm == "hypothesis-test":
        # Stricter — testing a specific claim warrants tight bounds.
        return (0.25, 0.12)
    if qt_norm in ("open-discovery", "open_discovery", "exploratory"):
        # Looser — exploratory questions inherently have wider intervals.
        return (0.40, 0.20)
    return (_CI_WIDTH_PASS_MAX_DEFAULT, _KL_PASS_MAX_DEFAULT)


def _specificity_multiplier(hypothesis_text: str) -> float:
    """Map a hypothesis's complexity/specificity to a recommended-N
    multiplier. Longer + more specific questions ask the panel to
    resolve more dimensions and want more responses."""
    text = (hypothesis_text or "").strip()
    if not text:
        return 1.0
    n_chars = len(text)
    n_clauses = text.count(",") + text.count(";") + text.count("?") + 1
    n_numbers = sum(1 for c in text if c.isdigit())
    # Heuristic mix: long, multi-clause, numeric-loaded questions need more N.
    raw = 1.0 + min(0.5, n_chars / 1500.0) + min(0.3, n_clauses / 20.0) + min(0.2, n_numbers / 30.0)
    return min(2.0, raw)


def _panel_distribution(
    regions: Sequence[str],
    region_distribution: Optional[Sequence[RegionDistribution]],
) -> dict[str, float]:
    """Build the panel's empirical region weight distribution.

    Sprint 5.5 — when the caller passes per-region weights (real persona
    counts), use them so KL divergence reflects actual panel composition.
    Falls back to uniform 1/n_regions for legacy callers without weights.
    """
    if region_distribution:
        total = sum(float(d.weight) for d in region_distribution if d.weight > 0)
        if total > 0:
            return {
                d.region: float(d.weight) / total
                for d in region_distribution
                if d.weight > 0
            }
    n = len(regions)
    if n == 0:
        return {}
    return {r: 1.0 / n for r in regions}


def _shannon_kl(p: dict[str, float], q: dict[str, float]) -> float:
    """KL(P || Q). p = panel empirical; q = target. Smooths zero-density
    bins with a small epsilon so the divergence stays finite."""
    eps = 1e-6
    keys = set(p.keys()) | set(q.keys())
    total = 0.0
    for k in keys:
        pi = max(p.get(k, 0.0), eps)
        qi = max(q.get(k, 0.0), eps)
        total += pi * (float(np.log(pi / qi)) if BAYESIAN_AVAILABLE else _safe_log(pi / qi))
    return float(total)


def _safe_log(x: float) -> float:
    # Fallback for environments without numpy. Sufficient for the eps cases.
    import math
    return math.log(x)


def _normalise_distribution(
    items: Optional[Sequence], key_attr: str
) -> Optional[dict[str, float]]:
    """Sprint 6 — shared normaliser for region and industry distributions.
    Returns None when no positive-weight items present."""
    if not items:
        return None
    total = sum(float(d.weight) for d in items if d.weight > 0)
    if total <= 0:
        return None
    return {
        getattr(d, key_attr): float(d.weight) / total
        for d in items
        if d.weight > 0
    }


def compute_verdict_pymc(
    panel: PanelComposition,
    hypothesis_text: str = "",
    question_type: str = "",
    region_distribution: Optional[Sequence[RegionDistribution]] = None,
    target_distribution: Optional[Sequence[RegionDistribution]] = None,
    industry_distribution: Optional[Sequence[IndustryDistribution]] = None,
    target_industry_distribution: Optional[Sequence[IndustryDistribution]] = None,
    agreement_observations: Optional[Sequence[AgreementObservation]] = None,
) -> VerdictResponse | None:
    """Real Bayesian compute. Returns None if PyMC isn't importable
    (e.g. Python 3.9 local dev) so main.py can fall back to the stub.

    Sprint 5.5 — the model now actually conditions on the question and the
    panel weights:
      * question_type tunes the verdict thresholds (hypothesis-test is
        stricter, open-discovery is looser)
      * hypothesis_text specificity feeds a recommended-N multiplier
      * region_distribution (when present) replaces the prior uniform
        per-region weight so KL divergence reflects real panel composition
      * random_seed is dropped from the sampler so independent runs of
        the same payload produce sampling variance (the previous fixed
        seed = 42 caused identical output across every request)
    """

    if not BAYESIAN_AVAILABLE:
        return None

    regions = sorted({r.strip() for r in panel.regions if r and r.strip()})
    n_regions = len(regions)
    n = panel.personaCount
    calibration = load_calibration()

    # Sprint 6 — target is now per-request. When the caller sends an
    # explicit target_distribution (project composition restricted to
    # a subset of regions, or question explicitly scoped), use it. Falls
    # back to the global default for callers that don't supply intent.
    target_source: str
    if target_distribution:
        total = sum(float(d.weight) for d in target_distribution if d.weight > 0)
        if total > 0:
            target = {
                d.region: float(d.weight) / total
                for d in target_distribution
                if d.weight > 0
            }
            target_source = "caller-supplied targetDistribution"
        else:
            target = get_target_distribution()
            target_source = f"global default ({calibration['dataset_id']})"
    else:
        target = get_target_distribution()
        target_source = f"global default ({calibration['dataset_id']})"

    panel_dist = _panel_distribution(regions, region_distribution)
    kl = _shannon_kl(panel_dist, target)

    # Sprint 6 — symmetric KL on the industry axis. When neither
    # industry side is provided, industry_kl = 0 (no signal, no penalty).
    # When the caller sends an industry target but no panel industry
    # mix, treat the panel industry mix as uniform across the panel's
    # declared industries (legacy callers).
    panel_industry = _normalise_distribution(industry_distribution, "industry")
    target_industry = _normalise_distribution(
        target_industry_distribution, "industry"
    )
    if target_industry is None:
        industry_kl = 0.0
        industry_kl_source = "no industry target supplied"
    else:
        if panel_industry is None:
            inds = [i.strip() for i in panel.industries if i and i.strip()]
            panel_industry = (
                {i: 1.0 / len(inds) for i in inds} if inds else {}
            )
        if not panel_industry:
            industry_kl = 0.0
            industry_kl_source = (
                "industry target supplied but panel industries are empty"
            )
        else:
            industry_kl = _shannon_kl(panel_industry, target_industry)
            industry_kl_source = "caller-supplied industry target"

    # Per-region observed counts feed the strata report and the model.
    region_counts: dict[str, int] = {r: 0 for r in regions}
    if region_distribution:
        for d in region_distribution:
            if d.region in region_counts:
                region_counts[d.region] = int(round(d.weight))
    else:
        # Even split fallback — for legacy callers that don't send weights.
        per = n // max(1, n_regions) if n_regions > 0 else 0
        for r in regions:
            region_counts[r] = per

    # Sprint 7 — hierarchical model with optional observation data.
    #
    # When agreement_observations are supplied (the panel has already
    # run and we know the verdict counts per stratum), fit a real
    # Beta-Binomial with binomial likelihood — the posterior CI on the
    # population-level mean tightens as a function of total N and
    # observation consistency.
    #
    # When observations are absent (pre-panel validation), fall back to
    # the Sprint 5.5 prior-only structure where the posterior IS the
    # prior predictive. CI is wide (~0.7-0.85) by design in that path.
    has_observations = (
        agreement_observations is not None and len(list(agreement_observations)) > 0
    )

    if has_observations:
        obs_list = list(agreement_observations or [])
        # Filter out empty strata (n=0 shouldn't happen but be safe).
        obs_list = [o for o in obs_list if o.n > 0]
        strata_keys = [o.stratum for o in obs_list]
        pro_counts = np.array([o.proCount for o in obs_list], dtype="int64")
        n_arr = np.array([o.n for o in obs_list], dtype="int64")

        coords = {"stratum": strata_keys}
        with pm.Model(coords=coords):
            mu_pop = pm.Beta("mu_pop", alpha=2, beta=2)
            sigma_stratum = pm.HalfNormal("sigma_stratum", sigma=0.4)
            # Per-stratum agreement rate, partial-pooled via logit-normal.
            theta_logit = pm.Normal(
                "theta_logit",
                mu=pm.math.logit(mu_pop),
                sigma=sigma_stratum,
                dims="stratum",
            )
            theta = pm.Deterministic(
                "theta", pm.math.sigmoid(theta_logit), dims="stratum"
            )
            # Observed: pro_counts ~ Binomial(n, theta) per stratum.
            pm.Binomial(
                "pro_obs",
                n=n_arr,
                p=theta,
                observed=pro_counts,
                dims="stratum",
            )
            idata = pm.sample(
                draws=800,
                tune=500,
                chains=2,
                cores=1,
                target_accept=0.9,
                progressbar=False,
            )
    else:
        coords = {"region": regions} if n_regions > 0 else {"region": ["us"]}
        with pm.Model(coords=coords):
            mu_pop = pm.Beta("mu_pop", alpha=2, beta=2)
            sigma_region = pm.HalfNormal("sigma_region", sigma=0.4)
            pm.Normal(
                "region_logit",
                mu=pm.math.logit(mu_pop),
                sigma=sigma_region,
                dims="region",
            )
            idata = pm.sample(
                draws=600,
                tune=400,
                chains=2,
                cores=1,
                target_accept=0.9,
                progressbar=False,
            )

    mu_samples = idata.posterior["mu_pop"].values.flatten()
    ci_low = float(np.percentile(mu_samples, 2.5))
    ci_high = float(np.percentile(mu_samples, 97.5))
    ci_width = ci_high - ci_low

    strata = [
        StratumRepresentation(
            stratum=r,
            observedCount=region_counts.get(r, 0),
            floor=_STRATUM_FLOOR,
            meetsFloor=region_counts.get(r, 0) >= _STRATUM_FLOOR,
        )
        for r in regions
    ]

    ci_width_max, kl_max = _thresholds_for_question_type(question_type)
    spec_mult = _specificity_multiplier(hypothesis_text)
    recommended_n = max(int(_RECOMMENDED_N_FLOOR * spec_mult), n)

    # Sprint 7 — CI width is back as a verdict gate WHEN observations are
    # supplied. Without observations the posterior is prior-predictive
    # (width ~0.7-0.85 regardless of panel) so the gate would always fire;
    # the gate skips that path. With observations, the CI tightens as a
    # function of total N + cross-stratum consistency, so width <
    # threshold becomes meaningful.
    failures: list[str] = []
    if has_observations and ci_width > ci_width_max:
        failures.append(
            f"posterior CI width {ci_width:.2f} > {ci_width_max:.2f} for question type '{question_type or 'default'}' — verdict is noisier than the precision target"
        )
    if kl > kl_max:
        failures.append(
            f"region KL divergence {kl:.2f} vs target > {kl_max:.2f} for question type '{question_type or 'default'}'"
        )
    if target_industry is not None and industry_kl > kl_max:
        failures.append(
            f"industry KL divergence {industry_kl:.2f} vs target > {kl_max:.2f}"
        )
    # Sprint 6 — min-regions floor only applies when the caller did NOT
    # supply an explicit target. If they did, the target IS the intent —
    # a 1-region target means a 1-region panel is correct (e.g. US-only
    # project asked a US-only question). Penalising n_regions < 2 in that
    # case contradicts the user's explicit composition choice.
    if target_distribution is None and n_regions < _MIN_REGIONS_FOR_PASS:
        failures.append(f"only {n_regions} region(s) covered; need ≥ {_MIN_REGIONS_FOR_PASS}")
    if n < recommended_n:
        failures.append(
            f"N={n} below specificity-adjusted floor {recommended_n} (multiplier {spec_mult:.2f}x for this question's complexity)"
        )
    weak_strata = [r for r in regions if region_counts.get(r, 0) < _STRATUM_FLOOR]
    if weak_strata:
        failures.append(f"under-represented regions: {', '.join(weak_strata)}")

    industry_clause = (
        f" Industry KL is {industry_kl:.3f} ({industry_kl_source})."
        if target_industry is not None
        else ""
    )
    ci_clause = (
        f" Posterior credible interval on the population agreement rate is "
        f"[{ci_low:.2f}, {ci_high:.2f}] (width {ci_width:.2f}, threshold "
        f"{ci_width_max:.2f}) from {len(list(agreement_observations or []))} "
        f"observation strata."
        if has_observations
        else f" Posterior credible interval is [{ci_low:.2f}, {ci_high:.2f}] — "
             f"informational only; the model has no observation data yet."
    )
    if len(failures) == 0:
        verdict = "PASS"
        narrative = (
            f"PASS — panel region KL vs the {target_source} is "
            f"{kl:.3f} (threshold {kl_max:.2f}); coverage across {n_regions} regions "
            f"({', '.join(regions)}); N={n} ≥ specificity-adjusted floor {recommended_n}."
            f"{industry_clause}"
            f"{ci_clause}"
        )
    elif len(failures) == 1:
        verdict = "WARN"
        narrative = (
            f"WARN — verdict gated on one weakness: {failures[0]}. "
            f"Credible interval [{ci_low:.2f}, {ci_high:.2f}]; KL {kl:.3f}; "
            f"{n_regions} region(s) covered."
        )
    else:
        verdict = "FAIL"
        narrative = (
            f"FAIL — verdict gated on {len(failures)} weaknesses: "
            + "; ".join(failures)
            + f". Credible interval [{ci_low:.2f}, {ci_high:.2f}]; KL {kl:.3f}."
        )

    return VerdictResponse(
        verdict=verdict,
        credibleInterval=CredibleInterval(low=ci_low, high=ci_high),
        klDivergence=kl,
        perStratumRepresentation=strata,
        recommendedN=recommended_n,
        reasoningTrace=narrative,
        stub=False,
    )
