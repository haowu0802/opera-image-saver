@echo off
setlocal enabledelayedexpansion
REM ============================================================
REM  Image Saver - Native Host Installer (bat version)
REM  Extension ID is hardcoded below. Just double-click to run.
REM ============================================================

REM --- Extension ID (change here if needed) ---
set "EXTENSION_ID=mabcellokonpfeadpdclofjgpkpgobok"

REM --- Resolve script directory ---
set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

set "BAT_PATH=%SCRIPT_DIR%\run_host.bat"
set "MANIFEST_PATH=%SCRIPT_DIR%\com.hexwell.image_saver.json"
set "HOST_NAME=com.hexwell.image_saver"

echo ============================================================
echo  Image Saver Native Host Installer
echo ============================================================
echo  Extension ID : %EXTENSION_ID%
echo  Script dir   : %SCRIPT_DIR%
echo  Manifest     : %MANIFEST_PATH%
echo  Host bat     : %BAT_PATH%
echo ============================================================
echo.

REM --- Validate run_host.bat exists ---
if not exist "%BAT_PATH%" (
    echo [ERROR] run_host.bat not found at: %BAT_PATH%
    echo Make sure this script is in the same folder as run_host.bat
    pause
    exit /b 1
)

REM --- Update manifest JSON via Python ---
echo [1/3] Updating manifest JSON...
python -c "import json;p=r'%MANIFEST_PATH%';m=json.load(open(p,'r',encoding='utf-8'));m['path']=r'%BAT_PATH%';m['allowed_origins']=['chrome-extension://%EXTENSION_ID%/'];json.dump(m,open(p,'w',encoding='utf-8'),indent=2,ensure_ascii=False);print('  Manifest updated.')"
if errorlevel 1 (
    echo [ERROR] Failed to update manifest. Is Python installed and in PATH?
    pause
    exit /b 1
)

REM --- Use full path to reg.exe (not always in PATH) ---
set "REG_EXE=%SystemRoot%\System32\reg.exe"
if not exist "%REG_EXE%" set "REG_EXE=reg"

REM --- Register in Windows Registry ---
echo [2/3] Registering in Windows Registry...

REM  Chrome
"%REG_EXE%" add "HKCU\SOFTWARE\Google\Chrome\NativeMessagingHosts\%HOST_NAME%" /ve /t REG_SZ /d "%MANIFEST_PATH%" /f >nul 2>&1
if !errorlevel! equ 0 (
    echo   [OK] Chrome
) else (
    echo   [FAIL] Chrome
)

REM  Opera
"%REG_EXE%" add "HKCU\SOFTWARE\Opera Software\Opera Stable\NativeMessagingHosts\%HOST_NAME%" /ve /t REG_SZ /d "%MANIFEST_PATH%" /f >nul 2>&1
if !errorlevel! equ 0 (
    echo   [OK] Opera
) else (
    echo   [FAIL] Opera
)

REM  Chromium
"%REG_EXE%" add "HKCU\SOFTWARE\Chromium\NativeMessagingHosts\%HOST_NAME%" /ve /t REG_SZ /d "%MANIFEST_PATH%" /f >nul 2>&1
if !errorlevel! equ 0 (
    echo   [OK] Chromium
) else (
    echo   [FAIL] Chromium
)

REM --- Check Python ---
echo [3/3] Checking Python...
python --version >nul 2>&1
if !errorlevel! equ 0 (
    for /f "delims=" %%v in ('python --version 2^>^&1') do set "PY_VER=%%v"
    echo   [OK] %PY_VER%
) else (
    echo   [WARNING] Python not found in PATH. Make sure Python 3 is installed.
)

echo.
echo ============================================================
echo  Installation Complete!
echo ============================================================
echo  Extension ID : %EXTENSION_ID%
echo  Manifest     : %MANIFEST_PATH%
echo.
echo  Next steps:
echo    1. Reload the extension in opera://extensions
echo    2. Open the extension popup and click 'Test Connection'
echo    3. Hover any image on a webpage to save it
echo ============================================================
echo.
pause
