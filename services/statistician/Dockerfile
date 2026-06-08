# Principe Statistician — self-hosted Bayesian verdict service.
# Built from project root: `docker build -f services/statistician/Dockerfile .`

FROM python:3.12-slim AS base

WORKDIR /app

# System deps for PyMC's PyTensor backend at runtime (gcc/g++ for PyTensor
# JIT, libgomp for OpenMP). No Fortran needed because we install the
# scientific stack as pre-built wheels (no source builds).
RUN apt-get update && apt-get install -y --no-install-recommends \
      gcc g++ libgomp1 curl \
    && rm -rf /var/lib/apt/lists/*

# Install the heavy scientific stack first using ONLY prebuilt wheels.
# --only-binary=:all: refuses to compile from source — if a wheel isn't
# available for the platform, pip fails fast with a clear error instead
# of dragging us into gfortran/openblas/meson territory. These three
# have wheels for every Python 3.10+ × {x86_64, aarch64} combo.
RUN pip install --no-cache-dir --only-binary=:all: \
      numpy pandas scipy

# Rest of the runtime deps. PyMC + NumPyro install cleanly once scipy
# is already satisfied by the wheel above.
COPY services/statistician/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# App code.
COPY services/statistician/app ./app

# Calibration corpus — required at startup by app.main's lifespan hook.
# Baked into the image so the container is fully self-contained and
# doesn't depend on volume mounts (which break on Colima/non-default
# Docker setups that don't mount /tmp or arbitrary host paths).
COPY calibration /calibration

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
