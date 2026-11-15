@echo off
rem ============================================================================================
rem  LumenEIOS - double-click to STOP everything: all backend servers (which unloads the Qwen model
rem  and frees the GPU) and all frontends, including ones left running by earlier sessions.
rem ============================================================================================
setlocal EnableExtensions
title Stop LumenEIOS
set "WSL_DISTRO=Ubuntu"
set "FALLBACK_APP_DIR=/home/agam/DP/arena/apps/lumeneios"

where wsl.exe >nul 2>nul
if errorlevel 1 (
    echo WSL was not found on this computer.
    pause
    exit /b 1
)
set "DISTRO_ARG=-d %WSL_DISTRO%"
wsl.exe %DISTRO_ARG% -- true >nul 2>nul
if errorlevel 1 set "DISTRO_ARG="

set "APP_DIR=%FALLBACK_APP_DIR%"
if exist "%~dp0scripts\stop-all.sh" (
    for /f "usebackq delims=" %%P in (`wsl.exe %DISTRO_ARG% -- wslpath -a "%~dp0."`) do set "APP_DIR=%%P"
)
wsl.exe %DISTRO_ARG% --cd "%APP_DIR%" -- bash scripts/stop-all.sh
echo.
pause
