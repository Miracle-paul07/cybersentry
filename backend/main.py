"""
CyberSentry web API + static frontend.

    uvicorn backend.main:app --port 8000

The pipeline is loaded once at startup. The built React site (frontend/dist) is
served at "/" so a single command runs everything.
"""
import io
import json
import os
from contextlib import asynccontextmanager
from typing import Optional
from urllib.parse import quote

import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, Response
from fastapi.staticfiles import StaticFiles

from . import PROJECT_ROOT, analysis
from .jobs import JobManager
from .reports import export, groq_reachable

from pipeline import CyberSentryPipeline  # noqa: E402  (src/ on sys.path via backend/__init__.py)

load_dotenv(PROJECT_ROOT / ".env")

MAX_UPLOAD_MB = 20
SAMPLE_CSV = PROJECT_ROOT / "app" / "sample_data" / "demo_flows.csv"
DIST = PROJECT_ROOT / "frontend" / "dist"

state = {}


@asynccontextmanager
async def lifespan(app):
    pipe = CyberSentryPipeline(PROJECT_ROOT)
    with open(PROJECT_ROOT / "models" / "genai" / "benign_baseline.json") as f:
        baseline = json.load(f)
    state["pipeline"] = pipe
    state["jobs"] = JobManager(pipe, baseline)
    yield
    state["jobs"].executor.shutdown(wait=False, cancel_futures=True)


app = FastAPI(title="CyberSentry", lifespan=lifespan)


def bad_request(message, status=400, **extra):
    raise HTTPException(status_code=status, detail={"message": message, **extra})


# --------------------------------------------------
# Upload validation (same checks as the Streamlit app)
# --------------------------------------------------
def read_upload(filename, data):
    if not filename or not filename.lower().endswith(".csv"):
        bad_request("Please upload a .csv file.")
    if len(data) > MAX_UPLOAD_MB * 1024 * 1024:
        bad_request(f"File is too large. Please upload a file under {MAX_UPLOAD_MB} MB.", status=413)
    if not data.strip():
        bad_request("The uploaded file is empty.")
    try:
        df = pd.read_csv(io.BytesIO(data), low_memory=False)
    except (pd.errors.ParserError, pd.errors.EmptyDataError, UnicodeDecodeError) as e:
        bad_request(f"Could not read this CSV: {e}")
    df.columns = df.columns.str.strip()
    if df.empty:
        bad_request("The uploaded CSV contains no rows.")
    missing = [c for c in state["pipeline"].required_features if c not in df.columns]
    if missing:
        bad_request(f"The CSV is missing {len(missing)} required column(s). Upload a CICFlowMeter-format "
                    "CSV (same columns as CIC-IDS2017).", missing_columns=missing)
    return df


def get_job(job_id, finished=True):
    job = state["jobs"].get(job_id)
    if job is None:
        bad_request("Analysis not found. It may have expired after a server restart; please upload again.",
                    status=404)
    if finished and not job.results_ready:
        bad_request(f"Analysis is not finished yet (status: {job.status}).", status=409)
    return job


def get_report(job, attack_type):
    report = job.reports.get(attack_type)
    if report is not None:
        return report
    state = job.report_states.get(attack_type)
    if state is None:
        bad_request(f"No incident report for '{attack_type}'.", status=404,
                    available=list(job.report_states))
    bad_request(f"The report for '{attack_type}' is not available (status: {state['status']}).",
                status=409, report_status=state["status"])


def download(data, filename, media_type):
    return Response(data, media_type=media_type,
                    headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"})


# --------------------------------------------------
# API
# --------------------------------------------------
@app.get("/api/health")
def health():
    pipe = state["pipeline"]
    has_key = bool(os.environ.get("GROQ_API_KEY"))
    return {
        "status": "ok",
        "models": {"stage1": pipe.s1_meta["model"], "stage2": pipe.s2_meta.get("model"),
                   "classes": pipe.classes, "review_threshold": pipe.review_threshold},
        "required_columns": pipe.required_features,
        "max_upload_mb": MAX_UPLOAD_MB,
        "groq": {"key_configured": has_key, "reachable": groq_reachable() if has_key else False},
    }


@app.post("/api/analyze")
async def analyze(file: UploadFile = File(...)):
    df = read_upload(file.filename, await file.read())
    job = state["jobs"].submit(file.filename, df)
    return {"job_id": job.id}


@app.post("/api/analyze/sample")
def analyze_sample():
    df = read_upload(SAMPLE_CSV.name, SAMPLE_CSV.read_bytes())
    job = state["jobs"].submit(SAMPLE_CSV.name, df)
    return {"job_id": job.id}


@app.get("/api/jobs/{job_id}")
def job_status(job_id: str):
    return get_job(job_id, finished=False).snapshot()


@app.get("/api/jobs/{job_id}/results")
def job_results(job_id: str, scope: str = "threats", attack_type: Optional[str] = None,
                risk: Optional[str] = None, needs_review: Optional[bool] = None,
                page: int = 1, size: int = 50, sort: str = "row", order: str = "asc"):
    job = get_job(job_id)
    flows = analysis.filter_flows(job.results, scope, attack_type, risk, needs_review)
    return {**job.summary, "warnings": job.warnings,
            "flows": analysis.flows_page(flows, page, size, sort, order)}


@app.get("/api/jobs/{job_id}/flows.csv")
def job_flows_csv(job_id: str, scope: str = "threats", attack_type: Optional[str] = None,
                  risk: Optional[str] = None, needs_review: Optional[bool] = None):
    job = get_job(job_id)
    flows = analysis.filter_flows(job.results, scope, attack_type, risk, needs_review)
    return download(analysis.flows_csv(flows), "cybersentry_threats.csv", "text/csv")


@app.get("/api/jobs/{job_id}/flows/{row}")
def job_flow(job_id: str, row: int):
    job = get_job(job_id)
    if row not in job.results.index:
        bad_request(f"Flow {row} not found.", status=404)
    return analysis.flow_detail(job.results, row, state["pipeline"].required_features)


@app.get("/api/jobs/{job_id}/analysis")
def job_attack_cards(job_id: str):
    return {"attacks": analysis.attack_cards(get_job(job_id).results)}


@app.get("/api/jobs/{job_id}/analysis/{attack_type}")
def job_attack_analysis(job_id: str, attack_type: str):
    job = get_job(job_id)
    if not (job.results["attack_type"] == attack_type).any() or attack_type == "BENIGN":
        bad_request(f"No flows were classified as '{attack_type}'.", status=404)
    return analysis.attack_analysis(job.results, attack_type, state["pipeline"].required_features)


@app.get("/api/jobs/{job_id}/reports")
def job_report_list(job_id: str):
    job = get_job(job_id)
    return {"warnings": job.warnings, "reports": job.report_list()}


# File routes come before the JSON route: "{attack_type}" would also match "DoS Hulk.pdf"
@app.get("/api/jobs/{job_id}/reports/{attack_type}.pdf")
def job_report_pdf(job_id: str, attack_type: str):
    report = get_report(get_job(job_id), attack_type)
    try:
        data = export(report, "pdf")
    except Exception as e:
        bad_request(f"Could not create the PDF: {e}", status=500)
    return download(data, f"{report['incident_id']}.pdf", "application/pdf")


@app.get("/api/jobs/{job_id}/reports/{attack_type}.txt")
def job_report_txt(job_id: str, attack_type: str):
    report = get_report(get_job(job_id), attack_type)
    return download(export(report, "txt"), f"{report['incident_id']}.txt", "text/plain; charset=utf-8")


@app.get("/api/jobs/{job_id}/reports/{attack_type}")
def job_report(job_id: str, attack_type: str):
    job = get_job(job_id)
    return analysis.clean({**get_report(job, attack_type), "warnings": job.warnings})


@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
def api_not_found(path: str):
    bad_request(f"Unknown API endpoint: /api/{path}", status=404)


# --------------------------------------------------
# Frontend (React build). Any non-API path returns index.html for client-side routing.
# --------------------------------------------------
if (DIST / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")


@app.get("/{path:path}", include_in_schema=False)
def frontend(path: str):
    file = (DIST / path).resolve()
    if path and file.is_file() and DIST.resolve() in file.parents:
        return FileResponse(file)
    if (DIST / "index.html").is_file():
        # Asset names change with each build, so the page itself must never be stale
        return FileResponse(DIST / "index.html", headers={"Cache-Control": "no-cache"})
    return HTMLResponse("<h1>CyberSentry API is running</h1><p>The website is not built yet. "
                        "Run <code>npm run build</code> in <code>frontend/</code>, or open "
                        "<a href='/docs'>/docs</a> for the API.</p>")
