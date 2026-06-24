@echo off
cd /d C:\Users\Administrator\Documents\Alilocal
py -3.12 -m uvicorn main:app --reload --port 8000
