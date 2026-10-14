@echo off
chcp 65001 >nul
setlocal
title 島嶼地圖
cd /d "%~dp0"

echo.
echo   島嶼地圖　啟動中
echo.

where node >nul 2>nul
if errorlevel 1 goto :nonode

node "%~dp0server.mjs"
goto :end

:nonode
echo   找不到 node，所以本機伺服器起不來。
echo.
echo   下一步：去 https://nodejs.org 下載 LTS 版安裝，
echo   裝完把這個視窗關掉，重新雙擊「啟動.bat」一次就好。
echo.
pause
goto :eof

:end
echo.
echo   已經關閉。
timeout /t 3 >nul
