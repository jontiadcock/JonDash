@echo off
setlocal
title JonDash
cd /d "%~dp0"

REM Make sure Node.js and Git are reachable even if PATH hasn't refreshed.
if exist "C:\Program Files\nodejs\node.exe" set "PATH=C:\Program Files\nodejs;%PATH%"
if exist "C:\Program Files\Git\cmd\git.exe" set "PATH=C:\Program Files\Git\cmd;%PATH%"

REM ----------------------------------------------------------------------------
REM Stage 1 (first pass): check GitHub for updates, then relaunch the fresh copy
REM of this script so any update to the launcher itself takes effect cleanly.
REM ----------------------------------------------------------------------------
if "%~1"=="_run" goto run

call :check_for_updates
cmd /c ""%~f0" _run"
exit /b %errorlevel%

:check_for_updates
where git >nul 2>nul || goto :eof
if not exist ".git" (
  echo.
  echo   [Auto-update off: this copy wasn't cloned with Git.]
  echo   To get automatic updates, install with:  git clone https://github.com/jontiadcock/JonDash.git
  goto :eof
)
echo.
echo   Checking GitHub for updates...
git fetch --quiet origin
for /f %%i in ('git rev-parse HEAD') do set "LOCAL=%%i"
for /f %%i in ('git rev-parse @{u}') do set "REMOTE=%%i"
if "%LOCAL%"=="%REMOTE%" (
  echo   You're up to date.
) else (
  echo   Update found - downloading the latest version...
  git pull --ff-only
)
goto :eof

REM ----------------------------------------------------------------------------
REM Stage 2 (_run): install, configure, migrate, build, start
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
echo     Your dashboard is starting at:  http://localhost:3000
echo     Leave this window open while you use it.
echo     Close this window to stop the dashboard.
echo   ============================================================
echo.

start "" http://localhost:3000
call npm run start
goto :eof

:error
echo.
echo   Something went wrong during setup. Please take a screenshot of the
echo   messages above so it can be diagnosed.
echo.
pause
exit /b 1
