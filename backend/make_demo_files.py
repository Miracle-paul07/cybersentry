"""
Labelled CSVs to upload on the website during a demo. They go in data/demo/, which isn't in git.

    python -m backend.make_demo_files

The 2017 files come from the held-out test split only (data/processed/test.parquet, see
notebook 02), minus any row whose 32 model features also appear in train or val, so the
models have never seen them. test.parquet only holds the 32 features. No row is in two files.
"""
import json

import numpy as np
import pandas as pd

from . import PROJECT_ROOT
from .evaluate_ids2018 import DATA_DIR, make_demo_sample

from ids2018 import LABEL, LABEL_MAP, drop_duplicates, load_folder  # noqa: E402  (src/ on sys.path via backend/__init__.py)

OUT_DIR = PROJECT_ROOT / "data" / "demo"
PROCESSED = PROJECT_ROOT / "data" / "processed"
SEED_2017 = 7
SEED_2018 = 2018    # the evaluation sample uses 42
ROWS = 5_000

# Attack rows per file. Benign fills the rest, so each file is mostly normal traffic.
FILES_2017 = {
    "cicids2017_test_mixed.csv": {
        "DoS Hulk": 250, "DDoS": 200, "PortScan": 200, "DoS GoldenEye": 50, "DoS slowloris": 50, "DoS Slowhttptest": 50,
        "FTP-Patator": 40, "SSH-Patator": 30, "Bot": 60, "Web Attack - Brute Force": 40, "Web Attack - XSS": 20,
        "Infiltration": 6, "Web Attack - Sql Injection": 3, "Heartbleed": 1,
    },
    "cicids2017_test_dos.csv": {
        "DoS Hulk": 400, "DDoS": 350, "DoS GoldenEye": 100, "DoS slowloris": 75, "DoS Slowhttptest": 75,
    },
    "cicids2017_test_bruteforce_portscan.csv": {"PortScan": 700, "FTP-Patator": 200, "SSH-Patator": 100},
    # Everything the mixed file doesn't use: these classes are small
    "cicids2017_test_web_bot.csv": {"Bot": 232, "Web Attack - Brute Force": 180, "Web Attack - XSS": 78},
}
QUOTA_2018 = {"Benign": 4_000, "DoS attacks-Hulk": 200, "SSH-Bruteforce": 200, "DDOS attack-HOIC": 200, "Bot": 200,
              "DDOS attack-LOIC-UDP": 100, "FTP-BruteForce": 50, "DoS attacks-SlowHTTPTest": 50}


def row_hashes(frame, features):
    return pd.util.hash_pandas_object(frame[features].astype(np.float32), index=False).to_numpy()


def unseen_test_rows(features):
    """The test split, without rows the models could have seen in train or val, and without repeats."""
    test = pd.read_parquet(PROCESSED / "test.parquet", columns=features + [LABEL])
    test[LABEL] = test[LABEL].astype(str)
    seen = np.concatenate([row_hashes(pd.read_parquet(PROCESSED / f"{name}.parquet", columns=features), features)
                           for name in ("train", "val")])
    hashes = row_hashes(test, features)
    keep = ~np.isin(hashes, seen) & ~pd.Series(hashes).duplicated().to_numpy()
    print(f"Test split: {len(test):,} rows, {int((~keep).sum()):,} left out as seen or repeated")
    return test.loc[keep].reset_index(drop=True)


def build_2017(pool):
    rng = np.random.default_rng(SEED_2017)
    available = {label: rng.permutation(rows.index.to_numpy()) for label, rows in pool.groupby(LABEL)}

    def take(label, n):
        if len(available[label]) < n:
            raise ValueError(f"{label}: wanted {n}, only {len(available[label])} left")
        rows, available[label] = available[label][:n], available[label][n:]
        return rows

    for name, attacks in FILES_2017.items():
        picked = [take(label, n) for label, n in attacks.items()]
        picked.append(take("BENIGN", ROWS - sum(attacks.values())))
        table = pool.loc[np.concatenate(picked)].sample(frac=1, random_state=SEED_2017)
        table.to_csv(OUT_DIR / name, index=False)
        report(name, table)


def report(name, table):
    size = (OUT_DIR / name).stat().st_size / 1e6
    benign = table[LABEL].isin(["BENIGN", "Benign"]).mean()
    print(f"{name}: {len(table):,} rows, {size:.2f} MB, {benign:.0%} benign")
    print("  " + ", ".join(f"{k} {v}" for k, v in table[LABEL].value_counts().items()))


def main():
    with open(PROJECT_ROOT / "models" / "preprocessing" / "selected_features.json") as f:
        features = json.load(f)["selected_features"]
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    build_2017(unseen_test_rows(features))

    rows, _ = load_folder(DATA_DIR, features)
    unique = drop_duplicates(rows.loc[rows["raw_label"].isin(LABEL_MAP)])
    name = "ids2018_demo_mixed.csv"
    report(name, make_demo_sample(unique, features, path=OUT_DIR / name, quota=QUOTA_2018, seed=SEED_2018))


if __name__ == "__main__":
    main()
