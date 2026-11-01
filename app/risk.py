"""Risk level rules shared by the Streamlit app and the FastAPI backend."""
import pandas as pd

RISK_LEVELS = ["Low", "Medium", "High", "Critical"]

# Attack types rated Critical when detected with high confidence
SEVERE_ATTACKS = {"DDOS", "INFILTRATION", "HEARTBLEED", "BOT"}


def get_risk_level(row):
    """Derive a risk level from attack type, confidence and review status."""
    attack = str(row["attack_type"]).strip().upper()
    confidence = row["confidence"]

    if attack == "BENIGN":
        return "Low"
    if row["needs_review"]:
        return "Medium"
    if pd.notna(confidence) and confidence >= 0.90:
        if attack in SEVERE_ATTACKS or attack.startswith("DOS"):
            return "Critical"
        return "High"
    return "Medium"
