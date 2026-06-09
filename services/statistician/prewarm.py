# Pre-warm PyMC's PyTensor compile cache at image build time so the first
# /verdict request in the running container is fast (first-time pm.sample()
# compiles ~30s of C code). Tolerant of failure by design — the Dockerfile
# runs it with `|| echo …`, so a slow first request beats a failed build.
import warnings

warnings.filterwarnings("ignore")

import numpy as np
import pymc as pm

print("Pre-warming PyMC compile cache...")
with pm.Model():
    p = pm.Beta("p", alpha=1, beta=1)
    pm.Binomial("y", n=10, p=p, observed=np.array([5]))
    pm.sample(draws=20, tune=20, chains=1, progressbar=False, return_inferencedata=False)
print("PyMC cache warmed.")
