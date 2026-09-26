@echo off
title Pinky Sales - Remove Erroneous 19250 Payments (Cash & UPI)
echo ========================================================
echo Removing Wrong 19,250 Payments (PAY-000017 & PAY-000023)
echo ========================================================

cd /d "%~dp0backend"

echo Connecting to Supabase database and removing payments...
node scripts/remove_wrong_payment.js

echo.
echo ========================================================
echo Press any key to exit...
pause >nul
