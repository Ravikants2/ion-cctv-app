@echo off
echo Pushing update to GitHub...
git add .
git commit -m "update: %date% %time%"
git push origin main
echo.
echo Done! GitHub Actions will rebuild and redeploy automatically.
echo Watch: https://github.com/Ravikants2/ion-cctv-app/actions
pause
