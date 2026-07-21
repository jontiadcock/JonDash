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
node "scripts\update.mjs" autocheck
REM Exit code 10 means: auto-install is ON and an update should be installed now.
REM Otherwise autocheck just prints the status; the user installs from Admin -> Updates.
if not errorlevel 10 goto :eof
call :log update backup "auto-install: snapshotting current version before update"
node "scripts\rollback.mjs" backup
if not exist ".data" mkdir ".data" >nul 2>nul
> ".data\post-update" echo 1
call :log update apply "auto-installing available update; applying + relaunching (self-overwrite-safe)"
echo   Installing update...
REM update.mjs overwrites this .bat, so chain apply + relaunch + exit on ONE line
REM (cmd buffers the whole line before running it) and never read this file again.
node "scripts\update.mjs" apply & cmd /c ""%~f0" _run first" & exit

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
  call :log build start "building v%APPVER% (need-build: fresh/missing/version-change)"

  echo.
  echo   Installing / updating components ^(this can take a few minutes the first time^)...
  call npm install
  if errorlevel 1 ( set "FAILSTEP=npm install" & goto :build_failed )

  echo.
  echo   Preparing the database...
  call npm run db:migrate
  if errorlevel 1 ( set "FAILSTEP=db:migrate" & goto :build_failed )

  echo.
  echo   Building the app ^(please wait^)...
  call npm run build
  if errorlevel 1 ( set "FAILSTEP=npm run build" & goto :build_failed )

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
  REM A good build was reached: clear the one-shot recovery/revert markers.
  if exist ".data\recovery-attempted" del ".data\recovery-attempted" >nul 2>nul
  if exist ".data\revert-attempted" del ".data\revert-attempted" >nul 2>nul
  call :log build ok "built v%APPVER%; pruned + stripped runtime footprint"
) else (
  echo.
  echo   Already up to date and built ^(v%APPVER%^) — starting up.
  REM Healthy fast-path start: clear the one-shot recovery/revert markers.
  if exist ".data\recovery-attempted" del ".data\recovery-attempted" >nul 2>nul
  if exist ".data\revert-attempted" del ".data\revert-attempted" >nul 2>nul
)

REM Work out the real address (scheme/host/port) from the network config.
set "DISPLAYURL=http://localhost:3000"
for /f "usebackq tokens=* delims=" %%u in (`node "scripts\print-url.mjs" 2^>nul`) do set "DISPLAYURL=%%u"

echo.
echo   ============================================================
echo     Your dashboard is running at:  %DISPLAYURL%
echo     Leave this window open while you use it.
echo     Close this window to stop the dashboard.
echo   ============================================================
echo.

if "%~2"=="first" start "" "%DISPLAYURL%"
call :log start starting "launching the supervised server for v%APPVER%"
REM The supervisor owns the running server: it captures crashes to logs\, restarts
REM on an unexpected crash (with a crash-loop guard), and reports the outcome via its
REM exit code. Capture the code before any other command overwrites errorlevel.
node "scripts\supervise.mjs"
set "SUPCODE=%errorlevel%"
call :log start stopped "supervisor exited (code=%SUPCODE%)"

REM 10 = in-app update requested; 11 = boot-crash after an update (revert);
REM 12 = persistent boot-crash (not an update); 13 = module change needs a rebuild;
REM anything else = clean stop.
if "%SUPCODE%"=="10" goto :do_update
if "%SUPCODE%"=="11" goto :revert
if "%SUPCODE%"=="12" goto :crash_help
if "%SUPCODE%"=="13" goto :do_rebuild
goto :eof

REM ----------------------------------------------------------------------------
REM A module was installed or removed. Its code is compiled into the app, so clear
REM the built-version marker to force the normal build path and relaunch. If that
REM build fails, :build_failed removes the offending module first (see :module_recover).
REM Nothing is downloaded here — the module's files are already on disk.
REM ----------------------------------------------------------------------------
:do_rebuild
del ".rebuild-and-restart" >nul 2>nul
call :log build rebuild "module change — rebuilding before restart"
echo.
echo   Applying the module change ^(rebuilding, please wait^)...
if exist ".data\built-version" del ".data\built-version" >nul 2>nul
cmd /c ""%~f0" _run"
exit /b %errorlevel%

:do_update
del ".update-and-restart" >nul 2>nul
call :log update backup "in-app update: snapshotting current version before update"
node "scripts\rollback.mjs" backup
if not exist ".data" mkdir ".data" >nul 2>nul
> ".data\post-update" echo 1
call :log update apply "in-app update; applying + relaunching (self-overwrite-safe)"
echo.
echo   Applying the update from GitHub...
REM update.mjs overwrites this .bat, so chain apply + relaunch + exit on ONE line
REM (cmd buffers the whole line first) so we never re-read this file mid-rewrite.
node "scripts\update.mjs" apply & cmd /c ""%~f0" _run" & exit /b

REM ----------------------------------------------------------------------------
REM Auto-recovery: if a setup step failed, wipe the regenerable folders and retry
REM the launch ONCE from clean. A marker in .data guards against an endless loop.
REM ----------------------------------------------------------------------------
:build_failed
call :log recovery failed "step failed: %FAILSTEP%"
REM A module install/update was in flight: remove that module and retry before anything
REM heavier. module-recover.mjs clears its own marker, so this can only run once.
if exist ".data\module-installing" goto :module_recover
REM First failure: try a one-time clean rebuild (fixes a corrupt/partial install).
if not exist ".data\recovery-attempted" goto :clean_retry
REM Clean rebuild already tried. If this was a failed UPDATE and we still have a
REM snapshot and haven't reverted yet, roll back to the previous working version.
if exist ".data\post-update" if exist ".data\rollback\snapshot" if not exist ".data\revert-attempted" goto :revert
goto :recovery_exhausted

REM A module broke the build: remove it, regenerate the registry, and build again
REM without it. The app tells the admin which module was removed on next sign-in.
:module_recover
call :log recovery module "build failed after a module change; removing the module"
echo.
echo   A module prevented the app from building. Removing it and rebuilding...
echo.
node "scripts\module-recover.mjs"
cmd /c ""%~f0" _run"
exit /b %errorlevel%

:clean_retry
if not exist ".data" mkdir ".data" >nul 2>nul
> ".data\recovery-attempted" echo 1
call :log recovery retry "wiping node_modules + .next and retrying launch once"
echo.
echo   Setup failed at: %FAILSTEP%
echo   Attempting a one-time automatic recovery ^(rebuilding from a clean state^)...
echo.
if exist "node_modules" rmdir /S /Q "node_modules" >nul 2>nul
if exist ".next" rmdir /S /Q ".next" >nul 2>nul
cmd /c ""%~f0" _run"
exit /b %errorlevel%

REM Roll a failed update back to the previously-running version, note it (so the app
REM warns the user + it isn't auto-retried), and relaunch to rebuild the good version.
:revert
call :log recovery revert "update failed; rolling back to the previous version"
echo.
echo   The last update did not start correctly. Rolling back to the previous version...
echo.
node "scripts\rollback.mjs" mark-failed %APPVER%
del ".data\post-update" >nul 2>nul
del ".data\recovery-attempted" >nul 2>nul
if not exist ".data" mkdir ".data" >nul 2>nul
> ".data\revert-attempted" echo 1
REM restore overwrites this .bat (the snapshot includes it), so chain restore +
REM relaunch + exit on ONE buffered line and never re-read this file mid-rewrite.
node "scripts\rollback.mjs" restore & cmd /c ""%~f0" _run" & exit /b

:crash_help
call :log recovery crash "server keeps crashing on startup (not an update)"
echo.
echo   The dashboard server keeps crashing shortly after starting.
echo   This does not appear to be from an update. Please look in the  logs\  folder
echo   ^(server-*.log has the crash output^) and take a screenshot so it can be diagnosed.
echo.
pause
exit /b 1

:recovery_exhausted
call :log recovery exhausted "clean rebuild also failed at: %FAILSTEP%"
echo.
echo   Automatic recovery was already attempted once and setup still failed
echo   ^(last failing step: %FAILSTEP%^).
echo   Please look in the  logs\  folder and take a screenshot of the messages
echo   above so it can be diagnosed.
echo.
pause
exit /b 1

REM ----------------------------------------------------------------------------
REM :log  <phase> <status> [detail...]  — append a redacted line to logs\.
REM Reached only via CALL; the EXIT /B above stops fall-through.
REM ----------------------------------------------------------------------------
:log
node "scripts\log.mjs" %* >nul 2>nul
goto :eof
