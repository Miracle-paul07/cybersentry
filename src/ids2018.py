"""
CSE-CIC-IDS2018 support: column and label mapping, loading, sampling and the
evaluation metrics. The website's Model Evaluation page and
backend/evaluate_ids2018.py both use these functions, so their numbers can't disagree.

Labels are only ever used here, for scoring. The models never see them.
"""
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import precision_recall_fscore_support, roc_auc_score

LABEL = "Label"
NOT_FEATURES = ["Timestamp", "Protocol"]
SEED = 42
MAX_PER_CLASS = 20_000
KEEP_ALL = ["DDOS attack-LOIC-UDP"]     # rare, so never sampled down

# 2018 name -> the 2017 name the models were trained on. The other 14 features
# (Flow Duration, Flow IAT Mean, ...) have the same name in both datasets.
COLUMN_MAP = {
    "Dst Port": "Destination Port",
    "Init Bwd Win Byts": "Init_Win_bytes_backward",
    "Init Fwd Win Byts": "Init_Win_bytes_forward",
    "Fwd Pkt Len Max": "Fwd Packet Length Max",
    "Fwd Pkt Len Mean": "Fwd Packet Length Mean",
    "Fwd Pkt Len Std": "Fwd Packet Length Std",
    "Bwd Pkt Len Max": "Bwd Packet Length Max",
    "Bwd Pkt Len Min": "Bwd Packet Length Min",
    "Pkt Len Mean": "Packet Length Mean",
    "Pkt Len Var": "Packet Length Variance",
    "TotLen Fwd Pkts": "Total Length of Fwd Packets",
    "Tot Fwd Pkts": "Total Fwd Packets",
    "Bwd Pkts/s": "Bwd Packets/s",
    "Flow Pkts/s": "Flow Packets/s",
    "Flow Byts/s": "Flow Bytes/s",
    "Fwd Seg Size Min": "min_seg_size_forward",
    "Bwd IAT Tot": "Bwd IAT Total",
    "PSH Flag Cnt": "PSH Flag Count",
}

# 2018 label -> the 2017 class the models know
LABEL_MAP = {
    "Benign": "BENIGN",
    "FTP-BruteForce": "FTP-Patator",
    "SSH-Bruteforce": "SSH-Patator",
    "DoS attacks-Hulk": "DoS Hulk",
    "DoS attacks-SlowHTTPTest": "DoS Slowhttptest",
    "DDOS attack-HOIC": "DDoS",
    "DDOS attack-LOIC-UDP": "DDoS",
    "Bot": "Bot",
}


def normalise_upload(df):
    """Accept 2018-style column names, and drop header rows repeated inside the data."""
    df = df.rename(columns={old: new for old, new in COLUMN_MAP.items() if old in df.columns and new not in df.columns})
    if LABEL in df.columns:
        df = df.loc[df[LABEL].astype(str).str.strip() != LABEL]
    return df


def check_features(columns, features):
    missing = [f for f in features if f not in columns]
    if missing:
        raise ValueError(f"{len(missing)} of {len(features)} model features did not map: {missing}")


def map_label(raw, classes):
    """The model class for a 2018 or 2017 label, or None if it isn't a known label. Never guesses."""
    label = str(raw).strip()
    if label in LABEL_MAP:
        return LABEL_MAP[label]
    if label in classes:
        return label
    # 2017 spells these "Web Attack - XSS" and so on, and the models treat them as one class
    if label.lower().startswith("web attack") and "Web Attack" in classes:
        return "Web Attack"
    return None


# --------------------------------------------------
# Loading
# --------------------------------------------------
def read_clean_chunks(path, features, chunksize=200_000):
    """
    Read one 2018 CSV in chunks, cleaned like the 2017 data: rows with NaN or infinite
    values are dropped. Yields (clean, raw, stats) per chunk. `clean` holds the features
    as float32 plus raw_label and row_hash, and `raw` holds the same rows as read.
    row_hash identifies a row by all its columns except Timestamp and Protocol, so
    duplicates can be dropped later across files.
    """
    for raw in pd.read_csv(path, dtype=str, chunksize=chunksize):
        raw.columns = raw.columns.str.strip()
        renamed = raw.rename(columns=COLUMN_MAP)
        check_features(renamed.columns, features)
        stats = {"rows_read": len(raw)}

        stray = renamed[LABEL].str.strip() == LABEL
        stats["repeated_headers_dropped"] = int(stray.sum())
        renamed = renamed.loc[~stray]

        numeric = renamed.drop(columns=NOT_FEATURES + [LABEL]).apply(pd.to_numeric, errors="coerce")
        numeric = numeric.replace([np.inf, -np.inf], np.nan)
        valid = numeric.notna().all(axis=1)
        stats["invalid_rows_dropped"] = int((~valid).sum())
        numeric, labels = numeric.loc[valid], renamed.loc[valid, LABEL].str.strip()

        clean = numeric[features].astype(np.float32)
        clean["raw_label"] = labels
        clean["row_hash"] = pd.util.hash_pandas_object(numeric.assign(**{LABEL: labels}), index=False)
        yield clean.reset_index(drop=True), raw.loc[renamed.index[valid]].reset_index(drop=True), stats


def load_folder(folder, features):
    """Every CSV in the folder, cleaned but with duplicates still in. Returns (rows, per-file stats)."""
    files = sorted(Path(folder).glob("*.csv"))
    if not files:
        raise FileNotFoundError(f"No CSV files in {folder}")
    frames, per_file = [], {}
    for path in files:
        totals = {}
        for clean, _, stats in read_clean_chunks(path, features):
            clean["day"] = path.stem
            frames.append(clean)
            for k, v in stats.items():
                totals[k] = totals.get(k, 0) + v
        per_file[path.stem] = totals
    return pd.concat(frames, ignore_index=True), per_file


def drop_duplicates(rows):
    """One row per distinct flow, with `copies` saying how many times it appeared."""
    copies = rows["row_hash"].value_counts()
    unique = rows.drop_duplicates("row_hash").reset_index(drop=True)
    unique["copies"] = unique["row_hash"].map(copies).astype(np.int64)
    return unique


def stratified_sample(unique, seed=SEED, cap=MAX_PER_CLASS, keep_all=KEEP_ALL):
    """At most `cap` rows per class, spread evenly over the days the class appears in."""
    rng = np.random.default_rng(seed)
    picked = []
    for _, group in unique.groupby("class", sort=True):
        forced = group.index[group["raw_label"].isin(keep_all)]
        picked.append(forced.to_numpy())
        left = cap - len(forced)
        pools = {day: rows.index.to_numpy() for day, rows in group.drop(forced).groupby("day", sort=True)}
        # Days with too few rows give everything they have; the others share the rest
        for day in sorted(pools, key=lambda d: len(pools[d])):
            days_left = sum(len(pools[d]) >= len(pools[day]) for d in pools)
            take = min(len(pools[day]), left // days_left)
            picked.append(rng.choice(pools[day], size=take, replace=False))
            left -= take
    return unique.loc[np.sort(np.concatenate(picked))].reset_index(drop=True)


# --------------------------------------------------
# Metrics
# --------------------------------------------------
def _ratio(a, b):
    return float(a / b) if b else None


def binary_metrics(is_attack, flagged, score=None, weights=None):
    """Attack vs benign. A metric that can't be computed from this data is None."""
    is_attack, flagged = np.asarray(is_attack, bool), np.asarray(flagged, bool)
    w = np.ones(len(is_attack), dtype=np.int64) if weights is None else np.asarray(weights)
    tp, fn = int(w[is_attack & flagged].sum()), int(w[is_attack & ~flagged].sum())
    fp, tn = int(w[~is_attack & flagged].sum()), int(w[~is_attack & ~flagged].sum())
    precision, recall = _ratio(tp, tp + fp), _ratio(tp, tp + fn)
    both_classes = is_attack.any() and (~is_attack).any()
    return {
        "accuracy": _ratio(tp + tn, tp + tn + fp + fn),
        "precision": precision,
        "recall": recall,
        "f1": _ratio(2 * tp, 2 * tp + fp + fn) if recall is not None else None,
        "fpr": _ratio(fp, fp + tn),
        "fnr": _ratio(fn, fn + tp),
        "roc_auc": float(roc_auc_score(is_attack, score, sample_weight=w)) if score is not None and both_classes else None,
        "tp": tp, "fp": fp, "tn": tn, "fn": fn,
    }


def multiclass_metrics(true, predicted, classes):
    """Scores cover the classes present in `true`; `classes` sets the predicted side of the matrix."""
    true, predicted = np.asarray(true, dtype=object), np.asarray(predicted, dtype=object)
    present = [c for c in classes if (true == c).any()]
    p, r, f, support = precision_recall_fscore_support(true, predicted, labels=present, zero_division=0)
    index = {c: i for i, c in enumerate(classes)}
    matrix = np.zeros((len(present), len(classes)), dtype=np.int64)
    for row, c in enumerate(present):
        kinds, counts = np.unique(predicted[true == c].astype(str), return_counts=True)
        for kind, count in zip(kinds, counts):
            matrix[row, index[kind]] = count
    return {
        "accuracy": float((true == predicted).mean()),
        "macro_f1": float(np.mean(f)),
        "per_class": [{"class": c, "precision": float(p[i]), "recall": float(r[i]), "f1": float(f[i]),
                       "support": int(support[i])} for i, c in enumerate(present)],
        "confusion": {"true": present, "predicted": list(classes), "matrix": matrix.tolist()},
    }


def score_predictions(true, results, classes):
    """All metrics for pipeline output. `true` holds a model class per row, in the same order as `results`."""
    is_attack = np.asarray(true, dtype=object) != "BENIGN"
    return {
        "rows": len(results),
        "stage1": binary_metrics(is_attack, results["suspicious"], results["stage1_score"]),
        "pipeline": binary_metrics(is_attack, results["is_threat"]),
        "multiclass": multiclass_metrics(true, results["attack_type"], classes),
    }


def evaluate_upload(labels, results, classes):
    """
    The website's Model Evaluation data. Rows whose label isn't known are left out and
    listed, rather than guessed at.
    """
    labels = pd.Series(labels).reset_index(drop=True)
    mapped = labels.map(lambda x: None if pd.isna(x) else map_label(x, classes))
    known = mapped.notna().to_numpy()
    unmapped = labels[~known].fillna("(blank)").astype(str).str.strip().value_counts()
    evaluation = {"rows_excluded": int((~known).sum()),
                  "unmapped_labels": {k: int(v) for k, v in unmapped.items()}}
    if not known.any():
        return {**evaluation, "rows": 0, "stage1": None, "pipeline": None, "multiclass": None}
    return {**evaluation, **score_predictions(mapped[known].to_numpy(), results.reset_index(drop=True).loc[known], classes)}
