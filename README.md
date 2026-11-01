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

Click **Try the demo dataset** on the upload page for a quick run, or upload your own CICFlowMeter-format CSV (same columns as CIC-IDS2017, up to 20 MB).

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

**AI reports take time.** On the Groq free tier, a file with 12 attack types takes about 3 to 4 minutes because of rate limits. Results unlock when all reports are done. To skip the wait, leave `GROQ_API_KEY` empty and a scan takes a few seconds.

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

Add `--online` to use real Groq calls (several minutes).

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
- `run.bat` - starts everything
