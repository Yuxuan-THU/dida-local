@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Dida Local - Development
if not exist "node_modules" call npm install --no-audit --no-fund
node --disable-warning=ExperimentalWarning server\server.mjs --dev --open