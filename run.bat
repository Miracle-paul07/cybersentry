@echo off
rem Starts CyberSentry and opens the browser.
rem   run.bat              normal start
rem   run.bat --rebuild    rebuild the website first (after changing frontend code)
rem   run.bat --port 8001  use another port
setlocal
title CyberSentry
cd /d "%~dp0"

set "PY=venv\Scripts\python.exe"
if exist "%PY%" goto :have_python
echo.
echo   The Python environment was not found. Create it once with:
echo       python -m venv venv
echo       venv\Scripts\pip install -r requirements.txt
goto :fail

:have_python
if not exist "frontend\dist\index.html" goto :build
echo %* | findstr /i /c:"--rebuild" >nul
if errorlevel 1 goto :start

:build
where npm >nul 2>nul
if not errorlevel 1 goto :have_npm
echo.
echo   The website has not been built yet, and that needs Node.js.
echo   Install the LTS version from https://nodejs.org, then run this again.
goto :fail

:have_npm
echo Building the website...
pushd frontend
if exist "node_modules" goto :npm_build
call npm ci
if errorlevel 1 goto :build_failed
:npm_build
call npm run build
if errorlevel 1 goto :build_failed
popd
goto :start

:build_failed
popd
echo.
echo   Building the website failed. See the messages above.
goto :fail

:start
"%PY%" -m backend.serve %*
if errorlevel 1 goto :fail
exit /b 0

:fail
echo.
pause
exit /b 1
