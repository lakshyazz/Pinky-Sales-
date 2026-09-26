@echo off
title Pinky Sales - Customer Balance Reconciliation & Audit
echo ========================================================
echo Reconciling Customer Balances & Ledger Entries
echo ========================================================

cd /d "%~dp0backend"

echo Running reconciliation script against Supabase Database...
node scripts/reconcile_customers.js

echo.
echo ========================================================
echo Press any key to exit...
pause >nul
