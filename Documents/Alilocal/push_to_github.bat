@echo off
cd /d "C:\Users\Administrator\Documents\Alilocal"
echo === Iniciando git ===
git init
git remote remove origin 2>nul
git remote add origin https://github.com/mmc22loco-cyber/locali.git
git add .
git commit -m "v0.3.0 - Locali comparador de precios Israel"
git branch -M main
git push -u origin main
echo === Listo ===
pause
