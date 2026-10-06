@echo off
setlocal
cd /d "%~dp0"
title CHERM Hazard Simulator
echo Starting CHERM Hazard Simulator...
echo Keep this window open while using the app.
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\serve.ps1" -Port 8000 %*
if errorlevel 1 (
    echo.
    echo CHERM could not start. The error is shown above.
    pause
)
