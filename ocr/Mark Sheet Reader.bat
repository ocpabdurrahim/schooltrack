@echo off
rem Opens the Mark Sheet Reader window. Double-click this file.
cd /d "%~dp0"
start "" ".venv\Scripts\pythonw.exe" "app.py"
