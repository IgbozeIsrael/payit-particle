@echo off
cd C:\Users\Igboze\payit-particle\payit-particle
start "" node src/server.js
ping 127.0.0.1 -n 4 > nul
cd C:\Users\Igboze\payit-particle\payit-mobile\artifacts\mockup-sandbox
start "" npx vite --host 0.0.0.0 --port 5173
echo Both servers launched.
echo Backend: http://localhost:3000
echo Frontend: http://localhost:5173
exit