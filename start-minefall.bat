@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20+ is required. Install Node.js, then run this file again.
  pause
  exit /b 1
)
if not exist "node_modules\ws\package.json" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo Dependency install failed. Check your internet connection and npm output.
    pause
    exit /b 1
  )
)
echo Starting MINEFALL 1.0.0-rc.2...
call npm start
pause
