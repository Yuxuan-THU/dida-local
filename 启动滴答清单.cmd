@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Dida Local
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 or newer is required: https://nodejs.org/
  pause
  exit /b 1
)
if not exist "node_modules" (
  echo First run: installing dependencies...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo Dependency install failed.
    pause
    exit /b 1
  )
)
node scripts\launch.mjs
if errorlevel 1 pause