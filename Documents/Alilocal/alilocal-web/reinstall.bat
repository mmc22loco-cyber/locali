@echo off
echo Borrando node_modules...
rmdir /s /q node_modules
del /f /q package-lock.json
echo Instalando dependencias...
npm install
echo.
echo Listo! Iniciando servidor...
npm run dev
pause
