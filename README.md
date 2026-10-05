# CyberSentry

Cybersecurity threat analysis prototype: network flow CSV -> anomaly detection -> attack classification -> SHAP explanations -> LLM-written incident report -> Streamlit dashboard.

See [CLAUDE.md](CLAUDE.md) for the full pipeline, dataset rules and stack.

## Setup

```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

Download CIC-IDS2017 (CSV version) into `data/raw/`. Data is git-ignored.

## Run the dashboard

```bash
streamlit run app/app.py
```

## Layout

- `data/raw/`, `data/processed/` - datasets (not committed)
- `notebooks/` - Colab/Jupyter experiments
- `src/` - preprocessing, ML, DL, GenAI and pipeline modules
- `models/` - trained models
- `app/` - Streamlit dashboard
