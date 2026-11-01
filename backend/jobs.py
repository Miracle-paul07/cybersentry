"""
Background analysis jobs with real, per-stage progress.

Stages: preprocess -> ml -> dl -> genai. The ML and DL stages run in chunks so the
website can show live counts. Stage 1 scores are computed per chunk for the ML
stage, then pipe.predict() (which repeats Stage 1, it is cheap) produces the final
results in the DL stage, so predict() stays the single source of truth.
"""
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor

import pandas as pd

from . import analysis
from .reports import generate_reports

STAGES = ["preprocess", "ml", "dl", "genai"]
# Share of the overall progress bar each stage takes
WEIGHTS = {"preprocess": 10, "ml": 30, "dl": 30, "genai": 30}
MAX_JOBS = 5


class Job:
    def __init__(self, filename, df):
        self.id = uuid.uuid4().hex[:12]
        self.filename = filename
        self.created_at = time.time()
        self.status = "queued"          # queued / running / done / error
        self.stage = None
        self.stage_percent = 0.0
        self.message = "Waiting to start"
        self.error = None
        self.warnings = []
        self.counts = {"rows_in": len(df), "rows_analysed": 0, "rows_dropped_invalid": 0,
                       "scored": 0, "suspicious": 0, "classified": 0, "threats": 0,
                       "threats_by_type": {}, "reports_done": 0, "reports_total": 0,
                       "reports_written": [], "report_current": None}
        self.stages = {s: {"status": "pending", "started_at": None, "seconds": None} for s in STAGES}
        self.lock = threading.Lock()
        self.input_df = df
        self.results = None
        self.cleaning = None
        self.summary = None
        self.reports = {}

    @property
    def percent(self):
        done = sum(WEIGHTS[s] for s in STAGES if self.stages[s]["status"] == "done")
        if self.stage in self.stages and self.stages[self.stage]["status"] == "running":
            done += WEIGHTS[self.stage] * self.stage_percent / 100
        return round(done, 1)

    def snapshot(self):
        with self.lock:
            return analysis.clean({
                "job_id": self.id, "filename": self.filename, "status": self.status,
                "stage": self.stage, "stage_percent": round(self.stage_percent, 1),
                "percent": self.percent, "message": self.message, "error": self.error,
                "warnings": list(self.warnings), "stages": {k: dict(v) for k, v in self.stages.items()},
                "counts": {**self.counts, "threats_by_type": dict(self.counts["threats_by_type"])},
            })

    # -- progress helpers (called from the worker thread) --
    def start_stage(self, stage, message):
        with self.lock:
            self.stage, self.stage_percent, self.message = stage, 0.0, message
            self.stages[stage].update(status="running", started_at=time.time())

    def update(self, stage_percent=None, message=None, **counts):
        with self.lock:
            if stage_percent is not None:
                self.stage_percent = min(100.0, stage_percent)
            if message is not None:
                self.message = message
            self.counts.update(counts)

    def finish_stage(self, stage):
        with self.lock:
            info = self.stages[stage]
            info.update(status="done", seconds=round(time.time() - info["started_at"], 3))
            self.stage_percent = 100.0


class JobManager:
    def __init__(self, pipeline, baseline):
        self.pipeline = pipeline
        self.baseline = baseline
        self.jobs = {}
        self.lock = threading.Lock()
        # One worker: models are shared, and jobs queue in order
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="cybersentry-job")

    def submit(self, filename, df):
        job = Job(filename, df)
        with self.lock:
            self.jobs[job.id] = job
            for old in sorted(self.jobs.values(), key=lambda j: j.created_at)[:-MAX_JOBS]:
                if old.status in ("done", "error"):
                    del self.jobs[old.id]
        self.executor.submit(self._run, job)
        return job

    def get(self, job_id):
        return self.jobs.get(job_id)

    def _run(self, job):
        with job.lock:
            job.status = "running"
        try:
            self._analyse(job)
            with job.lock:
                job.status, job.stage, job.message = "done", "done", "Analysis complete"
        except Exception as e:
            with job.lock:
                job.status, job.error = "error", str(e)
                if job.stage:
                    job.stages[job.stage]["status"] = "error"
                job.message = "Analysis failed"
        finally:
            job.input_df = None

    def _analyse(self, job):
        pipe = self.pipeline

        job.start_stage("preprocess", "Cleaning and validating flow records")
        clean_df, cleaning = pipe.prepare(job.input_df)
        if clean_df.empty:
            raise ValueError("No valid rows remain after cleaning the uploaded CSV "
                             f"({cleaning['rows_dropped_invalid']} rows had missing or non-numeric values).")
        job.update(**cleaning)
        job.cleaning = cleaning
        job.finish_stage("preprocess")

        n = len(clean_df)
        size = max(500, n // 20)
        chunks = [clean_df.iloc[i:i + size] for i in range(0, n, size)]

        job.start_stage("ml", f"Stage 1 anomaly detection ({pipe.s1_meta['model']})")
        threshold = pipe.s1_meta["threshold"]
        scored = suspicious = 0
        for chunk in chunks:
            scores = pipe._stage1_scores(chunk)
            scored += len(chunk)
            suspicious += int((scores >= threshold).sum())
            job.update(100 * scored / n, scored=scored, suspicious=suspicious)
        job.finish_stage("ml")

        job.start_stage("dl", f"Stage 2 attack classification ({pipe.s2_meta.get('model', 'DL')})")
        parts, by_type = [], {}
        classified = 0
        for chunk in chunks:
            out = pipe.predict(chunk, already_prepared=True)
            parts.append(out)
            classified += len(out)
            for attack, count in out.loc[out["is_threat"], "attack_type"].value_counts().items():
                by_type[attack] = by_type.get(attack, 0) + int(count)
            job.update(100 * classified / n, classified=classified,
                       threats=sum(by_type.values()), threats_by_type=dict(by_type))
        results = analysis.add_risk(pd.concat(parts))
        job.finish_stage("dl")

        job.start_stage("genai", "Writing incident reports")
        n_types = len(by_type)
        job.update(reports_total=n_types,
                   message="No threats found, no reports needed" if not n_types else None)

        written, current = [], [None]

        def progress(done, total, attack):
            if current[0]:
                written.append(current[0])
            current[0] = attack
            job.update(100 * done / total if total else 100.0,
                       message=f"Writing incident report for {attack} ({done + 1}/{total})"
                       if attack else "Incident reports ready",
                       reports_done=done, reports_written=list(written), report_current=attack)

        reports, warnings = generate_reports(results, self.baseline, progress=progress)
        with job.lock:
            job.warnings.extend(warnings)
        job.finish_stage("genai")

        job.results = results
        job.reports = reports
        job.summary = analysis.summary(results, cleaning, job.filename)
