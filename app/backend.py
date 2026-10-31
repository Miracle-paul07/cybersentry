
import json
import os
import sys
from pathlib import Path

import streamlit as st
from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = PROJECT_ROOT / "src"

# src/ modules import each other without the "src." prefix
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from genai_report import build_evidence, generate_report  # noqa: E402
from pipeline import CyberSentryPipeline  # noqa: E402

load_dotenv(PROJECT_ROOT / ".env")


@st.cache_resource(show_spinner="Loading detection models...")
def get_pipeline():
    """Load the Stage 1 + Stage 2 models once per server process."""
    return CyberSentryPipeline(PROJECT_ROOT)


@st.cache_resource
def get_benign_baseline():
    """Median feature values of normal traffic, computed from the training data."""
    path = PROJECT_ROOT / "models" / "genai" / "benign_baseline.json"
    with open(path) as f:
        return json.load(f)


def required_columns():
    return get_pipeline().required_features


def run_analysis(df):
    """Run the live detection pipeline on an uploaded DataFrame."""
    if df is None or df.empty:
        raise ValueError("The uploaded CSV contains no data.")

    pipe = get_pipeline()
    clean_df, cleaning_report = pipe.prepare(df)
    if clean_df.empty:
        raise ValueError("No valid rows remain after cleaning the uploaded CSV.")

    results = pipe.predict(clean_df, already_prepared=True)
    cleaning_report["threats_detected"] = int(results["is_threat"].sum())
    return results, cleaning_report


def generate_reports(results, progress=None):
    """
    Build one incident report per detected attack type (BENIGN skipped).
    Falls back to the template report when Groq is unavailable.
    Returns (reports dict, list of warning strings).
    """
    attack_types = (
        results.loc[results["is_threat"], "attack_type"]
        .value_counts()
        .index.tolist()
    )
    baseline = get_benign_baseline()
    use_llm = bool(os.environ.get("GROQ_API_KEY"))
    warnings = []
    if not use_llm:
        warnings.append(
            "GROQ_API_KEY is not set, so template reports were generated "
            "instead of AI-written ones."
        )

    reports = {}
    for i, attack in enumerate(attack_types):
        if progress:
            progress(i, len(attack_types), attack)
        flows = results.loc[results["attack_type"] == attack]
        evidence = build_evidence(flows, attack, baseline, len(results))
        try:
            markdown, _, _, source = generate_report(evidence, use_llm=use_llm)
        except Exception:
            markdown, _, _, source = generate_report(evidence, use_llm=False)
        if use_llm and source.startswith("template"):
            warnings.append(
                f"The AI report for {attack} failed, so a template report "
                "is shown instead."
            )
        reports[attack] = {
            "markdown": markdown,
            "incident_id": evidence["incident_id"],
            "severity": evidence["severity"],
            "source": source,
        }
    if progress:
        progress(len(attack_types), len(attack_types), None)
    return reports, warnings
