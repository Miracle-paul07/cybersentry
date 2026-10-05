# CyberSentry

Cybersecurity threat analysis prototype. College mini-project, 3-member team, 30-day timeline.

## Pipeline

1. CSV of network flows
2. Preprocessing (`src/preprocess.py`)
3. ML anomaly detection (`src/ml_model.py`): Isolation Forest trained on benign traffic, plus RF/XGBoost baseline
4. DL attack classification (`src/dl_model.py`): MLP first, CNN/LSTM optional
5. SHAP top features per prediction
6. JSON evidence packet
7. LLM (Gemini/Groq API) writes explanation + incident report (`src/genai.py`)
8. Streamlit dashboard (`app/app.py`) with risk levels: Low / Med / High / Critical

`src/pipeline.py` wires the stages together.

## Dataset

- CIC-IDS2017 (CSV version).
- Drop IP, port and timestamp columns to avoid leakage.
- Datasets are never committed to git (`data/` is ignored).

## Stack

Python, pandas, scikit-learn, xgboost, tensorflow or pytorch, shap, streamlit.
Heavy training happens in Google Colab; only trained artifacts are brought back into `models/`.

## Rules

- The LLM must only explain the evidence it is given (the JSON evidence packet), never invent facts.
- Never commit datasets, `.env` files or API keys.
