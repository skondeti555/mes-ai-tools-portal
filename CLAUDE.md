# MES Tools Portal

## Project Overview
Multi-tool web portal for MES Estimating Department. Currently hosts the **RFQ Report Generator** (backend-powered) and **Quoted RFQs Report** (client-side only); additional tools will be added over time. **Mexico Bar Stock Cost Calculator** is defined as a placeholder (coming soon). One URL, all tools.

## Architecture
- **Frontend:** Next.js 15 (App Router) + Tailwind CSS v4, in `frontend/`
- **Backend:** Python FastAPI serverless functions in `api/`, deployed to Vercel
- **Mostly stateless** — file processing is upload → process → download (no DB). The one exception is **per-RFQ comments** on the Quoted RFQs page, persisted in **Upstash Redis** (a single hash) via `POST/GET /api/rfq_comments`.
- **Templates:** Single Excel template in `templates/Open_RFQ_Report_Template.xlsx` (formatting, logo, frozen panes — no real data)
- **Legacy:** `rfq-app/` contains a deprecated Electron desktop app (gitignored, not deployed). `docs/ARCHITECTURE-v1-electron.md` documents the old Electron design.

## Current Tools

| Tool | Route | Backend? | Description |
|------|-------|----------|-------------|
| RFQ Report Generator | `/rfq-report` | Yes (`POST /api/rfq_generate`) | Upload Excel → 3-step ETL pipeline → download ZIP of country reports |
| Quoted RFQs Report | `/quoted-rfqs` | Parsing/export client-side (`xlsx` + `exceljs`); comments via `GET/POST /api/rfq_comments` | Upload Excel/CSV → filters rows with quoted suppliers → light/printable results table → styled Excel export. Each row has a persistent **Comment** column (team-shared, keyed by `RFQ #`, stored in Upstash Redis). Access code is optional (see env vars). |
| Mexico Bar Stock Cost Calculator | `#` (placeholder) | TBD | Coming soon (`available: false` in tool grid) |

## Monorepo Structure & Deployment
This is a monorepo with `frontend/` (Next.js) and `api/` (Python) at the root.

- **Root `package.json`** exists solely for Vercel's Next.js framework detection. It lists `next` as a dependency and uses a `postinstall` script to install `frontend/` dependencies.
- **`vercel.json`** sets `buildCommand: "npm run build"` (delegates to `frontend/`) and `outputDirectory: "frontend/.next"`.
- **Vercel dashboard:** Framework Preset = Next.js. No Build/Install/Output overrides — defaults work via root `package.json` scripts.
- **Python API functions:** Vercel auto-detects `api/*.py` as serverless functions. Dependencies listed in `api/requirements.txt`.
- Push to GitHub → Vercel auto-deploys frontend + Python API functions.
- **Environment variables (only for the Quoted RFQs comments feature):**
  - `RFQ_COMMENTS_ACCESS_CODE` — **optional** shared code users type to view/edit comments. If unset, comments are open (no password) — acceptable because only `RFQ #` + note are stored, never customer data. If set, both GET/POST require it. Server-side only; **never** prefix with `NEXT_PUBLIC_` (it must not ship to the browser).
  - Upstash Redis creds, auto-injected by the Vercel **Marketplace → Upstash for Redis** integration: `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (the `KV_REST_API_URL` / `KV_REST_API_TOKEN` aliases also work).
  - If these are unset the rest of the portal still works; the comments column simply stays empty/locked.
  - **Where env vars live:** they are configured at the **Vercel project level** (project `mes-ai-tools-portal`), independent of the code. Merging to `main` ships code but does **not** set/change env vars, and edits to them only take effect on the **next deployment** (redeploy after changing). The `KV_REST_API_*` vars are currently supplied by the connected Upstash store. Confirm via Vercel dashboard → Settings → Environment Variables (or Integrations), or `vercel env ls` (requires `vercel login`).

## Local Development

### Backend (Python)
```bash
poetry install
poetry run pytest                    # run tests (56 tests)
poetry run uvicorn api.rfq_generate:app --reload --port 8000  # local API server (RFQ generator)
poetry run uvicorn api.rfq_comments:app --reload --port 8000  # local comments API (separate ASGI app)
```
Note: each `api/*.py` is its own ASGI app, so run the one whose endpoint you need (the frontend dev rewrite sends all `/api/*` to port 8000). **Bare uvicorn does not load `.env`**, so the comments store is unconfigured → `GET /api/rfq_comments` returns `{}` and `POST` returns 503 (the UI works, but nothing persists). Use this mode to test the UI without touching production data.

### Frontend (Next.js)
```bash
cd frontend
npm install
npm run dev   # runs on http://localhost:3000
```
Note: `frontend/next.config.ts` rewrites `/api/*` to `http://localhost:8000` during dev so the frontend can reach the local Python server. This rewrite is ignored on Vercel (serverless functions handle `/api/*` natively).

### Full stack with Vercel CLI
```bash
npm i -g vercel
vercel dev    # runs both frontend + Python API functions
```
> ⚠️ `vercel dev` loads the root `.env`, whose `KV_REST_API_*` creds point to the **live, shared** Upstash database — comments you add/edit/delete locally write to the **same data production uses** (there is no separate dev DB). Use the bare uvicorn server above to exercise the UI without touching prod.

## Key Files
- `api/lib/rfq_pipeline.py` — Core ETL logic (3-step pipeline: build CSV → split by country → format templates)
- `api/rfq_generate.py` — POST /api/rfq_generate endpoint (upload xlsx → returns ZIP)
- `api/rfq_health.py` — GET /api/rfq_health endpoint (health check)
- `api/rfq_comments.py` — GET/POST /api/rfq_comments (Quoted RFQs per-RFQ comments in Upstash Redis; access-code gated)
- `api/lib/config.py` — Template paths configuration
- `api/requirements.txt` — Python dependencies for Vercel (must include Pillow for image/logo support)
- `templates/Open_RFQ_Report_Template.xlsx` — Shared Excel template with logo and frozen panes (used for all countries)
- `frontend/package.json` — Frontend dependencies (`xlsx` for client-side Excel parsing; `exceljs` for client-side styled Excel export on the Quoted RFQs page)
- `frontend/next.config.ts` — Next.js config with dev-only API rewrite to localhost:8000
- `frontend/src/app/page.tsx` — Portal landing page (tool grid, 3 tools defined)
- `frontend/src/app/layout.tsx` — Root layout (header, MES branding, dark theme)
- `frontend/src/app/rfq-report/page.tsx` — RFQ Report Generator tool page
- `frontend/src/app/quoted-rfqs/page.tsx` — Quoted RFQs Report tool page (client-side parsing/export; per-RFQ comments call `GET/POST /api/rfq_comments`). UI notes: comments **auto-save on blur** (no Save button) and update optimistically; the results table uses short on-screen header labels (e.g. "Quoted", "Invited") while the **Excel export keeps the full sheet column names**; the note field **auto-grows** to fit long notes; columns use proportional widths with `break-words` so text never overflows into the neighbor.
- `tests/` — Python test suite (test_helpers, test_pipeline, test_template_helpers)
- `package.json` (root) — Vercel framework detection shim (not the real frontend package.json)
- `vercel.json` — Vercel build/routing config
- `docs/ARCHITECTURE-v1-electron.md` — Legacy Electron architecture doc (historical reference)

## Business Rules
- **Mexico supplier exclusion:** Step 2 of the pipeline drops Mexico rows where `_InvitedSupplier` contains "Metrics Works Saltillo" (case-insensitive). This is hard-coded in `api/lib/rfq_pipeline.py`.
- **Country mapping:** 4 countries — India (IN), China (CN), Mexico (MX), Vietnam (VN) — defined in `COUNTRY_MAP` in `api/lib/rfq_pipeline.py`.

## Template Notes
- All countries share a single template: `templates/Open_RFQ_Report_Template.xlsx` (logo in top-left, frozen panes at H1).
- `Pillow` must be in `api/requirements.txt` or openpyxl silently drops images on Vercel.
- Frozen panes and logos are preserved automatically by openpyxl on save.
- The `COUNTRIES` dict in `api/lib/rfq_pipeline.py` maps each country to its report and template files.

## Adding a New Tool
1. **Backend (if needed):** Create a new FastAPI endpoint in `api/` (e.g., `api/newtool.py`). Not all tools need a backend — Quoted RFQs is 100% client-side using the `xlsx` library.
2. **Frontend route:** Create `frontend/src/app/<tool-name>/page.tsx`
3. **Portal entry:** Add a ToolCard entry in the tools array in `frontend/src/app/page.tsx`
4. **Enable:** Change `available: false` to `available: true` and set the correct `href`

## Data Sensitivity
**This is a PUBLIC repo.** Never commit:
- `.xlsx` data files containing real RFQ/customer/supplier data
- `.csv` exports (OpenRFQ.csv, Quoted_RFQs_Export.csv)
- `.env` files or any credentials
- Template files are OK — they contain only formatting, no real data

## Testing
```bash
poetry run pytest tests/ -v    # 56 tests, all should pass
```
