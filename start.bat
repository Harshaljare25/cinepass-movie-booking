@echo off
title CinePass Movie Ticket Booking Platform
echo ========================================================
echo   CinePass - Online Movie Ticket Booking Platform
echo ========================================================
echo.
echo Checking dependencies and starting live server...
echo Server running at: http://localhost:3000
echo.
start http://localhost:3000
node backend/server.js
pause
