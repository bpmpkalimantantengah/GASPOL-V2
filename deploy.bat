@echo off
echo ═══════════════════════════════════════════════
echo   GASPOL V2 — Deploy ke Oracle Cloud VM
echo   Target: 168.110.208.72:/home/opc/GASPOL-V2
echo ═══════════════════════════════════════════════
echo.

set SSH_KEY=D:\2026\Gemini Environment\GASPOL-Backend\ssh-key-2026-06-05.key
set SSH_OPTS=-o StrictHostKeyChecking=no
set REMOTE=opc@168.110.208.72

echo [1/4] Membungkus file ke gaspol-v2-deploy.tar.gz...
tar.exe -czvf gaspol-v2-deploy.tar.gz server.js package.json .env config controllers middlewares routes utils public\css public\js\portal.js public\portal
if %errorlevel% neq 0 (echo GAGAL membungkus file! & exit /b 1)

echo.
echo [2/4] Membuat folder remote dan mengunggah...
ssh -i "%SSH_KEY%" %SSH_OPTS% %REMOTE% "mkdir -p /home/opc/GASPOL-V2"
scp -i "%SSH_KEY%" %SSH_OPTS% gaspol-v2-deploy.tar.gz %REMOTE%:/home/opc/GASPOL-V2/
if %errorlevel% neq 0 (echo GAGAL mengunggah! & exit /b 1)

echo.
echo [3/4] Mengeksekusi di server: extract, install deps, start PM2...
ssh -i "%SSH_KEY%" %SSH_OPTS% %REMOTE% "cd /home/opc/GASPOL-V2 && tar -xzvf gaspol-v2-deploy.tar.gz && npm install --production && (pm2 describe GASPOL-V2 > /dev/null 2>&1 && pm2 restart GASPOL-V2 || pm2 start server.js --name GASPOL-V2 -- --env production) && pm2 save"
if %errorlevel% neq 0 (echo GAGAL eksekusi remote! & exit /b 1)

echo.
echo [4/4] Verifikasi health check...
timeout /t 3 /nobreak > nul
ssh -i "%SSH_KEY%" %SSH_OPTS% %REMOTE% "curl -s http://localhost:4000/health"

echo.
echo ═══════════════════════════════════════════════
echo   Deploy selesai! Akses di:
echo   http://168.110.208.72:4000/portal
echo ═══════════════════════════════════════════════
