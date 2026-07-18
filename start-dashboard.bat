@echo off
setlocal
title JonDash
cd /d "%~dp0"

REM Make sure Node.js and Git are reachable even if PATH hasn't refreshed.
if exist "C:\Program Files\nodejs\node.exe" set "PATH=C:\Program Files\nodejs;%PATH%"
if exist "C:\Program Files\Git\cmd\git.exe" set "PATH=C:\Program Files\Git\cmd;%PATH%"

REM ----------------------------------------------------------------------------
REM Stage 1 (first pass): offer an update, then relaunch a fresh copy of this
REM script so any change to the launcher itself takes effect cleanly.
REM ----------------------------------------------------------------------------
if "%~1"=="_run" goto run

call :check_for_updates
cmd /c ""%~f0" _run first"
exit /b %errorlevel%

:check_for_updates
where git >nul 2>nul || goto :eof
if not exist ".git" (
  echo.
  echo   [Auto-update off: this copy wasn't installed with Git.]
  echo   For updates, install with:  git clone https://github.com/jontiadcock/JonDash.git
  goto :eof
)
echo.
echo   Checking GitHub for updates...
git fetch --quiet origin
for /f %%i in ('git rev-parse HEAD') do set "LOCAL=%%i"
set "REMOTE=%LOCAL%"
for /f %%i in ('git rev-parse origin/main 2^>nul') do set "REMOTE=%%i"
if "%LOCAL%"=="%REMOTE%" (
  echo   You're up to date.
  goto :eof
)
echo.
choice /C YN /N /T 30 /D N /M "  An update is available. Install it now? [Y/N] (auto-skip in 30s): "
if errorlevel 2 goto :update_skipped
echo   Installing update...
git pull --ff-only origin main
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

echo.
echo   Installing / updating components ^(this can take a few minutes the first time^)...
call npm install
if errorlevel 1 goto :error

REM Create default configuration on first run (the database location).
if not exist ".env" (
  echo   Creating default configuration...
  > ".env" echo DATABASE_URL="file:./dev.db"
)

echo.
echo   Preparing the database...
call npm run db:migrate
if errorlevel 1 goto :error

echo.
echo   Building the app ^(please wait^)...
call npm run build
if errorlevel 1 goto :error

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
where git >nul 2>nul && git pull --ff-only origin main
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
