#Requires -Version 5.1
<#
  Príncipe — Windows one-command installer.

    irm https://raw.githubusercontent.com/omergrossman/principe-oss/main/install.ps1 | iex

  Brings a Windows machine from nothing to a running app:
    1. Ensures the WSL2 feature (Docker Desktop's engine needs it). A reboot
       is required the FIRST time only — the installer re-arms itself to
       resume automatically after you sign back in, and is safe to re-run by
       hand if anything interrupts it.
    2. Ensures Docker Desktop (via winget) and waits for its engine.
    3. Ensures Git, then clones (or updates) the repo.
    4. Generates secrets and `docker compose up`s the stack.
    5. Opens http://localhost:3000 for the first-run wizard.

  The only thing you still provide is an Anthropic API key, in the wizard.
  Run it in Windows PowerShell — it will request Administrator rights itself.
#>

$ErrorActionPreference = "Stop"

$ScriptUrl = "https://raw.githubusercontent.com/omergrossman/principe-oss/main/install.ps1"
$RepoUrl   = "https://github.com/omergrossman/principe-oss"
$RepoDir   = Join-Path $env:USERPROFILE "principe-oss"
$AppUrl    = "http://localhost:3000"

function Info($m) { Write-Host "[principe] $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "[principe] $m" -ForegroundColor Green }
function Warn($m) { Write-Host "[principe] $m" -ForegroundColor Yellow }
function Die($m)  { Write-Host "[principe] $m" -ForegroundColor Red; exit 1 }

function Test-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  return ([Security.Principal.WindowsPrincipal]$id).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Where to relaunch from when elevating / resuming. Prefers the on-disk file
# (when run as a .ps1); falls back to re-downloading (when run via irm|iex).
function Get-SelfPath {
  if ($PSCommandPath) { return $PSCommandPath }
  $tmp = Join-Path $env:TEMP "principe-install.ps1"
  try { Invoke-RestMethod $ScriptUrl -OutFile $tmp -ErrorAction Stop; return $tmp }
  catch { return $null }
}

function Invoke-Elevated {
  $self = Get-SelfPath
  if (-not $self) {
    Die "Administrator rights are required. Right-click PowerShell > 'Run as administrator', then run this again."
  }
  Info "Requesting Administrator rights (a UAC prompt will appear)..."
  Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList @(
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$self`"")
  exit
}

# Re-run automatically once, at next sign-in (used after the WSL2 reboot).
function Set-ResumeAfterReboot {
  $self = Get-SelfPath
  if (-not $self) { return }
  Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce" `
    -Name "PrincipeInstaller" `
    -Value "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$self`""
}

function Test-Wsl2Ready {
  # WSL feature present and usable. Docker Desktop supplies its own distro,
  # so we only need the feature itself — not a user-installed Linux distro.
  try { & wsl.exe --status *> $null; return ($LASTEXITCODE -eq 0) }
  catch { return $false }
}

function Ensure-Wsl2 {
  if (Test-Wsl2Ready) { Ok "WSL2 feature is ready."; return }
  Info "Enabling WSL2 (Windows feature; needs ONE reboot the first time)..."
  & wsl.exe --install --no-distribution
  Set-ResumeAfterReboot
  Warn "WSL2 was enabled but a RESTART is required to finish."
  Warn "After you sign back in, this installer resumes automatically."
  Warn "If it doesn't, just run the same command again — it picks up where it left off."
  $ans = Read-Host "Reboot now? [Y/n]"
  if ($ans -notmatch '^[nN]') { Restart-Computer -Force }
  exit
}

function Ensure-Winget {
  if (Get-Command winget -ErrorAction SilentlyContinue) { return }
  Die "winget (App Installer) isn't available. Install 'App Installer' from the Microsoft Store, then re-run."
}

# Reload PATH from the registry so tools just installed by winget (docker,
# git) are callable in THIS session without opening a new window.
function Sync-Path {
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
              [Environment]::GetEnvironmentVariable("Path", "User")
}

function Test-Docker {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { return $false }
  & docker info *> $null
  return ($LASTEXITCODE -eq 0)
}

function Start-DockerDesktop {
  $exe = Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"
  if (Test-Path $exe) { Info "Starting Docker Desktop..."; Start-Process $exe | Out-Null }
}

function Wait-Docker {
  Info "Waiting for the Docker engine (Docker Desktop can take a minute on first launch)..."
  for ($i = 0; $i -lt 90; $i++) {
    if (Test-Docker) { Ok "Docker engine is running."; return }
    Start-Sleep -Seconds 4
  }
  Die @"
Docker didn't come up. Open Docker Desktop, finish its first-run setup
(accept the terms, keep 'Use the WSL 2 based engine' ON), wait until it
shows 'Engine running', then run this installer again.
"@
}

function Ensure-Docker {
  if (Test-Docker) { Ok "Docker is installed and running."; return }
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Ensure-Winget
    Info "Installing Docker Desktop (winget)..."
    & winget install -e --id Docker.DockerDesktop `
      --accept-package-agreements --accept-source-agreements
    Sync-Path
  }
  Start-DockerDesktop
  Wait-Docker
}

function Ensure-Git {
  if (Get-Command git -ErrorAction SilentlyContinue) { return }
  Ensure-Winget
  Info "Installing Git (winget)..."
  & winget install -e --id Git.Git --accept-package-agreements --accept-source-agreements
  Sync-Path  # make git callable in this same session
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Die "Git was installed but isn't on PATH yet. Close this window, open a new PowerShell, and re-run."
  }
}

# Use an existing checkout if we're run from inside one; otherwise clone.
function Resolve-RepoDir {
  if ((Test-Path ".\docker-compose.yml") -and (Test-Path ".\bin")) { return (Get-Location).Path }
  if ($PSScriptRoot -and (Test-Path (Join-Path $PSScriptRoot "docker-compose.yml"))) { return $PSScriptRoot }
  Ensure-Git
  if (Test-Path (Join-Path $RepoDir ".git")) {
    Info "Updating existing checkout at $RepoDir ..."
    & git -C $RepoDir pull --ff-only 2>$null
  } else {
    Info "Cloning $RepoUrl ..."
    & git clone --depth 1 $RepoUrl $RepoDir
  }
  if (-not (Test-Path (Join-Path $RepoDir "docker-compose.yml"))) {
    Die "Clone failed — $RepoDir has no docker-compose.yml."
  }
  return $RepoDir
}

function New-HexSecret([int]$nbytes) {
  $b = New-Object 'System.Byte[]' $nbytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  return (-join ($b | ForEach-Object { $_.ToString("x2") }))
}

function Ensure-EnvFile($dir) {
  $envPath = Join-Path $dir ".env.runtime"
  if (Test-Path $envPath) { Info "Reusing existing .env.runtime."; return }
  Info "Generating secrets (.env.runtime)..."
  $lines = @(
    "# Principe runtime secrets — generated $(Get-Date -Format o).",
    "# Do NOT commit this file. Rotate by deleting it and re-running the installer.",
    "STATISTICIAN_SHARED_SECRET=$(New-HexSecret 32)",
    "PRINCIPE_ENCRYPTION_KEY=$(New-HexSecret 32)",
    "POSTGRES_PASSWORD=$(New-HexSecret 16)",
    "WEB_PORT=3000",
    "WEBAUTHN_ORIGIN=http://localhost:3000"
  )
  # LF line endings, UTF-8 without BOM — compose env files want plain bytes.
  [System.IO.File]::WriteAllText($envPath, (($lines -join "`n") + "`n"),
    (New-Object System.Text.UTF8Encoding($false)))
}

function Boot-Stack($dir) {
  Set-Location $dir
  Info "Booting Postgres first and waiting for health (first run builds images — a few minutes)..."
  & docker compose --env-file .env.runtime up -d --build db
  $deadline = (Get-Date).AddSeconds(180)
  while ((Get-Date) -lt $deadline) {
    $h = (& docker compose --env-file .env.runtime ps db --format '{{.Health}}' 2>$null)
    if ($h -match "healthy") { break }
    Start-Sleep -Seconds 3
  }
  Info "Booting statistician + web..."
  & docker compose --env-file .env.runtime up -d --build
}

# ───────────────────────────── main ─────────────────────────────
Info "Príncipe Windows installer — let's get you running."
if (-not (Test-Admin)) { Invoke-Elevated }

Ensure-Wsl2          # may reboot here, then resume automatically
Ensure-Docker
$dir = Resolve-RepoDir
Ensure-EnvFile $dir
Boot-Stack $dir

Start-Process $AppUrl | Out-Null
Ok "Príncipe is starting. Opening $AppUrl"
Ok "Finish the setup wizard: workspace name -> admin -> Anthropic API key -> passkey."
