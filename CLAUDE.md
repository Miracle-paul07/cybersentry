# CyberSentry

Cybersecurity threat analysis prototype. College mini-project, 3-member team, 30-day timeline.

## Architecture

A FastAPI backend (`backend/`) runs the pipeline and serves a React website (`frontend/`, built to `frontend/dist`).

- `run.bat` starts everything at <http://127.0.0.1:8000>. Use `run.bat --rebuild` after changing anything in `frontend/`, and `run.bat --port 8001` if the port is taken.
- The Streamlit dashboard (`app/app.py`) is kept as a backup. The backend reuses `app/risk.py` and `app/report_export.py`.
- Tests: `venv\Scripts\python -m backend.test_api`. They use a fake Groq client, so they spend no quota; add `--online` for real Groq calls on the main demo scan.

## Pipeline

1. CSV of network flows, uploaded on the website
2. Preprocessing (`CyberSentryPipeline.prepare` in `src/pipeline.py`)
3. ML anomaly detection, Stage 1: XGBoost
4. DL attack classification, Stage 2: 1D-CNN (`src/dl_models.py`)
5. Risk levels (`app/risk.py`): Low / Medium / High / Critical
6. JSON evidence packet per attack type: counts, confidence, feature values vs. normal traffic (`build_evidence` in `src/genai_report.py`)
7. LLM (Groq) writes the explanation + incident report (`src/genai_report.py`), with a template report as the fallback
8. Website pages: Scan, Overview, Detection, Analysis, Reports

`src/pipeline.py` wires stages 2-4 together. `backend/jobs.py` runs them as background jobs with live progress. `src/preprocess.py`, `src/ml_model.py`, `src/dl_model.py` and `src/genai.py` are empty placeholders; that work lives in `notebooks/` and the files above.

## Background reports

Detection and reports are separate on purpose, because Groq's rate limit (8,000 tokens per minute on the free tier) makes 12 reports take about 2 minutes.

- A job sets `results_ready` when ML + DL finish, which unlocks Overview, Detection and Analysis. Its `status` only becomes `done` when the last report is finished.
- Reports are written one at a time on their own thread, most severe first (`backend/reports.py`). Each has a state: `queued`, `generating`, `ready` or `failed`. `GET /api/jobs/{id}` includes the states, and `frontend/src/JobContext.jsx` polls it.
- `failed` means Groq was meant to write the report but didn't, so the template was used and it can still be downloaded. With no key or no internet, template reports count as `ready`.
- `call_groq` uses `reasoning_effort="low"`: the default spends about 1,300 extra tokens per report and can hit the output limit before the JSON is finished.
- A failing Groq call retries with backoff (`call_groq`), following Groq's `Retry-After`. A 429 costs waiting time rather than a retry. After 2 attack types in a row fail, the remaining types go straight to the template. Starting a new scan does the same for the older scan's remaining reports.
- Report failures must never fail the job.

## Dataset

- CIC-IDS2017 (CSV version).
- Drop IP, port and timestamp columns to avoid leakage.
- Datasets are never committed to git (`data/` is ignored). The one exception is the small demo sample in `app/sample_data/`, which the website's sample scan needs.

## Stack

Python, pandas, scikit-learn, xgboost, pytorch, FastAPI, Groq API, React, Vite, Tailwind, Streamlit (backup).
Heavy training happens in Google Colab; only trained artifacts are brought back into `models/`.

## Rules

- The LLM must only explain the evidence it is given (the JSON evidence packet), never invent facts.
- Never commit datasets, `.env` files or API keys.
- Report downloads saved to the repo root (`/*.md`) are ignored by git. Only `README.md` and `CLAUDE.md` are tracked there.
