"""
CyberSentry - full detection pipeline (Stage 1 ML -> Stage 2 DL).

Loads the saved models once and runs them on any DataFrame of CICFlowMeter-style
flow features (e.g. a CSV uploaded to the dashboard).

    from pipeline import CyberSentryPipeline
    pipe = CyberSentryPipeline(project_root)
    results = pipe.predict(df)      # adds suspicious / attack_type / confidence columns
"""
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from dl_models import load_classifier, log_transform, predict_proba


class CyberSentryPipeline:
    def __init__(self, root):
        root = Path(root)
        pre_dir, ml_dir, dl_dir = root / "models" / "preprocessing", root / "models" / "ml", root / "models" / "dl"

        self.s1_meta = json.load(open(ml_dir / "stage1_meta.json"))
        self.s1_model = joblib.load(ml_dir / "stage1_model.joblib")
        self.pre_scaler = joblib.load(pre_dir / "scaler.joblib") if self.s1_meta.get("needs_scaling") else None

        self.s2_model, ckpt = load_classifier(dl_dir / "stage2_model.pt")
        self.s2_meta = json.load(open(dl_dir / "stage2_meta.json"))
        self.dl_scaler = joblib.load(dl_dir / "dl_scaler.joblib")
        self.classes = ckpt["classes"]
        self.s2_features = ckpt["features"]
        self.review_threshold = self.s2_meta.get("review_threshold", 0.70)

    @property
    def required_features(self):
        return list(dict.fromkeys(self.s1_meta["features"] + self.s2_features))

    def prepare(self, df):
        """Clean an input table. Returns (clean_df, report dict). Raises ValueError if features are missing."""
        df = df.copy()
        df.columns = df.columns.str.strip()
        missing = [f for f in self.required_features if f not in df.columns]
        if missing:
            raise ValueError(f"Input is missing {len(missing)} required feature column(s): {missing}. "
                             "Upload a CICFlowMeter-format CSV (same columns as CIC-IDS2017).")
        n_in = len(df)
        feats = df[self.required_features].apply(pd.to_numeric, errors="coerce")
        feats = feats.replace([np.inf, -np.inf], np.nan)
        valid = feats.notna().all(axis=1)
        df = df.loc[valid].copy()
        df[self.required_features] = feats.loc[valid].astype(np.float32)
        return df.reset_index(drop=True), {"rows_in": n_in, "rows_dropped_invalid": int((~valid).sum()),
                                           "rows_analysed": int(valid.sum())}

    def _stage1_scores(self, df):
        X = df[self.s1_meta["features"]]
        name = self.s1_meta["model"]
        if name == "Isolation Forest":
            return -self.s1_model.score_samples(X)
        if name == "One-Class SVM":
            return -self.s1_model.decision_function(self.pre_scaler.transform(X.astype(np.float64)))
        return self.s1_model.predict_proba(X)[:, 1]

    def predict(self, df, already_prepared=False, threshold=None):
        """Run both stages. Returns a copy of df with result columns added.
        threshold overrides the saved Stage 1 threshold, for evaluation only."""
        if not already_prepared:
            df, _ = self.prepare(df)
        out = df.copy()
        score = self._stage1_scores(out)
        suspicious = score >= (self.s1_meta["threshold"] if threshold is None else threshold)

        out["stage1_score"] = score
        out["suspicious"] = suspicious
        out["attack_type"] = "BENIGN"
        out["confidence"] = np.nan
        out["needs_review"] = False

        if suspicious.any():
            X2 = self.dl_scaler.transform(log_transform(out.loc[suspicious, self.s2_features])).astype(np.float32)
            probs = predict_proba(self.s2_model, X2)
            conf = probs.max(1)
            out.loc[suspicious, "attack_type"] = np.array(self.classes, dtype=object)[probs.argmax(1)]
            out.loc[suspicious, "confidence"] = conf
            out.loc[suspicious, "needs_review"] = conf < self.review_threshold
        # Stage 2 may decide a flagged flow is actually normal
        out["is_threat"] = out["attack_type"] != "BENIGN"
        return out
