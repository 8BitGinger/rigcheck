@echo off
setlocal
title RigCheck — Broadcast Studio Telemetry
cd /d "%~dp0"

echo ================================================
echo   RigCheck - Broadcast Studio Readiness Console
echo ================================================
echo.

REM 1. Verify Node.js is installed
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js was not found in your PATH.
    echo Please install Node.js v18+ from https://nodejs.org/ and try again.
    pause
    exit /b 1
)

REM 2. Ensure config.json exists
if not exist "config.json" (
    if exist "config.example.json" (
        echo [INFO] config.json not found. Copying config.example.json...
        copy /y "config.example.json" "config.json" >nul
    )
)

REM 3. Install dependencies only if missing
set NEED_INSTALL=0
if not exist "node_modules\express" set NEED_INSTALL=1
if not exist "node_modules\obs-websocket-js" set NEED_INSTALL=1
if not exist "node_modules\systeminformation" set NEED_INSTALL=1

if %NEED_INSTALL%==1 (
    echo [INFO] Installing required Node.js packages...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed. Please check your internet connection or Node setup.
        pause
        exit /b 1
    )
    echo [INFO] Dependencies installed successfully.
) else (
    echo [INFO] Dependencies already installed. Skipping npm install.
)

echo.
echo [INFO] Starting RigCheck server and opening browser...
echo [INFO] Press Ctrl+C in this window to stop RigCheck.
echo.

REM 4. Open browser after brief delay so server binds first
start "" /b cmd /c "timeout /t 2 /nobreak >nul && start http://127.0.0.1:3100"

REM 5. Launch Node server
node server.js

if errorlevel 1 (
    echo.
    echo [ERROR] RigCheck exited unexpectedly.
    pause
)
endlocal
