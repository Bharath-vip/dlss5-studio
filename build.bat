@echo off
title DLSS 5 Studio v1.0.0 — Build
cd /d "%~dp0dlss5-studio"

echo ============================================================
echo   DLSS 5 STUDIO  v1.0.0  —  Production Build
echo   Requires: Rust + Cargo  |  Node.js + pnpm
echo ============================================================
echo.
echo [1/2] Building frontend (React + Vite)...
call pnpm build
if %errorlevel% neq 0 (
    echo [ERROR] Frontend build failed. Exiting.
    pause
    exit /b 1
)

echo.
echo [2/2] Building Tauri desktop application (Rust + NSIS installer)...
call pnpm tauri build
if %errorlevel% neq 0 (
    echo [ERROR] Tauri build failed. Exiting.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo   BUILD COMPLETE
echo   Installer: dlss5-studio\src-tauri\target\release\bundle\
echo ============================================================
pause
