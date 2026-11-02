"""
Stage 1 threshold calibration on CSE-CIC-IDS2018. Analysis only: nothing here changes
the saved models or the threshold the website uses.

    python -m backend.calibrate_ids2018

The 2018 evaluation sample is split in half. The threshold is chosen on the calibration
half and only ever scored on the test half.
"""
import json

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

from . import PROJECT_ROOT
from .evaluate_ids2018 import DATA_DIR, OUT_DIR, TEST_2017, rounded

from dl_models import log_transform  # noqa: E402  (src/ on sys.path via backend/__init__.py)
from ids2018 import LABEL, LABEL_MAP, SEED, drop_duplicates, load_folder, map_label, score_predictions, stratified_sample  # noqa: E402
from pipeline import CyberSentryPipeline  # noqa: E402

MAX_FPR = 0.05
OTHER_BUDGETS = [0.01, 0.10]    # how much the result depends on the budget


def threshold_for_fpr(scores, is_attack, max_fpr):
    """The lowest threshold with FPR under max_fpr, which is the one with the highest recall."""
    benign = np.sort(scores[~is_attack])
    candidates = np.unique(scores)
    fpr = (len(benign) - np.searchsorted(benign, candidates, side="left")) / len(benign)
    return float(candidates[fpr < max_fpr].min())


def stage2_view(pipe, frame):
    """Features as Stage 2 receives them: signed log, then its scaler. Units are its training spread."""
    scaled = pipe.dl_scaler.transform(log_transform(frame[pipe.s2_features]))
    return pd.DataFrame(scaled, columns=pipe.s2_features, index=frame.index)


def why_misclassified(pipe, test_half, results):
    """
    For each 2018 class: what Stage 2 does with the flows that reach it, which features moved
    most from the same class in 2017, and which 2017 class it now sits closest to.
    """
    features = pipe.s2_features
    old = pd.read_parquet(TEST_2017, columns=features + [LABEL])
    old_class = old[LABEL].astype(str).map(lambda x: map_label(x, pipe.classes)).to_numpy()
    old_medians_raw = old[features].groupby(old_class).median()
    old_centres = stage2_view(pipe, old).groupby(old_class).median()

    reached = results["suspicious"].to_numpy()
    new_view = stage2_view(pipe, test_half)
    out = {}
    for name, rows in test_half.groupby("class", sort=True):
        i = rows.index.to_numpy()
        at_stage2 = i[reached[i]]
        predicted = results.loc[at_stage2, "attack_type"].value_counts()
        centre = new_view.loc[i].median()
        moved = (centre - old_centres.loc[name]).abs().sort_values(ascending=False)
        distances = ((old_centres - centre) ** 2).sum(axis=1) ** 0.5
        out[name] = {
            "rows": len(i),
            "reached_stage2": len(at_stage2),
            "correct_at_stage2": int(predicted.get(name, 0)),
            "stage2_predictions": {k: int(v) for k, v in predicted.head(4).items()},
            "closest_2017_classes": {k: float(v) for k, v in distances.sort_values().head(3).items()},
            "distance_to_own_2017_class": float(distances[name]),
            "most_moved_features": [{"feature": f, "shift_in_stage2_units": float(moved[f]),
                                     "median_2017": float(old_medians_raw.loc[name, f]),
                                     "median_2018": float(rows[f].median())} for f in moved.index[:5]],
        }
    return out


def flagged_by_label(frame, results):
    return {label: float(results.loc[rows.index, "suspicious"].mean())
            for label, rows in frame.groupby("raw_label", sort=True)}


def run():
    pipe = CyberSentryPipeline(PROJECT_ROOT)
    features = pipe.required_features
    saved_threshold = pipe.s1_meta["threshold"]

    rows, _ = load_folder(DATA_DIR, features)
    unique = drop_duplicates(rows.loc[rows["raw_label"].isin(LABEL_MAP)])
    del rows
    unique["class"] = unique["raw_label"].map(LABEL_MAP)
    sample = stratified_sample(unique)

    # Must be the same sample as the main evaluation, or the comparison means nothing
    with open(OUT_DIR / "metrics.json") as f:
        evaluation = json.load(f)
    whole = score_predictions(sample["class"].to_numpy(), pipe.predict(sample[features]), pipe.classes)
    if rounded(whole["stage1"]) != evaluation["sample"]["stage1"]:
        raise RuntimeError("This sample doesn't reproduce metrics.json. Re-run backend.evaluate_ids2018 first.")

    calibration, test = train_test_split(sample, test_size=0.5, stratify=sample["raw_label"], random_state=SEED)
    calibration, test = calibration.reset_index(drop=True), test.reset_index(drop=True)

    cal_scores = pipe._stage1_scores(calibration[features])
    cal_attack = (calibration["class"] != "BENIGN").to_numpy()
    chosen = threshold_for_fpr(cal_scores, cal_attack, MAX_FPR)

    def score(threshold):
        results = pipe.predict(test[features], threshold=threshold)
        return results, {**score_predictions(test["class"].to_numpy(), results, pipe.classes),
                         "stage1_flagged_by_label": flagged_by_label(test, results)}

    _, original = score(saved_threshold)
    calibrated_results, calibrated = score(chosen)
    budgets = {}
    for budget in OTHER_BUDGETS:
        t = threshold_for_fpr(cal_scores, cal_attack, budget)
        _, scored = score(t)
        budgets[str(budget)] = {"threshold": t, "stage1": scored["stage1"], "pipeline": scored["pipeline"],
                                "macro_f1": scored["multiclass"]["macro_f1"], "accuracy": scored["multiclass"]["accuracy"]}

    return rounded({
        "settings": {"seed": SEED, "max_fpr": MAX_FPR, "saved_threshold": saved_threshold,
                     "calibrated_threshold": chosen,
                     "calibration_rows": len(calibration), "test_rows": len(test),
                     "note": "Analysis only. The saved model and the website's threshold are unchanged."},
        "calibration_half_fpr": float((cal_scores[~cal_attack] >= chosen).mean()),
        "test_half": {"original_threshold": original, "calibrated_threshold": calibrated},
        "other_fpr_budgets": budgets,
        "why_misclassified": why_misclassified(pipe, test, calibrated_results),
    })


def markdown(m):
    pc = lambda v: "n/a" if v is None else f"{v * 100:.2f}%"  # noqa: E731
    s = m["settings"]
    old, new = m["test_half"]["original_threshold"], m["test_half"]["calibrated_threshold"]
    lines = [
        "# Stage 1 threshold calibration on CSE-CIC-IDS2018",
        "",
        f"Analysis only. The saved model and the website's threshold ({s['saved_threshold']}) are unchanged.",
        "",
        f"The {s['calibration_rows'] + s['test_rows']:,}-row evaluation sample was split in half, stratified with seed {s['seed']}. "
        f"The threshold was chosen on the calibration half as the lowest one with FPR under {s['max_fpr']:.0%}, "
        f"which gave **{s['calibrated_threshold']:.6f}** (FPR {pc(m['calibration_half_fpr'])} on that half). "
        f"Everything below is from the {s['test_rows']:,}-row test half. About 80% of its rows are attacks, "
        "so precision and accuracy are higher than they would be at a real traffic mix.",
        "",
        "## Results",
        "",
        "| Metric | Original threshold | Calibrated threshold |",
        "|---|---:|---:|",
    ]
    for key, name in [("recall", "Recall"), ("precision", "Precision"), ("f1", "F1"), ("fpr", "FPR")]:
        lines.append(f"| Stage 1 {name} | {pc(old['stage1'][key])} | {pc(new['stage1'][key])} |")
    for key, name in [("recall", "Recall"), ("fpr", "FPR")]:
        lines.append(f"| After Stage 2 {name} | {pc(old['pipeline'][key])} | {pc(new['pipeline'][key])} |")
    lines += [
        f"| Pipeline accuracy | {pc(old['multiclass']['accuracy'])} | {pc(new['multiclass']['accuracy'])} |",
        f"| Pipeline macro-F1 | {pc(old['multiclass']['macro_f1'])} | {pc(new['multiclass']['macro_f1'])} |",
        "",
        "## Share of each 2018 label flagged by Stage 1",
        "",
        "| Label | Original threshold | Calibrated threshold |",
        "|---|---:|---:|",
    ]
    lines += [f"| {k} | {pc(old['stage1_flagged_by_label'][k])} | {pc(v)} |" for k, v in new["stage1_flagged_by_label"].items()]
    lines += ["", "## How much depends on the FPR budget", "", "| FPR budget | Threshold | Stage 1 recall | Stage 1 FPR | Macro-F1 |", "|---:|---:|---:|---:|---:|"]
    budgets = {**m["other_fpr_budgets"], str(s["max_fpr"]): {"threshold": s["calibrated_threshold"], "stage1": new["stage1"], "macro_f1": new["multiclass"]["macro_f1"]}}
    for budget in sorted(budgets, key=float):
        b = budgets[budget]
        lines.append(f"| {float(budget):.0%} | {b['threshold']:.6f} | {pc(b['stage1']['recall'])} | {pc(b['stage1']['fpr'])} | {pc(b['macro_f1'])} |")
    lines += [
        "",
        "## What Stage 2 does at the calibrated threshold",
        "",
        "| 2018 class | Rows | Reached Stage 2 | Named correctly | Stage 2 predictions | Closest 2017 classes |",
        "|---|---:|---:|---:|---|---|",
    ]
    why = m["why_misclassified"]
    for name, w in why.items():
        predictions = ", ".join(f"{k} {v:,}" for k, v in w["stage2_predictions"].items()) or "none"
        lines.append(f"| {name} | {w['rows']:,} | {w['reached_stage2']:,} | {w['correct_at_stage2']:,} | {predictions} | {', '.join(w['closest_2017_classes'])} |")
    lines += [
        "",
        "\"Closest\" compares the median flow of each class as Stage 2 sees it (signed log, then its scaler).",
        "",
        "## Features that moved most from the same class in 2017",
        "",
        "Shift is in Stage 2's input units, where 1 is one standard deviation of its training data.",
        "",
        "| 2018 class | Feature | Shift | 2017 median | 2018 median |",
        "|---|---|---:|---:|---:|",
    ]
    for name, w in why.items():
        lines += [f"| {name} | {f['feature']} | {f['shift_in_stage2_units']:.2f} | {f['median_2017']:,.2f} | {f['median_2018']:,.2f} |"
                  for f in w["most_moved_features"][:3]]
    return "\n".join(lines) + "\n"


def main():
    metrics = run()
    with open(OUT_DIR / "calibration_metrics.json", "w") as f:
        json.dump(metrics, f, indent=2)
    (OUT_DIR / "calibration.md").write_text(markdown(metrics), encoding="utf-8")
    print((OUT_DIR / "calibration.md").read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()
