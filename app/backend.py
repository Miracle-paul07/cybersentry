
from pathlib import Path

import pandas as pd


PROJECT_ROOT = Path(__file__).resolve().parent.parent
SAMPLE_DATA_DIR = PROJECT_ROOT / "app" / "sample_data"


def load_demo_results():
    """Load saved results for the dashboard."""
    results_path = SAMPLE_DATA_DIR / "demo_results.csv"

    if not results_path.exists():
        raise FileNotFoundError(
            f"Demo results file not found: {results_path}"
        )

    return pd.read_csv(results_path)


def load_demo_flows():
    """Load example network flows for upload validation."""
    flows_path = SAMPLE_DATA_DIR / "demo_flows.csv"

    if not flows_path.exists():
        raise FileNotFoundError(
            f"Demo input file not found: {flows_path}"
        )

    return pd.read_csv(flows_path)


def run_analysis(df):
    """
    Temporary demo workflow.
    Sam can connect the live pipeline here later.
    """
    if df is None or df.empty:
        raise ValueError("The uploaded CSV contains no data.")

    results = load_demo_results()

    cleaning_report = {
        "mode": "Demo",
        "uploaded_rows": len(df),
        "result_rows": len(results),
        "message": (
            "Saved demo results are being used. "
            "The live pipeline can be connected here later."
        ),
    }

    return results, cleaning_report
