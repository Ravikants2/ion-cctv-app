@echo off
echo Pushing update to Ravikants2/ion-cctv-app...
git remote get-url origin | findstr /i "Ravikants2/ion-cctv-app.git" >nul
IF %ERRORLEVEL% NEQ 0 (
  echo ERROR: This folder is not configured for Ravikants2/ion-cctv-app.
  pause
  exit /b 1
)
git add .
git commit -m "update: %date% %time%"
git push origin main
IF %ERRORLEVEL% NEQ 0 (
  echo Push failed. No force push was attempted.
  pause
  exit /b 1
)
echo.
echo Done! GitHub Actions will rebuild and redeploy automatically.
echo Watch: https://github.com/Ravikants2/ion-cctv-app/actions
pause
