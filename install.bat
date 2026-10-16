@echo off
setlocal

rem Pi-Pi installer for Windows.
rem
rem Installs from this working copy, not from a registry: the package is built here and installed from
rem npm-package/. npm-package/ holds a copy of the built agent, so it is refreshed from the current
rem sources before every install. That copy is what makes updating require re-running this script.

set "SCRIPT_DIR=%~dp0"
set "PACKAGE_DIR=%SCRIPT_DIR%npm-package"

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

if not exist "%PACKAGE_DIR%\package.json" (
	>&2 echo [pipi] %PACKAGE_DIR% is missing. Run this script from the repository root.
	exit /b 1
)

rem Skip the rebuild when the caller only wants to reinstall the existing build.
if /i not "%~1"=="--no-build" (
	echo [pipi] Building from source...
	pushd "%SCRIPT_DIR%"
	call npm run build
	if errorlevel 1 (
		popd
		>&2 echo [pipi] Build failed. Fix the errors above, then retry.
		exit /b 1
	)
	popd
)

echo [pipi] Refreshing npm-package from the build...
pushd "%SCRIPT_DIR%"
call npm run package:local
if errorlevel 1 (
	popd
	>&2 echo [pipi] Failed to refresh npm-package.
	exit /b 1
)
popd

echo [pipi] Installing %PACKAGE_DIR% globally...
call npm install -g "%PACKAGE_DIR%"
if errorlevel 1 (
	>&2 echo [pipi] npm install failed. Check the npm error above, then retry.
	exit /b 1
)

echo [pipi] Verifying installation...
call pipi --version
if errorlevel 1 (
	>&2 echo [pipi] Install finished but "pipi" is not on PATH. Reopen the terminal and try again.
	exit /b 1
)

echo [pipi] Done. Run "pipi" (or "pi-pi") in any project directory to start.
echo [pipi] Note: this installed a snapshot. After changing the source, run install.bat again.
endlocal
