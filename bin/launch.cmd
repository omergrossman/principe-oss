@echo off
REM Príncipe desktop launcher  ·  Windows  (macOS & Linux: see launch.sh)
REM Ensure the stack is up, then open the app. Invoked by the desktop shortcut
REM the installer creates.
cd /d "%~dp0.."
docker compose --env-file .env.runtime up -d >nul 2>&1
start "" "http://localhost:3000"
