"""Turn pipeline output into the numbers and chart data the website shows."""
import math

import numpy as np
import pandas as pd

from genai_report import GENERIC_KB, KB
from risk import RISK_LEVELS, get_risk_level

TABLE_COLUMNS = ["attack_type", "risk_level", "confidence", "stage1_score", "needs_review", "Destination Port"]
SORTABLE = {"row", "attack_type", "risk_level", "confidence", "stage1_score"}


def clean(value):
    """Make numpy / NaN values JSON-safe."""
    if isinstance(value, dict):
        return {k: clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [clean(v) for v in value]
    if isinstance(value, np.generic):
        value = value.item()
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


def add_risk(results):
    results = results.copy()
    results["risk_level"] = results.apply(get_risk_level, axis=1)
    return results


def histogram(values, bins=10):
    values = pd.Series(values).dropna().astype(float)
    if values.empty:
        return None
    if values.min() == values.max():
        return {"edges": [float(values.min()), float(values.max())], "counts": [int(len(values))]}
    counts, edges = np.histogram(values, bins=bins)
    return {"edges": edges.tolist(), "counts": counts.tolist()}


def summary(results, cleaning, filename):
    total = len(results)
    threats = int(results["is_threat"].sum())
    attacks = results.loc[results["is_threat"], "attack_type"].value_counts()
    risk = results["risk_level"].value_counts().reindex(RISK_LEVELS, fill_value=0)
    return clean({
        "filename": filename,
        "cleaning": cleaning,
        "kpis": {
            "total_flows": total,
            "threats": threats,
            "threat_pct": round(100 * threats / total, 2) if total else 0.0,
            "needs_review": int(results["needs_review"].sum()),
            "suspicious": int(results["suspicious"].sum()),
            "attack_types": int(len(attacks)),
        },
        "risk_counts": {level: int(n) for level, n in risk.items()},
        "attack_counts": [{"attack_type": a, "count": int(n),
                           "severity": KB.get(a, GENERIC_KB)["severity"]} for a, n in attacks.items()],
        "confidence_histogram": histogram(results["confidence"]),
        "filters": {
            "attack_types": sorted(attacks.index.tolist()),
            "risk_levels": RISK_LEVELS,
        },
    })


def filter_flows(results, scope="threats", attack_type=None, risk=None, needs_review=None):
    df = results
    if scope == "threats":
        df = df.loc[df["is_threat"]]
    if attack_type:
        df = df.loc[df["attack_type"] == attack_type]
    if risk:
        df = df.loc[df["risk_level"].isin(risk.split(","))]
    if needs_review is not None:
        df = df.loc[df["needs_review"] == needs_review]
    return df


def flows_page(df, page=1, size=50, sort="row", order="asc"):
    if sort not in SORTABLE:
        sort = "row"
    ascending = order != "desc"
    if sort == "risk_level":
        key = df["risk_level"].map({lvl: i for i, lvl in enumerate(RISK_LEVELS)})
        df = df.loc[key.sort_values(ascending=ascending, kind="stable").index]
    elif sort == "row":
        df = df.sort_index(ascending=ascending)
    else:
        df = df.sort_values(sort, ascending=ascending, kind="stable", na_position="last")

    needs_review = int(df["needs_review"].sum())
    size = max(1, min(size, 500))
    pages = max(1, math.ceil(len(df) / size))
    page = max(1, min(page, pages))
    chunk = df.iloc[(page - 1) * size: page * size]
    cols = [c for c in TABLE_COLUMNS if c in chunk.columns]
    rows = [{"row": int(i), **{c: r[c] for c in cols}} for i, r in chunk[cols].iterrows()]
    return clean({"total": len(df), "needs_review": needs_review, "page": page, "pages": pages, "size": size,
                  "columns": ["row"] + cols, "rows": rows})


def flows_csv(df):
    cols = [c for c in TABLE_COLUMNS if c in df.columns]
    return df[cols].to_csv(index_label="row")


def flow_detail(results, row, features):
    r = results.loc[row]
    return clean({"row": int(row),
                  **{c: r[c] for c in TABLE_COLUMNS + ["suspicious", "is_threat"] if c in results.columns},
                  "features": {f: float(r[f]) for f in features if f in results.columns}})


def attack_analysis(results, attack_type, features):
    """Stats for one attack type plus feature averages vs BENIGN (same rules as the Streamlit app)."""
    attack_df = results.loc[results["attack_type"] == attack_type]
    benign_df = results.loc[results["attack_type"] == "BENIGN"]
    kb = KB.get(attack_type, GENERIC_KB)
    numeric = [c for c in features if c in results.columns]

    comparison, default = [], []
    if not benign_df.empty:
        attack_means = attack_df[numeric].mean()
        benign_means = benign_df[numeric].mean()
        # Default to the features that differ most from normal traffic,
        # among those a log scale can draw (both averages above 0)
        drawable = (attack_means > 0) & (benign_means > 0)
        difference = (
            np.log10(attack_means[drawable]) - np.log10(benign_means[drawable])
        ).abs().drop("Destination Port", errors="ignore")
        default = difference.sort_values(ascending=False).head(5).index.tolist()
        comparison = [{"feature": f, "attack_mean": attack_means[f], "benign_mean": benign_means[f],
                       "drawable": bool(drawable[f]),
                       "log10_diff": difference.get(f, None)} for f in numeric]

    risk = attack_df["risk_level"].value_counts().reindex(RISK_LEVELS, fill_value=0)
    return clean({
        "attack_type": attack_type,
        "description": kb["description"],
        "severity": kb["severity"],
        "mitre": kb["mitre"],
        "count": len(attack_df),
        "share_pct": round(100 * len(attack_df) / len(results), 2) if len(results) else 0.0,
        "avg_confidence": attack_df["confidence"].mean(),
        "min_confidence": attack_df["confidence"].min(),
        "needs_review": int(attack_df["needs_review"].sum()),
        "risk_counts": {level: int(n) for level, n in risk.items()},
        "stage1_histogram": histogram(attack_df["stage1_score"]),
        "benign_count": len(benign_df),
        "feature_comparison": comparison,
        "default_features": default,
    })


def attack_cards(results):
    """Short card data for every detected attack type."""
    attacks = results.loc[results["is_threat"], "attack_type"].value_counts()
    cards = []
    for a, n in attacks.items():
        kb = KB.get(a, GENERIC_KB)
        cards.append({"attack_type": a, "count": int(n), "severity": kb["severity"],
                      "description": kb["description"], "mitre": kb["mitre"],
                      "avg_confidence": results.loc[results["attack_type"] == a, "confidence"].mean()})
    return clean(cards)
