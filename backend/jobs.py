"""
Background analysis jobs with real, per-stage progress.

Stages: preprocess -> ml -> dl -> genai. The ML and DL stages run in chunks so the
website can show live counts. Stage 1 scores are computed per chunk for the ML
stage, then pipe.predict() (which repeats Stage 1, it is cheap) produces the final
results in the DL stage, so predict() stays the single source of truth.

Results are usable as soon as the DL stage ends (results_ready). The genai stage then
runs on its own thread, because Groq's rate limit can make it take minutes, and the
job's status only becomes "done" when the last report is finished.
"""
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor

import pandas as pd

from . import analysis
from .reports import generate_reports, report_order, severity_of

from ids2018 import LABEL, evaluate_upload  # noqa: E402  (src/ on sys.path via backend/__init__.py)

STAGES = ["preprocess", "ml", "dl", "genai"]
# Share of the overall progress bar each stage takes
WEIGHTS = {"preprocess": 10, "ml": 30, "dl": 30, "genai": 30}
MAX_JOBS = 5
SOURCE_ROW = "_source_row"


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
                       "threats_by_type": {}, "reports_done": 0, "reports_total": 0}
        self.stages = {s: {"status": "pending", "started_at": None, "seconds": None} for s in STAGES}
        self.lock = threading.Lock()
        # A Label column is taken out here, so the pipeline can't see it. It is only used for scoring.
        self.labels = df[LABEL].reset_index(drop=True) if LABEL in df.columns else None
        self.input_df = df.drop(columns=LABEL, errors="ignore")
        self.evaluation = None
        self.results = None
        self.cleaning = None
        self.summary = None
        self.results_ready = False
        self.reports = {}               # attack type -> finished report
        self.report_states = {}         # attack type -> state, in the order they get written
        self.cancel_reports = False

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
                "results_ready": self.results_ready, "has_evaluation": self.evaluation is not None,
                "stage": self.stage, "stage_percent": round(self.stage_percent, 1),
                "percent": self.percent, "message": self.message, "error": self.error,
                "warnings": list(self.warnings), "stages": {k: dict(v) for k, v in self.stages.items()},
                "counts": {**self.counts, "threats_by_type": dict(self.counts["threats_by_type"])},
                "reports": [dict(r) for r in self.report_states.values()],
            })

    def report_list(self):
        with self.lock:
            return [dict(r) for r in self.report_states.values()]

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

    def add_warning(self, text):
        with self.lock:
            if text not in self.warnings:
                self.warnings.append(text)

    def set_report_state(self, attack, status, report=None):
        with self.lock:
            state = self.report_states[attack]
            state["status"] = status
            if report:
                self.reports[attack] = report
                state.update(source=report["source"], incident_id=report["incident_id"])
            total = len(self.report_states)
            if status == "generating":
                position = list(self.report_states).index(attack) + 1
                self.message = f"Writing incident report for {attack} ({position}/{total})"
            else:
                done = sum(r["status"] in ("ready", "failed") for r in self.report_states.values())
                self.counts["reports_done"] = done
                self.stage_percent = 100 * done / total


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
            for other in self.jobs.values():
                other.cancel_reports = other is not job
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
            results = self._analyse(job)
        except Exception as e:
            with job.lock:
                job.status, job.error = "error", str(e)
                if job.stage:
                    job.stages[job.stage]["status"] = "error"
                job.message = "Analysis failed"
            return
        finally:
            job.input_df = None
        # Daemon thread: a report waiting on Groq must not keep the server from stopping
        threading.Thread(target=self._write_reports, args=(job, results), daemon=True,
                         name=f"cybersentry-reports-{job.id}").start()

    def _write_reports(self, job, results):
        try:
            generate_reports(list(job.report_states), results, self.baseline, job.set_report_state,
                             job.add_warning, cancelled=lambda: job.cancel_reports)
        except Exception as e:
            print(f"[reports] report generation stopped: {e}", flush=True)
            job.add_warning("Report generation stopped early, so some incident reports are missing.")
            for attack, state in list(job.report_states.items()):
                if state["status"] in ("queued", "generating"):
                    job.set_report_state(attack, "failed")
        job.finish_stage("genai")
        with job.lock:
            job.status, job.stage, job.message = "done", "done", "Analysis complete"

    def _score(self, job, results, source_rows):
        # Scoring is an extra: the scan's own results must survive it failing
        try:
            job.evaluation = analysis.clean(evaluate_upload(job.labels.iloc[source_rows], results, self.pipeline.classes))
        except Exception as e:
            print(f"[evaluation] could not score the labels: {e}", flush=True)
            job.add_warning("The Label column could not be used, so the Model Evaluation page is not available.")
            return
        unmapped = job.evaluation["unmapped_labels"]
        if unmapped:
            names = ", ".join(f"{name} ({count:,})" for name, count in unmapped.items())
            job.add_warning(f"Model Evaluation leaves out rows with labels the models have no class for: {names}.")

    def _analyse(self, job):
        pipe = self.pipeline

        job.start_stage("preprocess", "Cleaning and validating flow records")
        # Cleaning can drop rows, so remember where each one came from to line the labels up again
        clean_df, cleaning = pipe.prepare(job.input_df.assign(**{SOURCE_ROW: range(len(job.input_df))}))
        source_rows = clean_df.pop(SOURCE_ROW).to_numpy()
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

        job.results = results
        job.summary = analysis.summary(results, cleaning, job.filename)
        if job.labels is not None:
            self._score(job, results, source_rows)

        order = report_order(results)
        job.start_stage("genai", "Writing incident reports" if order else "No threats found, no reports needed")
        with job.lock:
            job.report_states = {attack: {"attack_type": attack, "severity": severity_of(attack), "flows": flows,
                                          "status": "queued", "source": None, "incident_id": None}
                                 for attack, flows in order}
            job.counts["reports_total"] = len(order)
            job.results_ready = True
        return results
