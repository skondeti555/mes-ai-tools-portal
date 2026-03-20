# MES Tools Portal

A multi-tool web portal for the MES Estimating Department. Provides a centralized hub for internal productivity tools, starting with the **RFQ Report Generator**.

## Tools

| Tool | Status | Description |
|---|---|---|
| **RFQ Report Generator** | Available | Upload RFQ Excel data, generate formatted country reports (India, China, Mexico, Vietnam) |
| Quote Tracker | Coming Soon | Track supplier quotes across active RFQs |
| Supplier Analytics | Coming Soon | Analyze supplier performance and pricing trends |
| Cost Estimator | Coming Soon | Estimate component costs from historical data |

## Tech Stack

- **Frontend:** Next.js 15, React 19, Tailwind CSS v4
- **Backend:** Python 3.11+, FastAPI, pandas, openpyxl
- **Deployment:** Vercel (frontend + serverless Python functions)
- **Package Management:** Poetry (Python), npm (Node.js)

## Getting Started

### Prerequisites
- Python 3.11+
- Node.js 18+
- [Poetry](https://python-poetry.org/docs/#installation)

### Setup

```bash
# Install Python dependencies
poetry install

# Install frontend dependencies
cd frontend
npm install
```

### Development

```bash
# Run Python tests
poetry run pytest tests/ -v

# Start frontend dev server
cd frontend
npm run dev

# Or use Vercel CLI for full stack
vercel dev
```

### How It Works

1. User uploads an `RFQ_Finished Component.xlsx` file via the web interface
2. The Python backend processes the file through a 3-step pipeline:
   - **Step 1:** Build a standardized 18-column master CSV from raw Excel data
   - **Step 2:** Split data by country (India, China, Mexico, Vietnam)
   - **Step 3:** Format each country's data into a branded Excel template with conditional formatting
3. User downloads a ZIP containing all generated reports

## Project Structure

```
├── api/                    # Python serverless functions
│   ├── lib/                # Shared Python modules
│   │   ├── rfq_pipeline.py # Core ETL pipeline
│   │   └── config.py       # Configuration
│   ├── rfq_generate.py     # Report generation endpoint
│   └── rfq_health.py       # Health check endpoint
├── frontend/               # Next.js web application
│   └── src/app/            # App Router pages
├── templates/              # Country Excel templates
├── tests/                  # Python test suite
├── pyproject.toml          # Poetry configuration
└── CLAUDE.md               # Developer documentation
```

## License

Internal use — MES Estimating Department.
