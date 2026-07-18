@echo off
setlocal
title JonDash
cd /d "%~dp0"

REM Make sure Node.js is reachable even if PATH hasn't refreshed.
if exist "C:\Program Files\nodejs\node.exe" set "PATH=C:\Program Files\nodejs;%PATH%"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed.
  echo   Please install it from https://nodejs.org ^(LTS version^), then run this again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo.
  echo   First-time setup: installing components. This can take a few minutes...
  echo.
  call npm install
  if errorlevel 1 goto :error
)

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
