# ARCHITECTURE.md
## RFQ Automated Report Generation System
**MES Estimating Department | Internal Enterprise Tool**
**Version:** 1.0.0 | **Classification:** Internal Use Only | **Last Reviewed:** March 2026

---

## Table of Contents
1. [Executive Summary & Business Value](#1-executive-summary--business-value)
2. [System Architecture & Tech Stack](#2-system-architecture--tech-stack)
3. [Project Structure](#3-project-structure)
4. [Data Flow](#4-data-flow)
5. [Target Enterprise Deployment](#5-target-enterprise-deployment)
6. [Security & Credentials](#6-security--credentials)

---

## 1. Executive Summary & Business Value

### What This Application Does
The **RFQ Automated Report Generation System** is an internal desktop application that automates the weekly production of Open RFQ (Request for Quotation) status reports for the MES Estimating Department. The application replaces a manual, error-prone spreadsheet process with a reliable, one-click workflow that produces consistent, correctly formatted Excel reports for each supplier geography the department engages.

### Workflow Automated
Each week, the Estimating Department must deliver four country-specific Open RFQ reports — for **India, China, Mexico, and Vietnam** — to internal stakeholders. Historically, this required manually:
1. Exporting raw RFQ data from the source tracking workbook
2. Filtering and splitting data by target country
3. Applying conditional formatting, date-based color coding, and column styling to each country's template
4. Updating report headers with the current week's date
5. Distributing finalized reports

This application fully automates steps 1–4, reducing report generation time from approximately **2–3 hours per week to under 60 seconds**, while eliminating formatting inconsistencies and human error.

### Business Value
| Value Driver | Description |
|---|---|
| **Operational Efficiency** | Reduces weekly reporting effort from hours to seconds; frees estimating staff for higher-value work |
| **Consistency & Accuracy** | Eliminates manual copy-paste errors; enforces a validated 18-column schema every run |
| **Audit-Ready Outputs** | Standardized, date-stamped Excel reports with conditional formatting for at-risk delivery dates |
| **Supplier Visibility** | Embedded "Quoted RFQs" dashboard gives real-time visibility into which RFQs have active quotes |
| **Low Maintenance** | No database dependency, no external SaaS subscription, no recurring license cost |
| **Scalability** | Adding a new country requires only a two-line config change and a corresponding template file |

---

## 2. System Architecture & Tech Stack

### Architecture Pattern
The application follows a **hybrid desktop architecture**: a lightweight **Electron-based GUI** (TypeScript) orchestrates a **Python ETL pipeline** as a managed subprocess. This decouples the user interface from the data processing logic, allowing each layer to be maintained, tested, or replaced independently.

```
┌──────────────────────────────────────────┐
│         PRESENTATION LAYER               │
│   Electron 33 + TypeScript + Vite 6      │
│   (Context-isolated renderer process)    │
└───────────────────┬──────────────────────┘
                    │ IPC (contextBridge)
                    ↓
┌──────────────────────────────────────────┐
│           ORCHESTRATION LAYER            │
│   Electron Main Process (Node.js)        │
│   python-runner.ts, csv-reader.ts        │
└───────────────────┬──────────────────────┘
                    │ Child Process (spawn)
                    ↓
┌──────────────────────────────────────────┐
│           PROCESSING LAYER               │
│   Python 3 ETL Pipeline                  │
│   All_in_onescript_v1.py                 │
│   (pandas + openpyxl)                    │
└───────────────────┬──────────────────────┘
                    │ File I/O
                    ↓
┌──────────────────────────────────────────┐
│              DATA LAYER                  │
│   Local .xlsx files (source + templates) │
│   Generated .xlsx reports + .csv exports │
└──────────────────────────────────────────┘
```

### Technology Stack

#### Backend — Python ETL Pipeline
| Component | Technology | Version | Purpose |
|---|---|---|---|
| Runtime | Python | 3.7+ | Script execution environment |
| Data manipulation | pandas | Latest stable | DataFrame processing, CSV I/O, date sorting |
| Excel I/O | openpyxl | Latest stable | Reading/writing .xlsx, styles, conditional formatting |
| Standard library | pathlib, re, datetime, sys | Built-in | File paths, regex, date arithmetic |

#### Frontend — Electron Desktop UI
| Component | Technology | Version | Purpose |
|---|---|---|---|
| Desktop framework | Electron | 33.2.0 | Cross-process GUI, OS integration |
| Language | TypeScript | 5.7.0 | Type-safe application logic |
| Build tool | Vite | 6.0.0 | Fast bundling for main/renderer/preload processes |
| Packaging | Electron Forge | 7.6.0 | App packaging and Windows installer creation |
| Installer | Squirrel.Windows | (via Forge) | Auto-updating Windows .exe installer |
| CSV parsing | PapaParse | 5.5.3 | Client-side CSV parsing for the Quoted RFQs dashboard |

#### No External APIs, No AI/ML Models, No Cloud Services
This application operates entirely **offline and on-premises**. It has no dependency on external APIs, AI/ML inference services, or cloud data stores. All data processing occurs locally on the user's machine using the files in the working directory.

---

## 3. Project Structure

```
Automated Report Generation/
│
├── All_in_onescript_v1.py            # Core Python ETL pipeline (3-step)
│
├── Launch RFQ Report Generator.bat  # Windows batch launcher (npm start)
├── Launch RFQ Report Generator.vbs  # Silent VBScript launcher (no console window)
│
├── [SOURCE DATA]
│   └── RFQ_Finished Component.xlsx  # Master input — RFQ tracking workbook (sheet: RFQs)
│
├── [COUNTRY TEMPLATES]              # Pre-formatted Excel shells (header row 5, styles, CF rules)
│   ├── China_Template.xlsx
│   ├── India_Template.xlsx
│   ├── Mexico_Template.xlsx
│   └── Vietnam_Template.xlsx
│
├── [PIPELINE INTERMEDIATES]         # Generated per run; safe to delete between runs
│   ├── OpenRFQ.csv                  # Step 1 output — 18-column master CSV
│   ├── China.xlsx                   # Step 2 output — country-split workbook
│   ├── India.xlsx
│   ├── Mexico.xlsx
│   └── Vietnam.xlsx
│
├── [FINAL REPORT OUTPUTS]           # Delivered artifacts — named with upcoming Monday date
│   ├── Open RFQ Report {Date} - China.xlsx
│   ├── Open RFQ Report {Date} - India.xlsx
│   ├── Open RFQ Report {Date} - Mexico.xlsx
│   └── Open RFQ Report {Date} - Vietnam.xlsx
│
├── Quoted_RFQs_Export.csv           # On-demand export of RFQs with quotes received
│
└── rfq-app/                         # Electron desktop application
    ├── package.json                 # NPM manifest (dependencies, scripts, version)
    ├── package-lock.json            # Lockfile for reproducible installs
    ├── forge.config.ts              # Electron Forge packaging config (Squirrel installer)
    ├── tsconfig.json                # TypeScript compiler config (ES2022, strict)
    ├── vite.main.config.ts          # Vite config — main process bundle
    ├── vite.preload.config.ts       # Vite config — preload script bundle
    ├── vite.renderer.config.ts      # Vite config — renderer (UI) bundle
    │
    ├── assets/
    │   └── icon.ico                 # Application icon (Windows)
    │
    └── src/
        ├── main/
        │   ├── main.ts              # Electron main process: window creation, IPC handlers
        │   ├── preload.ts           # Context bridge: secure IPC surface for renderer
        │   ├── python-runner.ts     # Spawns Python subprocess, streams stdout to UI
        │   └── csv-reader.ts        # Reads OpenRFQ.csv, filters quoted RFQs, exports CSV
        │
        └── renderer/
            ├── index.html           # UI shell: 4 sections (file select, progress, reports, quotes)
            ├── renderer.ts          # UI event handlers, DOM updates, table rendering
            └── styles.css           # Dark theme design system (red/charcoal, 461 lines)
```

---

## 4. Data Flow

The pipeline executes in three sequential steps, all triggered by a single user action ("Generate Reports").

### Step 0 — User Initiates Run
1. User launches the application via `Launch RFQ Report Generator.bat` or `.vbs`.
2. Electron app starts; main process initializes a `BrowserWindow` with `contextIsolation: true` and `nodeIntegration: false`.
3. The renderer (UI) auto-detects `RFQ_Finished Component.xlsx` in the working directory via the `app:getDefaultFile` IPC handler. If found, the file path is pre-populated; otherwise the user browses manually.
4. User clicks **"Generate Reports"**. The renderer calls `window.api.runReport(filePath)` via the preload context bridge.
5. Main process receives the `report:run` IPC event and invokes `python-runner.ts`.

### Step 1 — Build Master CSV (`step1_build_master_csv`)
| # | Action | Input | Output |
|---|---|---|---|
| 1.1 | Detect Python executable | `PATH` | `python` / `python3` / `py` |
| 1.2 | Copy source file to expected name (if renamed) | User-selected `.xlsx` | `RFQ_Finished Component.xlsx` |
| 1.3 | Spawn `All_in_onescript_v1.py` as child process | Script path, CWD | Running subprocess |
| 1.4 | Auto-detect header row in source workbook | `RFQ_Finished Component.xlsx`, sheet `RFQs` | Header row index (expected row 5) |
| 1.5 | Read all rows into DataFrame | Sheet `RFQs` | Raw pandas DataFrame |
| 1.6 | Map source columns → 18 FINAL_COLUMNS schema | Source column names | Normalized DataFrame |
| 1.7 | Trim whitespace; sort by `Need By Date` ascending (blanks last) | DataFrame | Sorted, clean DataFrame |
| 1.8 | Write to `OpenRFQ.csv` (UTF-8 with BOM) | DataFrame | `OpenRFQ.csv` (18 cols) |
| 1.9 | Attach `_InvitedSupplier` temp column for downstream filtering | Source DataFrame | In-memory DataFrame only |

**FINAL_COLUMNS Schema (18 columns):**
`RFQ #` · `Customer Company` · `Need By Date` · `Creation Date` · `Sales Account Manager` · `RFQ Coordinator` · `Project Name` · `Invited Supplier Count` · `Quoted Supplier Count` · `Commodity` · `Process` · `RFQ Type / Classification` · `Total Parts` · `Total Quantity` · `Floated Country` · `Open Floated Country` · `Standards Requirement` · `Internal Comments`

### Step 2 — Split by Country (`step2_split_by_country`)
For each country in `{India: IN, China: CN, Mexico: MX, Vietnam: VN}`:

| # | Action | Detail |
|---|---|---|
| 2.1 | Filter master DataFrame by country code | `cell_has_code(cell, code)` — handles comma/semicolon/space delimiters, case-insensitive |
| 2.2 | **Mexico only:** exclude supplier exclusion filter | Rows where `_InvitedSupplier` contains `"metrics works saltillo"` (case-insensitive substring) are dropped |
| 2.3 | Drop all `_`-prefixed temporary columns | Ensures no internal columns leak into output files |
| 2.4 | Append empty `Comments` column | Placeholder for downstream manual annotations |
| 2.5 | Write to `{Country}.xlsx` | Country-specific intermediate workbook |

### Step 3 — Format into Templated Reports (`step3_format_country_reports`)
For each country:

| # | Action | Detail |
|---|---|---|
| 3.1 | Calculate report date | Upcoming Monday (if today is Monday, next Monday) |
| 3.2 | Load `{Country}.xlsx` (data) and `{Country}_Template.xlsx` (format) | Two separate workbooks |
| 3.3 | Detect header row in template | Scan up to 80 rows; match ≥ 4 known column headers |
| 3.4 | Write data rows into template | Copy cell styles from header row; apply wrap_text |
| 3.5 | Apply conditional formatting to columns A–Q | **Gold** (FFF2CC): Need By within 14 days of Monday · **Orange** (FFFFA500): Need By overdue |
| 3.6 | Enable auto-row-height | Reset row heights to `None`; Excel recalculates on open |
| 3.7 | Update cell A5 with report date string | Regex replace of existing date patterns |
| 3.8 | Save as `Open RFQ Report {Date} - {Country}.xlsx` | Final deliverable |

### Step 4 — Progress Streaming & Completion
1. Python script prints structured log lines to stdout: `[OK]`, `[INFO]`, `[WARN]`, `[ERROR]`, `[SUCCESS]`.
2. `python-runner.ts` parses each line and emits `report:progress` IPC events to the renderer in real time.
3. On Python process exit code `0`, runner scans directory for `Open RFQ Report*.xlsx` files and emits `report:complete` with the file list.
4. Renderer displays generated report files with **Open** buttons (invokes `shell.openPath`).

### Step 5 — Quoted RFQs Dashboard (On-Demand)
1. `csv-reader.ts` reads `OpenRFQ.csv` and filters rows where `Quoted Supplier Count ≥ 1`.
2. Data is rendered as an interactive HTML table in the UI (Section 4).
3. User can **Export** the filtered rows to `Quoted_RFQs_Export.csv` (UTF-8 with BOM, Excel-compatible).

---

## 5. Target Enterprise Deployment

While the application currently runs as a local desktop tool, the following outlines a path to enterprise-grade deployment within a **Microsoft Azure** environment, suitable for centralized management, SSO integration, and IT governance.

### 5.1 Containerization (Docker)
The Python processing layer is stateless and file-system-based, making it well-suited for containerization.

```dockerfile
# Base image with Python and required libraries
FROM python:3.11-slim
WORKDIR /app
COPY All_in_onescript_v1.py .
COPY *_Template.xlsx .
RUN pip install pandas openpyxl
ENTRYPOINT ["python", "All_in_onescript_v1.py"]
```

- The Electron UI layer would be packaged separately as a Windows desktop app (`.exe` via Electron Forge / Squirrel) and distributed via **Microsoft Intune** or **SCCM** for managed endpoints.
- The Python backend container would be deployed to **Azure Container Apps** or **Azure App Service (Linux)**, exposing a REST endpoint that accepts an uploaded `.xlsx` and returns generated reports as a ZIP archive.
- This decouples the processing engine from the client machine's Python installation dependency.

### 5.2 Azure App Service Deployment
| Component | Azure Service | Notes |
|---|---|---|
| Python ETL API | Azure App Service (Linux, P1v3 or higher) | Stateless; scale-out supported |
| File staging | Azure Blob Storage | Temporary upload/download of source and output files |
| Secrets management | Azure Key Vault | All credentials, connection strings, API keys |
| Identity & access | Azure Entra ID (formerly AAD) | SSO for all users; role-based access |
| Monitoring | Azure Application Insights | Request traces, error logs, performance metrics |
| CI/CD | Azure DevOps Pipelines | Automated build, test, and deployment |

### 5.3 Azure Entra ID — Single Sign-On (SSO)
- The Electron desktop client would be registered as an **Entra ID App Registration** (public client / native app).
- Authentication would use the **MSAL for Electron** library (`@azure/msal-node`) with the **Authorization Code + PKCE** flow.
- Users sign in with their corporate credentials; no separate username/password for the tool.
- Role assignments (e.g., `RFQ.Generate`, `RFQ.ViewOnly`) would be managed in Entra ID and enforced by the backend API.
- **Conditional Access Policies** (e.g., require compliant device, MFA) apply automatically through Entra ID.

### 5.4 Azure Blob Storage — File Handling
```
Storage Account
└── Container: rfq-reports
    ├── input/      ← Source .xlsx uploads (TTL: 24 hours)
    ├── output/     ← Generated report .xlsx files (TTL: 30 days)
    └── templates/  ← Country template files (versioned, read-only)
```
- SAS tokens (short-lived, scoped) generated by the backend API and returned to the Electron client for direct blob upload/download — the client never holds a storage account key.

### 5.5 Target Architecture Diagram (Azure)
```
┌─────────────────────────────────────────────────────────────────┐
│  Corporate Network / Managed Endpoint                           │
│                                                                 │
│  ┌──────────────────────────┐                                   │
│  │  Electron Desktop App    │                                   │
│  │  (Deployed via Intune)   │◄──── Azure Entra ID SSO (MSAL)   │
│  └──────────┬───────────────┘                                   │
│             │ HTTPS + Bearer Token                              │
└─────────────┼───────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Microsoft Azure                                                │
│                                                                 │
│  ┌──────────────────────┐    ┌──────────────────────────────┐  │
│  │  Azure App Service   │◄───│  Azure Blob Storage          │  │
│  │  (Python ETL API)    │    │  input/ output/ templates/   │  │
│  │  Python 3.11         │───►│  (SAS token access)          │  │
│  │  pandas + openpyxl   │    └──────────────────────────────┘  │
│  └──────────┬───────────┘                                       │
│             │                ┌──────────────────────────────┐  │
│             └───────────────►│  Azure Key Vault             │  │
│                              │  (secrets, connection strs)  │  │
│                              └──────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Azure Application Insights  │  Azure Entra ID           │  │
│  │  (telemetry, error logging)  │  (SSO, RBAC, CA policies) │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Security & Credentials

### 6.1 Current Posture (Local Deployment)
The application in its current form has a **minimal attack surface**:

| Control | Status | Detail |
|---|---|---|
| No external network calls | ✅ Enforced | Fully offline; no HTTP requests, no cloud APIs |
| No credentials stored | ✅ Enforced | No passwords, API keys, or tokens in any file |
| No database connections | ✅ Enforced | File-system only; no SQL, no NoSQL |
| Electron context isolation | ✅ Enforced | `contextIsolation: true`; renderer has no direct Node.js access |
| Node integration disabled | ✅ Enforced | `nodeIntegration: false`; prevents renderer-to-OS access |
| Content Security Policy | ✅ Enforced | Strict CSP in production (`default-src 'self'`); relaxed only in dev mode |
| Subprocess sandboxing | ✅ Enforced | Python process spawned with explicit CWD; stdin ignored; stdout/stderr captured |
| `.env` files | N/A | No environment variables used; no `.env` file present |

### 6.2 Source Control — `.env` and Secrets Exclusion
When this project is onboarded to version control (Azure DevOps Repos or GitHub Enterprise), a `.gitignore` file must be established with the following minimums:

```gitignore
# Environment & secrets — NEVER commit
.env
.env.*
*.pem
*.key
secrets.json

# Generated outputs — exclude from source control
OpenRFQ.csv
Quoted_RFQs_Export.csv
China.xlsx
India.xlsx
Mexico.xlsx
Vietnam.xlsx
Open RFQ Report*.xlsx

# Build artifacts
rfq-app/node_modules/
rfq-app/.vite/
rfq-app/out/
__pycache__/
*.pyc
```

**Policy:** No credentials, API keys, connection strings, or personally identifiable information (PII) shall ever be committed to source control. This is enforced by `.gitignore` and, in the enterprise deployment, by **Azure DevOps secret scanning** and **pre-commit hooks**.

### 6.3 Azure Key Vault — Production Credentials Management
In the target Azure deployment, all secrets are externalized from the application binary and source code:

| Secret Type | Storage Location | Access Method |
|---|---|---|
| Storage account connection string | Azure Key Vault | Managed Identity (no password) |
| Entra ID client secret (if used) | Azure Key Vault | App Service environment variable reference (`@Microsoft.KeyVault(...)`) |
| Any future API keys | Azure Key Vault | Managed Identity |
| Application configuration | Azure App Configuration | Key Vault references |

The Azure App Service is assigned a **System-Assigned Managed Identity**, which is granted `Key Vault Secrets User` role. The application retrieves secrets at runtime via the Azure SDK — no human ever handles a secret value, and no secret is stored in application settings, environment variables, or code.

```
App Service (Managed Identity)
    → Azure Key Vault (RBAC: Secrets User)
        → Secret: storage-connection-string
        → Secret: entra-client-secret
```

### 6.4 Data Sensitivity
The files processed by this application contain **internal business data** (RFQ numbers, customer company names, supplier names, project names, and delivery dates). This data is classified as **Internal / Confidential** and should be handled accordingly:

- Reports should be distributed only over encrypted channels (e.g., SharePoint, Teams, encrypted email).
- The source workbook (`RFQ_Finished Component.xlsx`) should reside on access-controlled SharePoint or a mapped network drive, not on unmanaged local storage.
- In the Azure deployment, Blob Storage containers should be configured with **private access only** (no public blob access) and governed by Azure RBAC.

---

*This document was generated from a direct analysis of the application source code and reflects the actual implemented architecture as of the date of review. It should be updated whenever significant architectural changes are made.*
