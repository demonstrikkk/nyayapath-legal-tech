@echo off
REM Start the JollyLLM API and the web app together.
REM
REM   scripts\run.cmd
REM
REM The API needs the Python retrieval engine, which loads a sentence-embedding
REM model on start. That takes one or two minutes the first time. Until it is
REM ready the service answers on sparse matching only and the web app shows a
REM banner saying so. Wait for that banner to clear before judging a result.

setlocal
set ROOT=%~dp0..
pushd "%ROOT%"

echo.
echo   JollyLLM
echo   ---------
echo   API  http://localhost:8787
echo   Web  http://localhost:5173
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   node was not found on PATH. Install Node 18 or newer.
  popd & exit /b 1
)
where python >nul 2>nul
if errorlevel 1 (
  echo   python was not found on PATH. The retrieval engine needs it.
  popd & exit /b 1
)

if not exist "server\node_modules" (
  echo   Installing server dependencies...
  pushd server & call npm install & popd
)
if not exist "web\node_modules" (
  echo   Installing web dependencies...
  pushd web & call npm install & popd
)

start "JollyLLM API" cmd /k "cd /d "%ROOT%\server" && node src\index.js"
start "JollyLLM Web" cmd /k "cd /d "%ROOT%\web" && npm run dev"

echo   Both services starting. This window can be closed.
echo   The web app is at http://localhost:5173
echo.
popd
endlocal
