# MES Tools Portal

## Project Overview
Multi-tool web portal for MES Estimating Department. Currently hosts the **RFQ Report Generator**; additional tools will be added over time. One URL, all tools.

## Architecture
- **Frontend:** Next.js 15 (App Router) + Tailwind CSS v4, in `frontend/`
- **Backend:** Python FastAPI serverless functions in `api/`, deployed to Vercel
- **No database** — stateless file processing (upload → process → download ZIP)
- **Templates:** Country Excel templates in `templates/` (formatting only, no real data)

## Local Development

### Backend (Python)
```bash
poetry install
poetry run pytest                    # run tests (55 tests)
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
- `templates/` — Country Excel template files (India, China, Mexico, Vietnam)
- `frontend/src/app/page.tsx` — Portal landing page (tool grid)
- `frontend/src/app/rfq-report/page.tsx` — RFQ Report Generator tool page
- `tests/` — Python test suite (test_helpers, test_pipeline, test_template_helpers)

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

## Deployment
- Push to GitHub → Vercel auto-deploys frontend + Python API functions
- No environment variables needed (API is same-origin `/api/*`)

## Testing
```bash
poetry run pytest tests/ -v    # 55 tests, all should pass
```
