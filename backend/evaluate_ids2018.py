"""
Cross-dataset evaluation: the models trained on CIC-IDS2017, unchanged, on CSE-CIC-IDS2018.
Nothing is retrained. Labels are only used for scoring.

    python -m backend.evaluate_ids2018          # writes reports/ids2018/
    python -m backend.evaluate_ids2018 --demo   # also rewrites app/sample_data/ids2018_sample.csv

The plain-English reports/ids2018/summary.md is written by hand from these results.
"""
import argparse
import json

import numpy as np
import pandas as pd

from . import PROJECT_ROOT

from ids2018 import (KEEP_ALL, LABEL, LABEL_MAP, MAX_PER_CLASS, SEED, binary_metrics, check_features,  # noqa: E402
                     drop_duplicates, load_folder, map_label, multiclass_metrics, read_clean_chunks, score_predictions,
                     stratified_sample)
from pipeline import CyberSentryPipeline  # noqa: E402  (src/ on sys.path via backend/__init__.py)

DATA_DIR = PROJECT_ROOT / "data" / "raw" / "ids2018"
TEST_2017 = PROJECT_ROOT / "data" / "processed" / "test.parquet"
OUT_DIR = PROJECT_ROOT / "reports" / "ids2018"
DEMO_CSV = PROJECT_ROOT / "app" / "sample_data" / "ids2018_sample.csv"
BATCH = 200_000
EXTRA_COLUMNS = ["raw_label", "row_hash", "day", "copies", "class"]
# Rows per 2018 label in the demo file. Benign takes whatever is left of DEMO_ROWS.
DEMO_ROWS = 5_000
DEMO_QUOTA = {"FTP-BruteForce": 53, "SSH-Bruteforce": 800, "DoS attacks-Hulk": 800, "DoS attacks-SlowHTTPTest": 55,
              "DDOS attack-HOIC": 650, "DDOS attack-LOIC-UDP": 250, "Bot": 900}


def rounded(value):
    """Six decimals is plenty, and it keeps metrics.json stable and readable."""
    if isinstance(value, dict):
        return {k: rounded(v) for k, v in value.items()}
    if isinstance(value, list):
        return [rounded(v) for v in value]
    if isinstance(value, float):
        return round(value, 6)
    return value


def counts_by(frame, column, weights=None):
    grouped = frame.groupby(column, sort=True, observed=True)
    sizes = grouped.size() if weights is None else grouped[weights].sum()
    return {k: int(v) for k, v in sizes.items()}


def all_rows_check(pipe, unique, features):
    """
    The whole of the four files rather than the sample, so the attack/benign mix is the
    real one. Counted once per distinct flow and again with duplicates left in.
    """
    parts = [pipe.predict(unique.iloc[i:i + BATCH][features])[["stage1_score", "suspicious", "attack_type", "is_threat"]]
             for i in range(0, len(unique), BATCH)]
    out = pd.concat(parts, ignore_index=True)
    is_attack = (unique["class"] != "BENIGN").to_numpy()

    def block(weights):
        w = np.ones(len(unique), dtype=np.int64) if weights is None else unique[weights].to_numpy()
        per_label = {}
        for label, rows in unique.groupby("raw_label", sort=True):
            i, n = rows.index.to_numpy(), int(w[rows.index].sum())
            predicted = out["attack_type"].to_numpy()[i]
            per_label[label] = {
                "rows": n,
                "stage1_flagged": float(w[i][out["suspicious"].to_numpy()[i]].sum() / n),
                "predicted_as_its_class": float(w[i][predicted == rows["class"].to_numpy()].sum() / n),
            }
        return {"attack_share": float(w[is_attack].sum() / w.sum()),
                "stage1": binary_metrics(is_attack, out["suspicious"], out["stage1_score"], w),
                "pipeline": binary_metrics(is_attack, out["is_threat"], weights=w),
                "per_label": per_label}

    return {"distinct_flows": block(None), "with_duplicates": block("copies")}


def test_2017(pipe, features, sample):
    """
    Per-class scores on the 2017 test split, plus each class's feature medians in both
    datasets as evidence for why results moved. data/ isn't in git, so this is skipped
    without the file.
    """
    if not TEST_2017.exists():
        return None, None
    test = pd.read_parquet(TEST_2017, columns=features + [LABEL])
    true = test[LABEL].astype(str).map(lambda x: map_label(x, pipe.classes)).to_numpy()
    scores = multiclass_metrics(true, pipe.predict(test[features])["attack_type"], pipe.classes)
    medians = {}
    for name in sorted(sample["class"].unique()):
        old, new = test.loc[true == name, features].median(), sample.loc[sample["class"] == name, features].median()
        medians[name] = {f: {"2017": float(old[f]), "2018": float(new[f])} for f in features}
    return scores, medians


def evaluate(root=PROJECT_ROOT, data_dir=DATA_DIR):
    """Returns (metrics, the distinct flows, sample, results for the sample)."""
    pipe = CyberSentryPipeline(root)
    features = pipe.required_features
    check_features(features, pipe.s1_meta["features"])

    rows, per_file = load_folder(data_dir, features)
    labels = rows["raw_label"].unique().tolist()
    unmapped = sorted(x for x in labels if x not in LABEL_MAP)
    if unmapped:
        print(f"Labels not in the mapping, left out of the evaluation: {unmapped}")
    clean_counts = counts_by(rows, "raw_label")
    rows = rows.loc[rows["raw_label"].isin(LABEL_MAP)]

    unique = drop_duplicates(rows)
    del rows
    unique["class"] = unique["raw_label"].map(LABEL_MAP)
    sample = stratified_sample(unique)

    results = pipe.predict(sample[features])
    if len(results) != len(sample):
        raise RuntimeError("The pipeline dropped sample rows, so labels no longer line up with predictions.")

    per_day = {}
    for day, rows_of_day in sample.groupby("day", sort=True):
        i = rows_of_day.index
        per_day[day] = score_predictions(sample.loc[i, "class"].to_numpy(), results.loc[i], pipe.classes)

    s1, s2 = pipe.s1_meta["test_metrics"], pipe.s2_meta
    per_class_2017, medians = test_2017(pipe, features, sample)
    metrics = {
        "settings": {"seed": SEED, "max_per_class": MAX_PER_CLASS, "keep_all": KEEP_ALL,
                     "stage1_threshold": pipe.s1_meta["threshold"], "note": "Models trained on CIC-IDS2017, not retrained."},
        "data": {
            "per_file": per_file,
            "unmapped_labels": unmapped,
            "rows_after_cleaning": clean_counts,
            "rows_after_dropping_duplicates": counts_by(unique, "raw_label"),
            "rows_in_sample": counts_by(sample, "raw_label"),
            "sample_by_day_and_class": {day: counts_by(g, "class") for day, g in sample.groupby("day", sort=True)},
        },
        "sample": score_predictions(sample["class"].to_numpy(), results, pipe.classes),
        "per_day": per_day,
        "all_rows": all_rows_check(pipe, unique, features),
        "class_feature_medians": medians,
        "cic_ids2017_test": {
            "stage1": {"accuracy": s1["Accuracy"], "precision": s1["Precision"], "recall": s1["Recall (DR)"],
                       "f1": s1["F1"], "fpr": s1["FPR"], "fnr": s1["FNR"], "roc_auc": s1["ROC-AUC"]},
            "pipeline_accuracy": s2["pipeline_test_accuracy"],
            "pipeline_macro_f1": s2["pipeline_test_macro_f1"],
            "classes": len(s2["classes"]),
            "multiclass_recomputed": per_class_2017,
        },
    }
    return rounded(metrics), unique, sample, results


def comparison_table(m):
    new, full, old = m["sample"], m["all_rows"]["distinct_flows"], m["cic_ids2017_test"]
    pc = lambda v: "n/a" if v is None else f"{v * 100:.2f}%"  # noqa: E731
    lines = [
        "# CIC-IDS2017 vs CSE-CIC-IDS2018",
        "",
        "Same models, not retrained. 2017 is the held-out test split. The 2018 sample caps each class at "
        f"{m['settings']['max_per_class']:,} rows, so about {pc(1 - new['stage1']['tn'] / new['rows'] - new['stage1']['fp'] / new['rows'])} "
        f"of it is attacks. \"All 2018 rows\" uses every distinct flow, where {pc(full['attack_share'])} are attacks.",
        "",
        "## Stage 1: attack vs benign",
        "",
        "| Metric | 2017 test | 2018 sample | All 2018 rows |",
        "|---|---:|---:|---:|",
    ]
    for key, name in [("accuracy", "Accuracy"), ("precision", "Precision"), ("recall", "Recall"), ("f1", "F1"),
                      ("fpr", "FPR"), ("fnr", "FNR"), ("roc_auc", "ROC-AUC")]:
        lines.append(f"| {name} | {pc(old['stage1'][key])} | {pc(new['stage1'][key])} | {pc(full['stage1'][key])} |")
    multi = new["multiclass"]
    lines += [
        "",
        "## Full pipeline: which attack",
        "",
        "| Metric | 2017 test | 2018 sample |",
        "|---|---:|---:|",
        f"| Accuracy | {pc(old['pipeline_accuracy'])} | {pc(multi['accuracy'])} |",
        f"| Macro-F1 | {pc(old['pipeline_macro_f1'])} ({old['classes']} classes) | {pc(multi['macro_f1'])} ({len(multi['per_class'])} classes) |",
        "",
        "## Per class",
        "",
        "| Class | Rows | Precision | Recall | F1 | 2017 test recall | 2017 test F1 |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    before = {c["class"]: c for c in (old["multiclass_recomputed"] or {"per_class": []})["per_class"]}
    lines += [f"| {c['class']} | {c['support']:,} | {pc(c['precision'])} | {pc(c['recall'])} | {pc(c['f1'])} "
              f"| {pc(before.get(c['class'], {}).get('recall'))} | {pc(before.get(c['class'], {}).get('f1'))} |"
              for c in multi["per_class"]]
    lines += [
        "",
        "## Per day file, 2018 sample",
        "",
        "| Day | Rows | Stage 1 recall | Stage 1 FPR | ROC-AUC | Pipeline accuracy | Macro-F1 |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    lines += [f"| {d} | {r['rows']:,} | {pc(r['stage1']['recall'])} | {pc(r['stage1']['fpr'])} | {pc(r['stage1']['roc_auc'])} "
              f"| {pc(r['multiclass']['accuracy'])} | {pc(r['multiclass']['macro_f1'])} |" for d, r in m["per_day"].items()]
    return "\n".join(lines) + "\n"


def confusion_png(m, path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    c = m["sample"]["multiclass"]["confusion"]
    counts = np.array(c["matrix"])
    share = counts / counts.sum(axis=1, keepdims=True)
    fig, ax = plt.subplots(figsize=(11, 5.2), dpi=150)
    image = ax.imshow(share, cmap="Blues", vmin=0, vmax=1, aspect="auto")
    ax.set_xticks(range(len(c["predicted"])), c["predicted"], rotation=40, ha="right", fontsize=9)
    ax.set_yticks(range(len(c["true"])), [f"{name} ({counts[i].sum():,})" for i, name in enumerate(c["true"])], fontsize=9)
    ax.set_xlabel("Predicted class (the classes the 2017 models know)")
    ax.set_ylabel("True 2018 class (rows)")
    ax.set_title("CSE-CIC-IDS2018 sample: what each class gets predicted as", loc="left", fontsize=11)
    for i, row in enumerate(counts):
        for j, n in enumerate(row):
            if n:
                ax.text(j, i, f"{n:,}", ha="center", va="center", fontsize=8,
                        color="white" if share[i, j] > 0.55 else "#1a2433")
    fig.colorbar(image, ax=ax, label="Share of the true class", fraction=0.025, pad=0.02)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def save_reports(metrics, out_dir=OUT_DIR):
    out_dir.mkdir(parents=True, exist_ok=True)
    with open(out_dir / "metrics.json", "w") as f:
        json.dump(metrics, f, indent=2)
    (out_dir / "comparison.md").write_text(comparison_table(metrics), encoding="utf-8")
    confusion_png(metrics, out_dir / "confusion_matrix.png")


def make_demo_sample(unique, features, path=DEMO_CSV, data_dir=DATA_DIR):
    """A small labelled file with the original 2018 columns, exactly as they appear in the data."""
    rng = np.random.default_rng(SEED)
    quota = {**DEMO_QUOTA, "Benign": DEMO_ROWS - sum(DEMO_QUOTA.values())}
    wanted = set()
    for label, n in quota.items():
        pool = unique.loc[unique["raw_label"] == label, "row_hash"].to_numpy()
        wanted.update(rng.choice(pool, size=min(n, len(pool)), replace=False).tolist())

    parts = []
    for csv in sorted(data_dir.glob("*.csv")):
        for clean, raw, _ in read_clean_chunks(csv, features):
            hit = clean["row_hash"].isin(wanted).to_numpy()
            parts.append(raw.loc[hit].assign(row_hash=clean.loc[hit, "row_hash"].to_numpy()))
    table = pd.concat(parts, ignore_index=True).drop_duplicates("row_hash").drop(columns="row_hash")
    table = table.sample(frac=1, random_state=SEED).reset_index(drop=True)
    table.to_csv(path, index=False)
    return table


def main():
    parser = argparse.ArgumentParser(description="Evaluate the CIC-IDS2017 models on CSE-CIC-IDS2018")
    parser.add_argument("--demo", action="store_true", help="also rewrite the website's demo sample")
    args = parser.parse_args()

    metrics, unique, sample, _ = evaluate()
    save_reports(metrics)
    print((OUT_DIR / "comparison.md").read_text(encoding="utf-8"))
    print(f"Saved to {OUT_DIR}")

    if args.demo:
        table = make_demo_sample(unique, [c for c in sample.columns if c not in EXTRA_COLUMNS])
        print(f"Demo sample: {len(table):,} rows, {DEMO_CSV.stat().st_size / 1e6:.2f} MB")
        print(table[LABEL].value_counts().to_string())


if __name__ == "__main__":
    main()
