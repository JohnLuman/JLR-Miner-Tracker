@echo off
setlocal
title JLR Tracker Companion Installer
set "JLR_DIR=%LOCALAPPDATA%\JLRMinerTracker\Companion"
set "JLR_PS1=%JLR_DIR%\JLR-Tracker-Companion.ps1"
set "JLR_STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\JLR Tracker Companion.cmd"

if not exist "%JLR_DIR%" mkdir "%JLR_DIR%"
echo Installing JLR Tracker Companion...

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing 'https://jlr-miner-tracker-production.up.railway.app/downloads/JLR-Tracker-Companion.ps1' -OutFile '%JLR_PS1%'; Unblock-File '%JLR_PS1%'"
if errorlevel 1 (
  echo.
  echo Installation failed while downloading the companion.
  pause
  exit /b 1
)

> "%JLR_STARTUP%" echo @echo off
>> "%JLR_STARTUP%" echo start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%JLR_PS1%"

echo Starting JLR Tracker Companion...
start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%JLR_PS1%"
echo.
echo Installed. Look for JLR Tracker Companion in the Windows system tray.
echo It will ask for the one-time pairing code from JLR Miner Tracker ^> BRAIN.
timeout /t 5 >nul
exit /b 0
