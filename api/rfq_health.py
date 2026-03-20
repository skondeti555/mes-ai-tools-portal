"""
Vercel Python Serverless Function: GET /api/rfq_health

Simple health check endpoint.
"""

from fastapi import FastAPI
from fastapi.responses import JSONResponse

app = FastAPI()


@app.get("/api/rfq_health")
async def health():
    return JSONResponse({"status": "ok"})
