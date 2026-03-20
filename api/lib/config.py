"""Configuration for the API."""

from pathlib import Path

# Project root (two levels up from api/lib/)
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

# Template directory
TEMPLATE_DIR = PROJECT_ROOT / "templates"
