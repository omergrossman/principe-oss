# Windows install — test procedure

Thanks for testing the Windows installer (`install.ps1`). It's been validated
on macOS but **not yet run on a real Windows machine** — your run is the first.
This should take ~15–25 min (most of it Docker Desktop's first download/build).

Please skim **What to expect** first, then follow **Steps**, then fill in
**Results** at the bottom and send it back.

---

## Prerequisites

- **Windows 10 (version 2004+) or Windows 11**
- **`winget`** available — it ships as "App Installer" on Win11 and recent
  Win10. Quick check: open PowerShell and run `winget --version`. If that
  errors, install **App Installer** from the Microsoft Store first.
- An **Anthropic API key** (for the final wizard step). Get one at
  <https://console.anthropic.com>.
- Admin rights on the machine (the installer requests them via UAC).

You do **not** need to install WSL2, Docker, or Git yourself — the installer
does that.

---

## Steps

1. **Open PowerShell as Administrator**
   Start menu → type "PowerShell" → right-click **Windows PowerShell** →
   **Run as administrator**.

2. **Get the code and run the installer**
   (The `irm … | iex` one-liner only works once the repo is public; while it's
   private, clone first.)
   ```powershell
   git clone https://github.com/omergrossman/principe-oss
   cd principe-oss
   powershell -ExecutionPolicy Bypass -File .\install.ps1
   ```
   > If `git` isn't installed yet, the cleanest path is to let a normal run
   > install it — but to clone the private repo you need Git first. If the
   > clone fails with "git not recognized", install Git once with
   > `winget install -e --id Git.Git`, open a **new** admin PowerShell, and
   > retry step 2.

3. **If it reboots** (only on a machine without WSL2)
   The installer enables WSL2, then asks to reboot. Say yes. **After you sign
   back in, it resumes automatically.** If for any reason it doesn't, just open
   an admin PowerShell, `cd principe-oss`, and run the same
   `powershell -ExecutionPolicy Bypass -File .\install.ps1` again — it's safe
   to re-run and continues where it left off.

4. **Docker Desktop first run**
   The installer installs and starts Docker Desktop. On first launch you may
   need to **accept its terms** and wait until it shows **"Engine running"**.
   The installer waits up to ~6 minutes for the engine.

5. **Finish in the browser**
   When it's done it opens **http://localhost:3000**. Complete the wizard:
   workspace name → admin email/name → **Anthropic API key** → register a
   passkey (Windows Hello / security key). Then ask the panel a question.

---

## What to expect (normal output)

Lines prefixed `[principe]` narrate progress, e.g.:

```
[principe] Príncipe Windows installer — let's get you running.
[principe] Enabling WSL2 ...            (only first time; triggers the reboot)
[principe] Docker is installed and running.
[principe] Cloning ... / Reusing existing checkout.
[principe] Generating secrets (.env.runtime)...
[principe] Booting Postgres first and waiting for health ...
[principe] Booting statistician + web...
[principe] Príncipe is starting. Opening http://localhost:3000
```

First boot builds images (a few minutes). Later boots are seconds.

---

## Results — please fill in and send back

**Environment**
- Windows version (run `winver`): `____`
- Did the machine already have WSL2 / Docker Desktop?  `____`

**Outcome** (tick one)
- [ ] ✅ Worked end-to-end — reached the wizard at localhost:3000 and asked a question
- [ ] ⚠️ Worked but needed a manual step (note which, below)
- [ ] ❌ Failed (paste the error below)

**Where it needed a hand / got stuck**
- Reboot resume after WSL2 — did it auto-continue?  `____`
- Docker Desktop — any manual terms/enable step?    `____`
- Anything else:                                     `____`

**Errors / surprising output**
Paste any red `[principe]` lines, PowerShell errors, or the last ~20 lines
before it stopped:

```
(paste here)
```

**Rough timing**
- Total time to reach the wizard: `____`

---

That's it — send this back and we'll fix whatever turned up.
