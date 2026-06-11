@echo off
REM Príncipe desktop launcher (Windows) — ensure the stack is up, then open the
REM app. Invoked by the desktop shortcut the installer creates.
cd /d "%~dp0.."
docker compose --env-file .env.runtime up -d >nul 2>&1
start "" "http://localhost:3000"
