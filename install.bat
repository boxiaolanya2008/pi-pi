@echo off
setlocal

rem Pi-Pi global installer for Windows (npm registry).

set "PACKAGE=@boxiaolanya2008/pi-pi"

where node >nul 2>nul
if errorlevel 1 (
	>&2 echo [pipi] Node.js not found. Install Node.js 22.19+ from https://nodejs.org first.
	exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
	>&2 echo [pipi] npm not found. Reinstall Node.js 22.19+ with npm included.
	exit /b 1
)

echo [pipi] Installing %PACKAGE% globally...
call npm install -g --ignore-scripts %PACKAGE%
if errorlevel 1 (
	>&2 echo [pipi] npm install failed. Check your network and npm login state, then retry.
	exit /b 1
)

echo [pipi] Verifying installation...
call pipi --version
if errorlevel 1 (
	>&2 echo [pipi] Install finished but "pipi" is not on PATH. Reopen the terminal and try again.
	exit /b 1
)

echo [pipi] Done. Run "pipi" (or "pi-pi") in any project directory to start.
endlocal
