@echo off
setlocal
set "TESTPY=%TEMP%\spmt-xbox-overlay-bay-test.py"

echo ============================================================
echo SpaceMountain / SPMT Xbox Overlay Bay Live Test
echo ============================================================
echo.

echo Downloading the current test launcher from SPMT...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing 'https://spmt.live/downloads/xbox-overlay-bay-test.py' -OutFile '%TESTPY%'"
if errorlevel 1 (
  echo.
  echo Could not download the test script from spmt.live.
  pause
  exit /b 1
)

where py >nul 2>nul
if %errorlevel%==0 (
  py -3 "%TESTPY%"
  goto done
)

where python >nul 2>nul
if %errorlevel%==0 (
  python "%TESTPY%"
  goto done
)

echo.
echo Python 3 was not found. Install Python 3 and run this file again.

:done
echo.
pause
