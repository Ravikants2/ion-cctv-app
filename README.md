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

- 5 Dashboards: Executive, Financial, Operations, Vendor, Venue
- Sortable table headings and 10-row pagination across data tables
- Excel/PDF export controls on app pages
- Requirement Master upload (CSV/XLSX template)
- Zone-wise Vendor Master upload/download with round-trippable `Zone-12345` Vendor IDs
- Venue analysis with multi-select temporary CCTV day filters, camera counts, hover details, top-cost rankings, and zone comparisons
- Case-insensitive vendor and zone matching for vendor setup and imports
- Super Admin user management: create/delete users, change roles, and change passwords
- Installation Record (single entry + bulk upload)
- Exam date-wise candidate tracking
- Quotation PDF upload and view
- Two-stage quote approvals (Surveillance Head → Head of Enablement), with send-back, mandatory exception remarks, and immutable quote revision history
- Approval comparisons for previous venue costs and quotations, vendor reuse across locations, and project-level total/per-candidate cost rankings
- Zonal user accounts restricted to their assigned zone across Requirements, Records, and Vendors; returned quotes require a resubmission note
- Configurable custom access roles and groups: Super Admins choose page/action permissions and zone scopes; group and role scopes are intersected, and users with no assigned zones see no venue data
- Numeric-only, free-written TC Codes and TC Code filters on the dashboard, requirements, records, and approval queue
- Approval review hierarchy by client and exam, with selectable TC venues, select-all and bulk approval, and per-venue discrepancy remarks
- Venue-wide temporary CCTV day, candidate, accumulated cost, and cost-per-candidate totals; exam/date-level schedule details and venue/vendor cost and approval-history drill-downs
- Clickable, blinking higher-cost alerts that explain the comparison behind each approval warning
- Existing installation records without approval metadata are migrated to pending Surveillance Head review; records with explicit final approval remain approved
- Excel export + PDF/Print reports (A4 landscape)
- Role-based access: Super Admin / Sub Admin / User / Viewer / Zonal User / Surveillance Head / Head of Enablement / configured custom roles
- Backup & Restore (JSON download/upload from header menu)
- All data synced to GitHub `data` branch
- Gemini-powered chat over structured application records

Access roles and zone restrictions are enforced in the client application. They are not server-side authorization boundaries; use a backend with server-enforced access controls before relying on them to protect sensitive data.

## Gemini data chat (demo setup)

The **AI Chat** page sends the current requirements, vendors, joined installation/exam records, and chat messages to Gemini through a Cloudflare Worker. Joined records let it answer cross-category questions (for example, candidates or costs by vendor and exam) and calculate results from the loaded rows. If a question is ambiguous or the data cannot answer it, the assistant asks a follow-up and offers choices from the available data. It excludes user accounts/password hashes, audit logs, and quotation file contents. Chat history is kept only in the current browser tab and is not saved.

The Gemini key must stay in the Worker and must never be added to the frontend, a `VITE_*` secret, or this repository.

The Worker uses `gemini-3.1-flash-lite` by default and retries a request with `gemini-3.8-flash` if the first model returns HTTP 404 (unavailable model) or 429 (rate limit/quota). These defaults can be changed with the `GEMINI_MODEL` and `GEMINI_FALLBACK_MODEL` variables in `worker/wrangler.toml`. A different model may have separate model-specific limits, but no model is guaranteed to have unlimited quota; check the active project limits in Google AI Studio.

### Deploy the chat Worker

1. Create a Cloudflare account and install Wrangler (`npm install --global wrangler`), then authenticate with `npx wrangler login`.
2. Deploy the Worker from the repository root:

   ```powershell
   npx wrangler deploy --config worker/wrangler.toml
   ```

3. Store the rotated Gemini key as a Worker secret (do not paste it into chat or a source file):

   ```powershell
   npx wrangler secret put GEMINI_API_KEY --config worker/wrangler.toml
   ```

4. In the GitHub repository, open **Settings → Secrets and variables → Actions → Variables** and add `VITE_GEMINI_CHAT_ENDPOINT` with the HTTPS URL Wrangler assigned to the Worker. Re-run the Pages workflow to publish the chat endpoint configuration.
5. For local development, set `VITE_GEMINI_CHAT_ENDPOINT` in an ignored `.env.local` file. Set the Worker `ALLOWED_ORIGINS` to include `http://localhost:5173` when testing locally; keep the production GitHub Pages origin in the list as well.

If chat reports that it cannot reach the service, verify that `VITE_GEMINI_CHAT_ENDPOINT` is the deployed Worker URL and that the app's exact origin (including scheme and host) is listed in the Worker `ALLOWED_ORIGINS`; then redeploy the Worker and rebuild the Pages app after changing its endpoint.

The Worker allows only the configured browser origins, limits request size, and forwards the Gemini key only in a server-to-server request. **This is still a demo, not production authorization:** CORS does not authenticate users, and the app's existing login runs in the browser. Do not use chat with sensitive/confidential data or rely on it for per-user data isolation. Production use requires server-verified authentication, access checks, and rate limiting before enabling this endpoint for real users.
