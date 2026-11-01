"""CyberSentry FastAPI backend. Run with: uvicorn backend.main:app"""
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent

# src/ modules import each other without the "src." prefix
if str(PROJECT_ROOT / "src") not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT / "src"))
# app/ holds the shared risk rules and PDF/TXT export. Appended (not inserted)
# so app/backend.py never shadows this package.
if str(PROJECT_ROOT / "app") not in sys.path:
    sys.path.append(str(PROJECT_ROOT / "app"))
