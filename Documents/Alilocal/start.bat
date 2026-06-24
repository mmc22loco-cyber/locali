@echo off
echo Iniciando AliLocal...

REM Instalar dependencias si faltan
py -3.12 -m pip install uvicorn fastapi httpx anthropic --quiet

REM Backend FastAPI
start "AliLocal Backend" cmd /k "cd /d C:\Users\Administrator\Documents\Alilocal && py -3.12 -m uvicorn main:app --reload --port 8000"

REM Frontend Vite
start "AliLocal Frontend" cmd /k "cd /d C:\Users\Administrator\Documents\Alilocal\alilocal-web && npm run dev"

echo.
echo Servidores iniciando...
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:5173
echo.
timeout /t 4
start "" "http://localhost:5173"
