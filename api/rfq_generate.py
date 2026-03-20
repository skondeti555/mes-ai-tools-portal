"""
Vercel Python Serverless Function: POST /api/rfq_generate

Accepts an uploaded .xlsx file, runs the RFQ pipeline,
and returns a ZIP of generated reports.
"""

import io
import shutil
import tempfile
import zipfile
from pathlib import Path

from api.lib.config import TEMPLATE_DIR
from api.lib.rfq_pipeline import run_pipeline, upcoming_monday, nice_date_str

# Vercel uses ASGI with FastAPI-style handlers
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse

app = FastAPI()


@app.post("/api/rfq_generate")
async def generate_reports(file: UploadFile = File(...)):
    """Upload an Excel file, run the RFQ pipeline, return ZIP of reports."""
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Please upload an Excel file (.xlsx)")

    work_dir = Path(tempfile.mkdtemp())
    try:
        # Save uploaded file to temp dir
        input_path = work_dir / "RFQ_Finished Component.xlsx"
        contents = await file.read()
        input_path.write_bytes(contents)

        # Run pipeline
        generated = run_pipeline(input_path, TEMPLATE_DIR, work_dir)

        if not generated:
            raise HTTPException(status_code=422, detail="No reports were generated. Check that the Excel file contains valid RFQ data.")

        # Bundle into ZIP
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            for report_path in generated:
                zf.write(report_path, report_path.name)

        zip_buffer.seek(0)

        monday = upcoming_monday()
        week_num = int(monday.strftime("%W"))
        date_str = nice_date_str(monday)
        zip_name = f"Week {week_num} Open RFQ Reports {date_str}.zip"

        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{zip_name}"'},
        )
    except HTTPException:
        raise
    except FileNotFoundError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline error: {str(e)}")
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)
