@echo off
title DLSS 5 Studio v1.0.0 — Dev Mode
cd /d "%~dp0dlss5-studio"

echo ============================================================
echo   DLSS 5 STUDIO  v1.0.0  —  Development Server
echo   Tauri 2 + Rust Core + React 19 + Tailwind CSS
echo ============================================================
echo.

call pnpm tauri dev
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Studio exited with error code %errorlevel%.
    pause
)
