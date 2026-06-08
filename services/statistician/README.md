# Principe Statistician

Python service that returns a PASS / WARN / FAIL verdict for a hypothesis
+ panel composition. The Next.js app calls this before every cycle so
founders can't run a statistically invalid panel by accident.

**Sprint 2 ships stub heuristics** (`N >= 30` and `regions >= 2` are the
PASS thresholds). The API contract is final — Sprint 3 swaps in a real
PyMC/NumPyro hierarchical Bayesian model under the same response shape.

## Layout

```
services/statistician/
├── app/
│   ├── main.py        # FastAPI app + /healthz + /verdict + 413 middleware
│   ├── models.py      # Pydantic request/response models
│   ├── verdict.py     # Sprint 2 stub heuristic (replaced in Sprint 3)
│   └── auth.py        # HMAC-SHA256 signature verification
├── tests/             # pytest — verdict logic, endpoints, auth, payload cap
├── modal_app.py       # Modal deployment entrypoint
├── pyproject.toml     # Poetry; target Python 3.12 (3.9 also works locally)
└── .env.example
```

## Local dev

**Sprint 7 — venv setup for math iteration without Modal redeploys.**
The Modal redeploy cycle (~3 min/deploy) was the bottleneck for Sprint 6
math iteration. Set up a local Python 3.12 venv to run bayesian.py
end-to-end without round-tripping through Modal.

```bash
# One-time setup
brew install python@3.12
cd services/statistician
python3.12 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install fastapi pydantic 'uvicorn[standard]' \
  'numpy>=1.26,<2.0' 'pandas>=2.2,<3.0' 'pymc>=5.16,<6.0' \
  'numpyro>=0.15,<1.0' pytest httpx

# Verify PyMC import + bayesian.py runs locally
STATISTICIAN_CALIBRATION_PATH=../../calibration/datasets/panorays-2026-ciso.json \
  .venv/bin/python -c "
from app.bayesian import compute_verdict_pymc, BAYESIAN_AVAILABLE
from app.models import PanelComposition
print('PyMC:', BAYESIAN_AVAILABLE)
panel = PanelComposition(personaCount=100, regions=['us','uk','eu-west'], industries=['B2B SaaS'])
print(compute_verdict_pymc(panel, hypothesis_text='test', question_type='open-discovery'))
"

# Run the service locally (port 8001)
cp .env.example .env
# edit .env: set STATISTICIAN_SHARED_SECRET to a real random string
.venv/bin/uvicorn app.main:app --reload --port 8001
```

Once the venv is running, iterate on `bayesian.py` locally and only
redeploy to Modal when the math is settled.

Then sign a request:

```bash
BODY='{"panelComposition":{"personaCount":30,"regions":["us","uk"]},"hypothesisText":"x","questionType":"q"}'
SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$STATISTICIAN_SHARED_SECRET" | sed 's/^.* //')"
curl -X POST http://localhost:8001/verdict \
  -H "content-type: application/json" \
  -H "x-principe-signature: $SIG" \
  --data "$BODY"
```

## Tests

```bash
poetry run pytest
```

Tests cover: verdict logic per AC (PASS / WARN / FAIL paths), HMAC auth
(401 on missing / invalid / unconfigured secret), payload cap (413), JSON
validation (400 on missing fields / invalid JSON), and `/healthz`.

## Deploy to Modal

1. Create the shared secret: `modal secret create principe-statistician STATISTICIAN_SHARED_SECRET=...`
2. Mirror that secret value into the Next.js app's env (`STATISTICIAN_SHARED_SECRET`).
3. `modal deploy modal_app.py`
4. Copy the deployed URL into the Next.js env as `STATISTICIAN_SERVICE_URL`.
5. Verify: `curl https://<deployed-url>/healthz` → `{"ok": true, "version": "..."}`.

Cold-start mitigation: `min_containers=1` in `modal_app.py` keeps one
container warm. Tune if cost matters; revisit when Sprint 3 PyMC import
times push cold start higher.

## API contract

`POST /verdict` — request:

```json
{
  "panelComposition": {
    "personaCount": 30,
    "regions": ["us", "uk"],
    "industries": ["fintech"]
  },
  "hypothesisText": "...",
  "questionType": "feature-preference",
  "regionDistribution": [{"region": "us", "weight": 0.6}]
}
```

Response (Sprint 2 stub shape — final contract):

```json
{
  "verdict": "PASS",
  "credibleInterval": {"low": 0.42, "high": 0.58},
  "klDivergence": 0.08,
  "perStratumRepresentation": [{"stratum": "us", "observedCount": 1, "floor": 1, "meetsFloor": true}],
  "recommendedN": 30,
  "reasoningTrace": "PASS (stub heuristic): ...",
  "stub": true
}
```

`stub: true` stays in the response in Sprint 2 so the Next.js client can
render a visible "stub mode" banner. Sprint 3 flips it to `false`.

`GET /healthz` — `{"ok": true, "version": "<git sha or 'dev'>"}` (no auth).

Errors:

| Status | When |
|---|---|
| 400 | Invalid JSON or missing/invalid Pydantic fields |
| 401 | Missing or invalid `X-Principe-Signature` header, or server has no `STATISTICIAN_SHARED_SECRET` configured |
| 413 | Request body > 256 KB |
| 5xx | Unhandled — the Next.js client retries with backoff |
