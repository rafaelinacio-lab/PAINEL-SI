@echo off
cd /d "%~dp0\.."
echo ============================================ >> scripts\sync.log
echo Execucao iniciada em %date% %time% >> scripts\sync.log
node scripts\sync-movidesk.js incremental >> scripts\sync.log 2>&1
echo Execucao finalizada em %date% %time% (exit code %ERRORLEVEL%) >> scripts\sync.log
