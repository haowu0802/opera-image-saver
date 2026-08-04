@echo off
REM Wrapper to launch the Python native messaging host
REM %~dp0 expands to the directory containing this .bat file
python "%~dp0image_saver_host.py"
