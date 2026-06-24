@echo off
cd /d "C:\Users\Administrator\Documents\Alilocal"
echo === git status === > "Locali\git_output.txt" 2>&1
git status >> "Locali\git_output.txt" 2>&1
echo === git remote === >> "Locali\git_output.txt" 2>&1
git remote -v >> "Locali\git_output.txt" 2>&1
echo === git log === >> "Locali\git_output.txt" 2>&1
git log --oneline -5 >> "Locali\git_output.txt" 2>&1
echo === git add === >> "Locali\git_output.txt" 2>&1
git add . >> "Locali\git_output.txt" 2>&1
echo === git commit === >> "Locali\git_output.txt" 2>&1
git commit -m "v0.3.0 - Locali comparador de precios Israel" >> "Locali\git_output.txt" 2>&1
echo === git push === >> "Locali\git_output.txt" 2>&1
git push -u origin main >> "Locali\git_output.txt" 2>&1
echo === DONE === >> "Locali\git_output.txt" 2>&1
