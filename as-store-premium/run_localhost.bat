@echo off
title Pinky Sales - Localhost Launcher
echo ========================================================
echo Starting Pinky Sales Backend and Frontend on Localhost
echo ========================================================

cd /d "%~dp0"

echo.
echo [1/2] Starting Backend Server on http://localhost:5000 ...
start "Pinky Sales Backend" cmd /k "cd backend && npm start"

timeout /t 2 /nobreak >nul

echo [2/2] Starting Frontend Vite Server on http://localhost:3000 ...
start "Pinky Sales Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo Both servers have been launched in separate terminal windows!
echo - Backend: http://localhost:5000
echo - Frontend: http://localhost:3000
echo.
echo Press any key to exit this launcher window...
pause >nul
