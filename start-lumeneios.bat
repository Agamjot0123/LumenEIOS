@echo off
rem ============================================================================================
rem  LumenEIOS - double-click to start everything: backend API, frontend, and the local Qwen
rem  model on the GPU (inside WSL). The app opens in your browser when it is ready.
rem  Close this window or press Ctrl+C to stop the servers.
rem
rem  Works from inside the repository, or copied anywhere (e.g. the Desktop): it then starts the
rem  project at FALLBACK_APP_DIR below.
rem ============================================================================================
setlocal EnableExtensions
title LumenEIOS
rem WSL distribution that holds the project. If it does not exist, the default distribution is used.
set "WSL_DISTRO=Ubuntu"
set "FALLBACK_APP_DIR=/home/agam/DP/arena/apps/lumeneios"

where wsl.exe >nul 2>nul
if errorlevel 1 (
    echo WSL was not found on this computer. Install it with:  wsl --install
    pause
    exit /b 1
)

set "DISTRO_ARG=-d %WSL_DISTRO%"
wsl.exe %DISTRO_ARG% -- true >nul 2>nul
if errorlevel 1 (
    echo WSL distribution "%WSL_DISTRO%" was not found - using the default distribution.
    set "DISTRO_ARG="
)

rem Prefer the copy of the project this file sits in; otherwise use the fallback path.
set "APP_DIR=%FALLBACK_APP_DIR%"
if exist "%~dp0scripts\start-all.sh" (
    for /f "usebackq delims=" %%P in (`wsl.exe %DISTRO_ARG% -- wslpath -a "%~dp0."`) do set "APP_DIR=%%P"
)

echo Starting LumenEIOS from %APP_DIR% ...
echo.
wsl.exe %DISTRO_ARG% --cd "%APP_DIR%" -- bash scripts/start-all.sh
echo.
echo LumenEIOS has stopped.
pause
