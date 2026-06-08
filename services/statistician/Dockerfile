# Principe Statistician — self-hosted Bayesian verdict service.
# Built from project root: `docker build -f services/statistician/Dockerfile .`

FROM python:3.12-slim AS base

WORKDIR /app

# System deps for PyMC's PyTensor backend (gcc, g++, libgomp for OpenMP).
RUN apt-get update && apt-get install -y --no-install-recommends \
      gcc g++ libgomp1 curl \
    && rm -rf /var/lib/apt/lists/*

# Python deps. requirements.txt mirrors the floors in pyproject.toml.
COPY services/statistician/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# App code.
COPY services/statistician/app ./app

# Pre-warm PyMC's PyTensor compile cache during image build. First-time
# `pm.sample()` compiles ~30s of C code; running it once at build time
# means the runtime container's first /verdict request is fast.
# Failure is tolerated — a slow first request beats a failed build.
RUN python -c "import pymc as pm, numpy as np; \
import warnings; warnings.filterwarnings('ignore'); \
print('Pre-warming PyMC compile cache...'); \
m = pm.Model(); \
with m: \
    p = pm.Beta('p', alpha=1, beta=1); \
    pm.Binomial('y', n=10, p=p, observed=np.array([5])); \
    pm.sample(draws=20, tune=20, chains=1, progressbar=False, return_inferencedata=False); \
print('PyMC cache warmed.')" \
    || echo "WARN: PyMC pre-warm failed; first /verdict will be slower."

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://localhost:8000/healthz || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
