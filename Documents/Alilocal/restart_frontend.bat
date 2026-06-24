@echo off
echo Matando procesos Node/Vite existentes...
taskkill /f /im node.exe /t 2>nul
timeout /t 2 /nobreak
echo Iniciando frontend Locali...
cd /d C:\Users\Administrator\Documents\Alilocal\alilocal-web
start "AliLocal Frontend" cmd /k "npm run dev"
timeout /t 6 /nobreak
start "" "http://localhost:5173"
