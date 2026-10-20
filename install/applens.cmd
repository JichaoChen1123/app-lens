@echo off
setlocal
node "%~dp0..\scripts\rea.mjs" %*
exit /b %errorlevel%
