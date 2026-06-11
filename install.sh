#!/usr/bin/env bash
#
# Príncipe — zero-to-running installer.
#
#   curl -fsSL https://raw.githubusercontent.com/omergrossman/principe-oss/main/install.sh | bash
#
# Or, from a checkout:  ./install.sh
#
# What it does, in order:
#   1. Makes sure git + Docker are installed and the Docker daemon is up
#      (installs Docker for you on macOS via Homebrew, on Linux via the
#      official get.docker.com script — both with your confirmation).
#   2. Clones the repo (or reuses/updates an existing checkout).
#   3. Boots the stack via bin/start.sh (generates secrets, brings up
#      Postgres + Statistician + web).
#   4. Opens http://localhost:3000 for the first-run wizard.
#
# The only thing you still need is an Anthropic API key — you paste it
# into the wizard at the end. Set PRINCIPE_YES=1 to skip all prompts.

set -euo pipefail

REPO_URL="https://github.com/omergrossman/principe-oss"
REPO_DIR="principe-oss"
ASSUME_YES="${PRINCIPE_YES:-0}"
OS="$(uname -s)"
ARCH="$(uname -m)"

c_info='\033[1;36m'; c_warn='\033[1;33m'; c_err='\033[1;31m'; c_ok='\033[1;32m'; c_off='\033[0m'
log()  { printf "${c_info}[principe]${c_off} %s\n" "$*"; }
ok()   { printf "${c_ok}[principe]${c_off} %s\n" "$*"; }
warn() { printf "${c_warn}[principe]${c_off} %s\n" "$*" >&2; }
die()  { printf "${c_err}[principe]${c_off} %s\n" "$*" >&2; exit 1; }

# Yes/no prompt that works even under `curl | bash` (reads the terminal
# directly). Defaults to "yes" when non-interactive or PRINCIPE_YES=1.
confirm() {
  local prompt="$1"
  [ "$ASSUME_YES" = "1" ] && return 0
  if [ -r /dev/tty ]; then
    printf "${c_warn}[principe]${c_off} %s [Y/n] " "$prompt" > /dev/tty
    local reply; read -r reply < /dev/tty || reply=""
    case "$reply" in [nN]*) return 1 ;; *) return 0 ;; esac
  fi
  return 0  # non-interactive: assume yes (the user ran an installer)
}

need_cmd() { command -v "$1" >/dev/null 2>&1; }

# ─── git ───────────────────────────────────────────────────────────────
ensure_git() {
  need_cmd git && return 0
  case "$OS" in
    Darwin) die "git not found. Install Apple's Command Line Tools with: xcode-select --install" ;;
    Linux)  die "git not found. Install it (e.g. 'sudo apt-get install -y git' or 'sudo dnf install -y git') and re-run." ;;
    *)      die "git not found. Install git and re-run." ;;
  esac
}

# ─── Docker ────────────────────────────────────────────────────────────
docker_up() { docker info >/dev/null 2>&1; }

wait_for_docker() {
  log "Waiting for the Docker daemon to come up..."
  local i=0
  until docker_up; do
    i=$((i + 2)); sleep 2
    if [ "$i" -ge 120 ]; then
      die "Docker didn't come up within 120s. Start Docker manually, then re-run this installer."
    fi
  done
  ok "Docker is running."
}

install_docker_mac() {
  if ! need_cmd brew; then
    die "Docker isn't installed and Homebrew isn't available to install it automatically.
       Install Docker Desktop from https://www.docker.com/products/docker-desktop/ then re-run."
  fi
  confirm "Install Docker Desktop via Homebrew now? (large download)" || die "Aborted. Install Docker, then re-run."
  log "Installing Docker Desktop (brew install --cask docker)..."
  brew install --cask docker
  log "Launching Docker Desktop..."
  open -a Docker
  wait_for_docker
}

install_docker_linux() {
  confirm "Install Docker Engine via the official get.docker.com script? (uses sudo)" || die "Aborted. Install Docker, then re-run."
  log "Installing Docker Engine..."
  curl -fsSL https://get.docker.com | sh
  sudo systemctl enable --now docker 2>/dev/null || true
  if ! groups "$USER" | grep -qw docker; then
    sudo usermod -aG docker "$USER" 2>/dev/null || true
    NEED_SG=1   # group won't be active in this shell until re-login; use `sg` for the boot
  fi
  wait_for_docker
}

ensure_docker() {
  if docker_up; then ok "Docker is installed and running."; return 0; fi
  if need_cmd docker; then
    log "Docker is installed but the daemon isn't running."
    case "$OS" in
      Darwin) open -a Docker 2>/dev/null || true; wait_for_docker ;;
      Linux)  sudo systemctl start docker 2>/dev/null || true; wait_for_docker ;;
      *)      die "Start the Docker daemon, then re-run." ;;
    esac
    return 0
  fi
  log "Docker not found — setting it up."
  case "$OS" in
    Darwin) install_docker_mac ;;
    Linux)  install_docker_linux ;;
    *)      die "Automatic Docker install isn't supported on '$OS'. Install Docker Desktop from https://docs.docker.com/get-docker/ and re-run." ;;
  esac
}

# ─── repo ──────────────────────────────────────────────────────────────
enter_repo() {
  if [ -f "bin/start.sh" ] && [ -f "docker-compose.yml" ]; then
    log "Running inside an existing checkout."
    return 0
  fi
  if [ -d "$REPO_DIR/.git" ]; then
    log "Found existing ./$REPO_DIR — updating it."
    git -C "$REPO_DIR" pull --ff-only || warn "Couldn't fast-forward; using the checkout as-is."
  else
    log "Cloning $REPO_URL ..."
    git clone --depth 1 "$REPO_URL" "$REPO_DIR"
  fi
  cd "$REPO_DIR"
}

# ─── platform ──────────────────────────────────────────────────────────
# Map the host CPU to a Docker platform so images build natively (no QEMU).
set_docker_platform() {
  case "$ARCH" in
    x86_64)        export DOCKER_DEFAULT_PLATFORM="linux/amd64" ;;
    arm64|aarch64) export DOCKER_DEFAULT_PLATFORM="linux/arm64" ;;
    *)             warn "Unknown architecture '$ARCH' — letting Docker choose the platform." ; return ;;
  esac
  log "CPU architecture: $ARCH → Docker platform: $DOCKER_DEFAULT_PLATFORM"
}

# ─── boot ──────────────────────────────────────────────────────────────
boot() {
  set_docker_platform
  log "Booting the stack — first run builds images and can take 3–5 minutes."
  if [ "${NEED_SG:-0}" = "1" ]; then
    # docker group was just added; activate it for this command without re-login
    sg docker -c "./bin/start.sh"
  else
    ./bin/start.sh
  fi
}

open_browser() {
  local url="http://localhost:${WEB_PORT:-3000}"
  case "$OS" in
    Darwin) open "$url" 2>/dev/null || true ;;
    Linux)  xdg-open "$url" 2>/dev/null || true ;;
  esac
  echo
  ok "Príncipe is starting. Open ${url} and finish the setup wizard"
  ok "(workspace name → admin → Anthropic API key → passkey)."
}

# On Windows there's a dedicated PowerShell installer (install.ps1) that sets
# up WSL2 + Docker Desktop for you. bash in Git Bash / MSYS / Cygwin can't do
# that, so redirect those users to it instead of failing cryptically. Inside
# WSL2, `uname -s` reports Linux, so this branch isn't hit there.
check_windows_shell() {
  case "$OS" in
    MINGW* | MSYS* | CYGWIN* | Windows_NT)
      die "You're in a Windows shell (Git Bash/MSYS/Cygwin). Use the Windows installer instead — open PowerShell and run:

       irm https://raw.githubusercontent.com/omergrossman/principe-oss/main/install.ps1 | iex

       It sets up WSL2 + Docker Desktop and boots the app for you."
      ;;
  esac
}

main() {
  log "Príncipe installer — let's get you running."
  check_windows_shell
  ensure_git
  ensure_docker
  enter_repo
  boot
  open_browser
}

main "$@"
