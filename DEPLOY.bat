@echo off
echo ============================================================
echo  iON Survillance Temp. infra(CCTV) - GitHub Deploy Script
echo ============================================================
echo.

REM Check if git is installed
git --version >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo ERROR: Git is not installed.
    echo Download from: https://git-scm.com/download/win
    pause
    exit /b 1
)

echo [1/5] Initialising Git repository...
git init
git branch -M main

echo.
echo [2/5] Adding remote origin...
git remote remove origin 2>nul
git remote add origin https://github.com/Ravikants2/ion-cctv-app.git

echo.
echo [3/5] Staging all files...
git add .

echo.
echo [4/5] Creating initial commit...
git commit -m "deploy: iON Survillance Temp. infra(CCTV) - initial release"

echo.
echo [5/5] Pushing to GitHub (main branch)...
git push -u origin main --force

echo.
echo ============================================================
echo  DONE! Now go to GitHub and complete 2 quick steps:
echo.
echo  STEP A - Add secret DATA_PAT:
echo    https://github.com/Ravikants2/ion-cctv-app/settings/secrets/actions/new
echo    Name:  DATA_PAT
echo    Value: (paste your GitHub Personal Access Token)
echo.
echo  STEP B - Enable GitHub Pages:
echo    https://github.com/Ravikants2/ion-cctv-app/settings/pages
echo    Source: GitHub Actions  ->  Save
echo.
echo  Then go to Actions tab to watch the build:
echo    https://github.com/Ravikants2/ion-cctv-app/actions
echo.
echo  Your app will be live at:
echo    https://ravikants2.github.io/ion-cctv-app/
echo ============================================================
pause
