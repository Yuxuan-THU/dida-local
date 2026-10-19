@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Stop Dida Local
node scripts\stop.mjs