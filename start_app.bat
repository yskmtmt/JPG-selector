@echo off
echo Starting JPG Downloader...
echo.
echo ======================================================
echo  APP ACCESS INFORMATION
echo ======================================================
echo  Local:   http://localhost:3000
echo  Network: http://192.168.10.144:3000
echo ======================================================
echo.
echo Please wait while the application starts...
start "" "http://localhost:3000"
call npm start
pause
