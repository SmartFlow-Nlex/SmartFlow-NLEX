@echo off
title SmartFlow NLEX
rem Opens the SmartFlow NLEX desktop app (Electron) on the live dev server, so it shows every
rem code change as it is saved. Starts the backend and the frontend first if they are not
rem already running; if they are, it reuses them. The desktop shortcut points here.

netstat -ano | findstr /r /c:":4000 .*LISTENING" >nul
if errorlevel 1 (
  echo Starting the backend...
  start "SmartFlow Backend" /min cmd /k "cd /d %~dp0Back-End && npm run dev"
)

netstat -ano | findstr /r /c:":3002 .*LISTENING" >nul
if errorlevel 1 (
  echo Starting the frontend...
  start "SmartFlow Frontend" /min cmd /k "cd /d %~dp0Front-End-Dashboard && npm run dev"
)

echo Waiting for the dashboard...
cd /d "%~dp0Front-End-Dashboard"
call npx wait-on -t 180000 http://127.0.0.1:3002/dashboard
if errorlevel 1 (
  echo The dashboard did not start within 3 minutes. Check the "SmartFlow Frontend" window.
  pause
  exit /b 1
)

rem Launched from VS Code this is set to 1, which makes Electron run as plain Node and crash.
set ELECTRON_RUN_AS_NODE=
rem electron.exe itself rather than "npx electron", which keeps a console window open beside the app.
start "" "%~dp0Front-End-Dashboard\node_modules\electron\dist\electron.exe" .
