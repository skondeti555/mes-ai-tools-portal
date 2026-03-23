# MES Tools Portal

## Project Overview
Multi-tool web portal for MES Estimating Department. Currently hosts the **RFQ Report Generator** and **Quoted RFQs Report**; additional tools will be added over time. One URL, all tools.

## Architecture
- **Frontend:** Next.js 15 (App Router) + Tailwind CSS v4, in `frontend/`
- **Backend:** Python FastAPI serverless functions in `api/`, deployed to Vercel
- **No database** — stateless file processing (upload → process → download ZIP)
- **Templates:** Single Excel template in `templates/Open_RFQ_Report_Template.xlsx` (formatting, logo, frozen panes — no real data)

## Monorepo Structure & Deployment
This is a monorepo with `frontend/` (Next.js) and `api/` (Python) at the root.

- **Root `package.json`** exists solely for Vercel's Next.js framework detection. It lists `next` as a dependency and uses a `postinstall` script to install `frontend/` dependencies.
- **`vercel.json`** sets `buildCommand: "npm run build"` (delegates to `frontend/`) and `outputDirectory: "frontend/.next"`.
- **Vercel dashboard:** Framework Preset = Next.js. No Build/Install/Output overrides — defaults work via root `package.json` scripts.
- **Python API functions:** Vercel auto-detects `api/*.py` as serverless functions. Dependencies listed in `api/requirements.txt`.
- Push to GitHub → Vercel auto-deploys frontend + Python API functions.
- No environment variables needed (API is same-origin `/api/*`).

## Local Development

### Backend (Python)
```bash
poetry install
poetry run pytest                    # run tests (56 tests)
poetry run uvicorn api.rfq_generate:app --reload --port 8000  # local API server
```

### Frontend (Next.js)
```bash
cd frontend
npm install
npm run dev   # runs on http://localhost:3000
```

### Full stack with Vercel CLI
```bash
npm i -g vercel
vercel dev    # runs both frontend + Python API functions
```

## Key Files
- `api/lib/rfq_pipeline.py` — Core ETL logic (3-step pipeline: build CSV → split by country → format templates)
- `api/rfq_generate.py` — POST /api/rfq_generate endpoint (upload xlsx → returns ZIP)
- `api/rfq_health.py` — GET /api/rfq_health endpoint (health check)
- `api/lib/config.py` — Template paths configuration
- `api/requirements.txt` — Python dependencies for Vercel (must include Pillow for image/logo support)
- `templates/Open_RFQ_Report_Template.xlsx` — Shared Excel template with logo and frozen panes (used for all countries)
- `frontend/src/app/page.tsx` — Portal landing page (tool grid)
- `frontend/src/app/rfq-report/page.tsx` — RFQ Report Generator tool page
- `frontend/src/app/quoted-rfqs/page.tsx` — Quoted RFQs Report tool page
- `tests/` — Python test suite (test_helpers, test_pipeline, test_template_helpers)
- `package.json` (root) — Vercel framework detection shim (not the real frontend package.json)
- `vercel.json` — Vercel build/routing config

## Template Notes
- All countries share a single template: `templates/Open_RFQ_Report_Template.xlsx` (logo in top-left, frozen panes at H1).
- `Pillow` must be in `api/requirements.txt` or openpyxl silently drops images on Vercel.
- Frozen panes and logos are preserved automatically by openpyxl on save.
- The `COUNTRIES` dict in `api/lib/rfq_pipeline.py` maps each country to its report and template files.

## Adding a New Tool
1. Create a new FastAPI endpoint in `api/` (e.g., `api/newtool.py`)
2. Create a new route directory in `frontend/src/app/<tool-name>/page.tsx`
3. Add a ToolCard entry in the tools array in `frontend/src/app/page.tsx`
4. Change `available: false` to `available: true` and set the correct `href`

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
