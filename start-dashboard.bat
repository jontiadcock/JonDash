@echo off
setlocal
title JonDash
cd /d "%~dp0"

REM Make sure Node.js is reachable even if PATH hasn't refreshed.
if exist "C:\Program Files\nodejs\node.exe" set "PATH=C:\Program Files\nodejs;%PATH%"

REM ----------------------------------------------------------------------------
REM Stage 1 (first pass): offer an update, then relaunch a fresh copy of this
REM script so any change to the launcher itself takes effect cleanly.
REM ----------------------------------------------------------------------------
if "%~1"=="_run" goto run

call :check_for_updates
cmd /c ""%~f0" _run first"
exit /b %errorlevel%

:check_for_updates
where node >nul 2>nul || goto :eof
if not exist "scripts\update.mjs" goto :eof
echo.
echo   Checking GitHub for updates...
node "scripts\update.mjs" check
REM Exit code 10 from the checker means an update is available.
if not errorlevel 10 goto :eof
echo.
choice /C YN /N /T 30 /D N /M "  Install this update now? [Y/N] (auto-skip in 30s): "
if errorlevel 2 goto :update_skipped
echo   Installing update...
node "scripts\update.mjs" apply
goto :eof
:update_skipped
echo   Skipping update. You can install it later from the Admin page.
goto :eof

REM ----------------------------------------------------------------------------
REM Stage 2 (_run): install, configure, migrate, build, start (supervised loop)
REM ----------------------------------------------------------------------------
:run
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed.
  echo   Please install it from https://nodejs.org ^(LTS version^), then run this again.
  echo.
  pause
  exit /b 1
)

REM An in-place update can leave the previous TypeScript config behind; the config
REM is now next.config.mjs, and Next.js errors if both exist. Remove the stale one.
if exist "next.config.mjs" if exist "next.config.ts" del "next.config.ts" >nul 2>nul

REM Create default configuration on first run (the database location).
if not exist ".env" (
  echo   Creating default configuration...
  > ".env" echo DATABASE_URL="file:./dev.db"
)

REM ----------------------------------------------------------------------------
REM Only install + build when it's actually needed: first run, a missing build,
REM or a new version (auto-update bumps package.json). After building we prune the
REM build-only packages so the on-disk footprint stays small. The "built-version"
REM marker lives in .data (which the updater preserves) so we don't rebuild on
REM every launch.
REM ----------------------------------------------------------------------------
set "APPVER=0.0.0"
for /f "usebackq tokens=* delims=" %%v in (`node -e "process.stdout.write(require('./package.json').version)"`) do set "APPVER=%%v"
set "BUILTVER="
if exist ".data\built-version" set /p BUILTVER=<".data\built-version"

set "NEEDBUILD="
if not exist "node_modules" set "NEEDBUILD=1"
if not exist ".next" set "NEEDBUILD=1"
if not "%APPVER%"=="%BUILTVER%" set "NEEDBUILD=1"

if defined NEEDBUILD (
  echo.
  echo   Installing / updating components ^(this can take a few minutes the first time^)...
  call npm install
  if errorlevel 1 goto :error

  echo.
  echo   Preparing the database...
  call npm run db:migrate
  if errorlevel 1 goto :error

  echo.
  echo   Building the app ^(please wait^)...
  call npm run build
  if errorlevel 1 goto :error

  echo.
  echo   Optimising install size ^(removing build-only components^)...
  call npm prune --omit=dev
  REM Strip files never used at runtime: TypeScript declarations + sourcemaps, plus the
  REM build cache. Safe — the running app (next start) doesn't read any of these.
  if exist "node_modules" del /S /Q "node_modules\*.d.ts" >nul 2>nul
  if exist "node_modules" del /S /Q "node_modules\*.map" >nul 2>nul
  if exist ".next\cache" rmdir /S /Q ".next\cache" >nul 2>nul

  if not exist ".data" mkdir ".data" >nul 2>nul
  > ".data\built-version" echo %APPVER%
) else (
  echo.
  echo   Already up to date and built ^(v%APPVER%^) — starting up.
)

echo.
echo   ============================================================
echo     Your dashboard is running at:  http://localhost:3000
echo     Leave this window open while you use it.
echo     Close this window to stop the dashboard.
echo   ============================================================
echo.

if "%~2"=="first" start "" http://localhost:3000
call npm run start

REM The app exits with this sentinel present when an in-app update was requested.
if exist ".update-and-restart" goto :do_update
goto :eof

:do_update
del ".update-and-restart" >nul 2>nul
echo.
echo   Applying the update from GitHub...
node "scripts\update.mjs" apply
REM Relaunch a fresh copy (picks up launcher changes; no second browser tab).
cmd /c ""%~f0" _run"
exit /b %errorlevel%

:error
echo.
echo   Something went wrong during setup. Please take a screenshot of the
echo   messages above so it can be diagnosed.
echo.
pause
exit /b 1
