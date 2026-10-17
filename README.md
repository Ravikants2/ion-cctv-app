# iON Survillance Temp. infra(CCTV)

**Live URL:** https://ravikants2.github.io/ion-cctv-app/

---

## How to Deploy (No Node.js needed on your PC)

All building happens on GitHub's servers via GitHub Actions. You only need **Git** installed.

---

### Step 1 — Create a GitHub Personal Access Token (PAT)

This token lets the live app read/write data to your GitHub repo.

1. Open: https://github.com/settings/tokens?type=beta
2. Click **Generate new token**
3. Name: `ion-cctv-data`
4. Expiration: 1 year
5. Repository access → **Only select repositories** → pick `ion-cctv-app`
6. Permissions:
   - **Contents** → Read and write
   - **Pages** → Read and write
7. Click **Generate token** — copy it immediately

---

### Step 2 — Add the Token as a Secret

1. Open: https://github.com/Ravikants2/ion-cctv-app/settings/secrets/actions/new
2. Name: `DATA_PAT`
3. Value: paste your token
4. Click **Add secret**

---

### Step 3 — Enable GitHub Pages

1. Open: https://github.com/Ravikants2/ion-cctv-app/settings/pages
2. Under **Source** select **GitHub Actions**
3. Click **Save**

---

### Step 4 — Push the Code (one double-click)

1. Make sure **Git** is installed: https://git-scm.com/download/win
2. Double-click **`DEPLOY.bat`** in this folder
3. It will push all files to GitHub automatically

---

### Step 5 — Watch the Build

- Open: https://github.com/Ravikants2/ion-cctv-app/actions
- The workflow runs in ~2 minutes and deploys to GitHub Pages
- App goes live at: **https://ravikants2.github.io/ion-cctv-app/**

---

## How Data is Stored in GitHub

```
Your Browser
    │
    ├── READ  → GitHub API → data branch → db.json
    └── WRITE → GitHub API → commits new db.json to data branch
```

- All data lives in the `data` branch of this repo as `db.json`
- Every save = a new Git commit (full history preserved)
- Works offline too — cached in browser localStorage, syncs when online
- The `data` branch and `db.json` are created automatically on first deploy

---

---

## For Future Updates

Double-click **`PUSH_UPDATE.bat`** — GitHub Actions rebuilds and redeploys automatically.

---

## Features

- 4 Dashboards: Executive, Financial, Operations, Vendor
- Requirement Master upload (CSV/XLSX template)
- Zone-wise Vendor Master upload
- Installation Record (single entry + bulk upload)
- Exam date-wise candidate tracking
- Quotation PDF upload and view
- Excel export + PDF/Print reports (A4 landscape)
- Role-based access: Super Admin / Sub Admin / User / Viewer
- Backup & Restore (JSON download/upload from header menu)
- All data synced to GitHub `data` branch
