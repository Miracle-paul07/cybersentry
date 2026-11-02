# CyberSentry

Cybersecurity threat analysis prototype. College mini-project, 3-member team, 30-day timeline.

## Architecture

A FastAPI backend (`backend/`) runs the pipeline and serves a React website (`frontend/`, built to `frontend/dist`).

- `run.bat` starts everything at <http://127.0.0.1:8000>. Use `run.bat --rebuild` after changing anything in `frontend/`, and `run.bat --port 8001` if the port is taken.
- Result pages stay locked until a scan is started in the current visit. The job ID lives in `sessionStorage` and is cleared by a fresh load of the landing page, or when the server no longer knows the job (`frontend/src/JobContext.jsx`).
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
8. Website pages: Scan, Overview, Detection, Analysis, Reports, plus Model Evaluation for labelled files

`src/pipeline.py` wires stages 2-4 together. `backend/jobs.py` runs them as background jobs with live progress. `src/preprocess.py`, `src/ml_model.py`, `src/dl_model.py` and `src/genai.py` are empty placeholders; that work lives in `notebooks/` and the files above.

## Background reports

Detection and reports are separate on purpose, because Groq's rate limit (8,000 tokens per minute on the free tier) makes 12 reports take about 2 minutes.

- A job sets `results_ready` when ML + DL finish, which unlocks Overview, Detection and Analysis. Its `status` only becomes `done` when the last report is finished.
- Reports are written one at a time on their own thread, most severe first (`backend/reports.py`). Each has a state: `queued`, `generating`, `ready` or `failed`. `GET /api/jobs/{id}` includes the states, and `frontend/src/JobContext.jsx` polls it.
- `failed` means Groq was meant to write the report but didn't, so the template was used and it can still be downloaded. With no key or no internet, template reports count as `ready`.
- `call_groq` uses `reasoning_effort="low"`: the default spends about 1,300 extra tokens per report and can hit the output limit before the JSON is finished.
- A failing Groq call retries with backoff (`call_groq`), following Groq's `Retry-After`. A 429 costs waiting time rather than a retry. After 2 attack types in a row fail, the remaining types go straight to the template. Starting a new scan does the same for the older scan's remaining reports.
- If the grounding check flags a number in an AI report, Groq gets one rewrite that names the bad number (`rewrite_if_ungrounded`). If it is still flagged, the report is shown with the warning.
- Report failures must never fail the job.

## Dataset

- CIC-IDS2017 (CSV version).
- Drop IP, port and timestamp columns to avoid leakage.
- Datasets are never committed to git (`data/` is ignored). The exceptions are the small samples in `app/sample_data/`, which the demo-dataset endpoint and the tests need.
- CSE-CIC-IDS2018 is for evaluation only, the models are never retrained on it. The CSVs go in `data/raw/ids2018/`. `src/ids2018.py` holds the column and label mapping and the metrics, `backend/evaluate_ids2018.py` writes `reports/ids2018/`, and `notebooks/06_cross_dataset_ids2018.ipynb` gives the same numbers. `reports/ids2018/summary.md` is written by hand, so update it if the results change.
- `backend/make_demo_files.py` writes the upload files in `data/demo/` (gitignored). The 2017 ones only use `data/processed/test.parquet`, leaving out rows whose 32 features also appear in train or val. The landing page's demo button is hidden (`SHOW_DEMO_BUTTON` in `frontend/src/pages/Landing.jsx`), but its endpoint stays.
- `backend/calibrate_ids2018.py` is analysis only. The website and saved models always use the threshold in `models/ml/stage1_meta.json`.
- The website accepts 2017 and 2018 column names. A `Label` column is removed before the pipeline runs (`Job` in `backend/jobs.py`) and only used to score the results on the Model Evaluation page. Without one, that page doesn't appear. Labels the models have no class for are left out and listed, never guessed.

## Stack

Python, pandas, scikit-learn, xgboost, pytorch, FastAPI, Groq API, React, Vite, Tailwind, Streamlit (backup).
Heavy training happens in Google Colab; only trained artifacts are brought back into `models/`.

## Rules

- The LLM must only explain the evidence it is given (the JSON evidence packet), never invent facts.
- Never commit datasets, `.env` files or API keys.
- Report downloads saved to the repo root (`/*.md`) are ignored by git. Only `README.md` and `CLAUDE.md` are tracked there.
