# CyberSentry

Cybersecurity threat analysis prototype: network flow CSV -> anomaly detection -> attack classification -> LLM-written incident report -> interactive web dashboard.

See [CLAUDE.md](CLAUDE.md) for the full pipeline, dataset rules and stack.

## Run it

On Windows, double-click **`run.bat`**, or run it from a terminal:

```bash
run.bat
```

It starts the server and opens the website at <http://127.0.0.1:8000>. Press Ctrl+C in that window to stop it.

- `run.bat --rebuild` rebuilds the website first. Use this after changing anything in `frontend/`.
- `run.bat --port 8001` uses another port if 8000 is taken.

Click **Try the demo dataset** on the upload page for a quick run, **Try the CIC-IDS2018 sample** to see the models scored on data from another dataset, or upload your own CICFlowMeter-format CSV (CIC-IDS2017 or CSE-CIC-IDS2018 column names, up to 20 MB). If the file has a `Label` column, a Model Evaluation page appears. The models never see the labels.

## First-time setup

You need Python 3.13 and [Node.js](https://nodejs.org) (LTS). Node is only needed to build the website.

```bash
python -m venv venv
venv\Scripts\pip install -r requirements.txt
```

The first `run.bat` builds the website automatically, which needs internet to download the npm packages.

To get AI-written reports, copy `.env.example` to `.env` and add your Groq API key:

```bash
GROQ_API_KEY=your_key_here
```

Never commit `.env`.

## Running offline (for a demo)

Run `run.bat` once while online, so the website is built. After that, everything except Groq works with no internet: all fonts, 3D and charts are bundled.

Without internet or without a key, CyberSentry detects this and writes template reports from the same evidence, and the website shows a notice saying so.

**AI reports take time.** On the Groq free tier, a file with 12 attack types takes about 2 minutes because of rate limits. You don't have to wait for them: Overview, Detection and Analysis unlock as soon as detection finishes, and reports appear on the Reports page one by one, most severe first. If Groq keeps failing for an attack type, that type gets a template report instead. To skip Groq entirely, leave `GROQ_API_KEY` empty and all reports are ready in a few seconds.

## Developing the website

Run the API and the Vite dev server in two terminals. Changes then appear without rebuilding, at <http://localhost:5173>.

```bash
venv\Scripts\python -m uvicorn backend.main:app --port 8000
```

```bash
cd frontend && npm run dev
```

## Tests

```bash
venv\Scripts\python -m backend.test_api
```

This uses a fake Groq client for the background report tests, so it spends no quota. Add `--online` to also run the main demo scan with real Groq calls (several minutes).

## Cross-dataset evaluation

The models trained on CIC-IDS2017 are also tested, without retraining, on CSE-CIC-IDS2018. Put the CSVs in `data/raw/ids2018/`, then run:

```bash
venv\Scripts\python -m backend.evaluate_ids2018
```

Results are in [reports/ids2018/](reports/ids2018/). Start with [summary.md](reports/ids2018/summary.md).

## Streamlit backup

The original Streamlit dashboard still works as a fallback:

```bash
venv\Scripts\streamlit run app/app.py
```

## Layout

- `backend/` - FastAPI server: upload, background jobs with live progress, results, reports
- `frontend/` - website (React, Vite, Tailwind, three.js, GSAP, ECharts)
- `src/` - pipeline, model and GenAI report modules
- `app/` - Streamlit backup, plus the risk rules and PDF/TXT export the backend reuses
- `models/` - trained models
- `notebooks/` - Colab/Jupyter experiments
- `data/raw/`, `data/processed/` - datasets (not committed). Download CIC-IDS2017 (CSV version) into `data/raw/`.
- `reports/ids2018/` - cross-dataset evaluation results
- `run.bat` - starts everything

## Datasets

- CIC-IDS2017, used for training and testing.
- CSE-CIC-IDS2018, used for evaluation only. Sharafaldin, Lashkari & Ghorbani, "Toward Generating a New Intrusion Detection Dataset and Intrusion Traffic Characterization", ICISSP 2018. <https://registry.opendata.aws/cse-cic-ids2018>
