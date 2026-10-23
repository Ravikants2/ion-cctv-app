@echo off
echo ============================================================
echo  iON CCTV - secure GitHub deployment
echo ============================================================
echo.

git --version >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo ERROR: Git is not installed.
    echo Download from: https://git-scm.com/download/win
    pause
    exit /b 1
)

git remote get-url origin | findstr /i "Ravikants2/ion-cctv-app.git" >nul
IF %ERRORLEVEL% NEQ 0 (
    echo ERROR: This folder is not configured for Ravikants2/ion-cctv-app.
    echo No changes were pushed.
    pause
    exit /b 1
)

echo Pushing the current main branch without force...
git push -u origin main
IF %ERRORLEVEL% NEQ 0 (
    echo Push failed. No force push was attempted.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo  Check the Pages and Worker workflows:
echo    https://github.com/Ravikants2/ion-cctv-app/actions
echo.
echo  App URL: https://ravikants2.github.io/ion-cctv-app/
echo  Real data stays in the private data repository.
echo ============================================================
pause
