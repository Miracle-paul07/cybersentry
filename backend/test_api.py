"""
End-to-end API test with the demo CSV.

    python -m backend.test_api            # template reports (Groq disabled)
    python -m backend.test_api --online   # real Groq calls if GROQ_API_KEY is set
"""
import io
import json
import os
import sys
import threading
import time
from contextlib import contextmanager
from types import SimpleNamespace

import pandas as pd
from fastapi.testclient import TestClient

from . import PROJECT_ROOT, reports
from .main import app, state

from genai_report import grounding_check, retry_wait, template_narrative  # noqa: E402  (src/ on sys.path via backend/__init__.py)

ONLINE = "--online" in sys.argv
DEMO = PROJECT_ROOT / "app" / "sample_data" / "demo_flows.csv"
SAMPLE_2018 = PROJECT_ROOT / "app" / "sample_data" / "ids2018_sample.csv"
INVENTED = "3,607,562,000"
failures = []


def check(name, ok, info=""):
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f"  ({info})" if info else ""))
    if not ok:
        failures.append(name)


def upload(client, name, data):
    return client.post("/api/analyze", files={"file": (name, data, "text/csv")})


def wait(client, job_id, timeout=600):
    seen, start = [], time.time()
    while time.time() - start < timeout:
        s = client.get(f"/api/jobs/{job_id}").json()
        if not seen or seen[-1] != s["stage"]:
            seen.append(s["stage"])
        if s["status"] in ("done", "error"):
            return s, seen, time.time() - start
        time.sleep(0.05)
    raise TimeoutError(job_id)


def until(condition, timeout=60):
    start = time.time()
    while time.time() - start < timeout:
        value = condition()
        if value:
            return value
        time.sleep(0.02)
    raise TimeoutError("condition never became true")


class RateLimited(Exception):
    def __init__(self, retry_after="0"):
        super().__init__("429 rate limit")
        self.status_code = 429
        self.response = SimpleNamespace(headers={"retry-after": retry_after})


class FakeGroq:
    """Stands in for the Groq client, so the real retry and fallback code runs without using quota."""

    def __init__(self, gated=False, error_for=lambda attack: None, wrong_number=lambda attack, nth: False):
        self.calls = []
        self.corrections = []
        self.wrong_number = wrong_number   # should this attack type's nth answer contain an invented number?
        self.options = {}
        self.permits = threading.Semaphore(0) if gated else None   # gated: each call waits for release()
        self.error_for = error_for
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))

    def release(self, n=1):
        for _ in range(n):
            self.permits.release()

    def create(self, model, messages, **kwargs):
        evidence = json.loads(messages[1]["content"].split("EVIDENCE:\n", 1)[1])
        self.calls.append(evidence["attack_type"])
        self.corrections += [m["content"] for m in messages[2:]]
        self.options = kwargs
        if self.permits:
            self.permits.acquire(timeout=60)
        error = self.error_for(evidence["attack_type"])
        if error:
            raise error
        narrative = template_narrative(evidence)
        if self.wrong_number(evidence["attack_type"], self.calls.count(evidence["attack_type"])):
            narrative["summary"] += f" {INVENTED} flows were seen."
        content = json.dumps(narrative)
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))])


@contextmanager
def fake_groq(fake):
    saved = reports.llm_client, reports.groq_reachable, os.environ.get("GROQ_API_KEY")
    reports.llm_client, reports.groq_reachable = fake, lambda timeout=2.0: True
    os.environ["GROQ_API_KEY"] = "test-key"
    try:
        yield fake
    finally:
        reports.llm_client, reports.groq_reachable = saved[:2]
        if saved[2] is None:
            del os.environ["GROQ_API_KEY"]
        else:
            os.environ["GROQ_API_KEY"] = saved[2]


def background_reports(client, demo, benign_csv):
    def scan():
        return upload(client, DEMO.name, demo).json()["job_id"]

    def snap(job_id):
        return client.get(f"/api/jobs/{job_id}").json()

    def code(job_id, attack, suffix=""):
        return client.get(f"/api/jobs/{job_id}/reports/{attack}{suffix}").status_code

    print("Results unlock before the reports are written")
    with fake_groq(FakeGroq(gated=True)) as fake:
        job_id = scan()
        s = until(lambda: (lambda x: x if x["results_ready"] else None)(snap(job_id)))
        check("unlocked while reports are pending", s["status"] == "running" and s["stages"]["genai"]["status"] == "running"
              and s["counts"]["reports_done"] == 0, f"{s['counts']['reports_total']} reports to write")
        check("overview, detection and analysis open early",
              all(client.get(f"/api/jobs/{job_id}/{p}").status_code == 200 for p in ("results", "analysis")))

        rows = until(lambda: (lambda r: r if r[0]["status"] == "generating" else None)(snap(job_id)["reports"]))
        order = [r["attack_type"] for r in rows]
        ranks = [reports.SEVERITY_RANK[r["severity"]] for r in rows]
        check("most severe first", ranks == sorted(ranks) and rows[0]["severity"] == "Critical", order)
        check("same severity: most flows first",
              all(a["flows"] >= b["flows"] for a, b in zip(rows, rows[1:]) if a["severity"] == b["severity"]))
        check("one generating, rest queued", all(r["status"] == "queued" for r in rows[1:]))
        check("/reports lists pending types", len(client.get(f"/api/jobs/{job_id}/reports").json()["reports"]) == len(rows))
        first, second = order[0], order[1]
        check("pending report -> 409", code(job_id, first) == 409 and code(job_id, first, ".pdf") == 409
              and code(job_id, first, ".txt") == 409)
        check("unknown report still 404", code(job_id, "Nope") == 404)

        fake.release()
        s = until(lambda: (lambda x: x if x["counts"]["reports_done"] == 1 else None)(snap(job_id)))
        check("first report ready alone", s["reports"][0]["status"] == "ready" and s["reports"][0]["source"].startswith("Groq")
              and s["status"] == "running", s["message"])
        check("its downloads work, the next one's don't", code(job_id, first, ".pdf") == 200
              and code(job_id, second, ".pdf") == 409)

        fake.release(len(order))
        s, _, _ = wait(client, job_id)
        check("all ready, in order", s["status"] == "done" and fake.calls == order
              and all(r["status"] == "ready" for r in s["reports"]), s["counts"]["reports_done"])
        check("percent 100, no warnings", s["percent"] == 100 and not s["warnings"], s["warnings"])
        check("reasoning effort is low", fake.options.get("reasoning_effort") == "low")

    print("Groq failures")
    check("backoff uses Retry-After", retry_wait(RateLimited("7"), 0) == 7)
    check("429 without header backs off longer", retry_wait(Exception("429"), 1) == 40)
    check("other errors retry quickly", retry_wait(Exception("Failed to generate JSON"), 0) == 2)

    with fake_groq(FakeGroq(error_for=lambda a: RateLimited() if a == first else None)) as fake:
        s, _, _ = wait(client, scan())
        one = s["reports"][0]
        check("rate limit: retried then template", fake.calls.count(first) == 8 and one["status"] == "failed"
              and one["source"].startswith("template"), f"{fake.calls.count(first)} tries")
        check("rate limit: others unaffected", s["status"] == "done" and all(r["status"] == "ready" for r in s["reports"][1:]))
        check("rate limit: warning shown", len(s["warnings"]) == 1, s["warnings"])
        check("failed report still downloads", code(s["job_id"], first, ".pdf") == 200)

    with fake_groq(FakeGroq(error_for=lambda a: RateLimited())) as fake:
        s, _, _ = wait(client, scan())
        check("Groq down: stops calling after 2 types", len(fake.calls) == 2 * 8, f"{len(fake.calls)} calls")
        check("Groq down: all template, job done", s["status"] == "done"
              and all(r["status"] == "failed" and r["source"] for r in s["reports"]))

    with fake_groq(FakeGroq(error_for=lambda a: RateLimited("3600"))) as fake:
        start = time.time()
        s, _, _ = wait(client, scan())
        check("quota used up: no waiting", len(fake.calls) == 2 and time.time() - start < 30, f"{len(fake.calls)} calls")

    # What really happened with Groq: one output-limit 400 used up the rate limit, then several 429s
    errors = iter([Exception("Failed to generate JSON")] + [RateLimited() for _ in range(5)])
    with fake_groq(FakeGroq(error_for=lambda a: next(errors, None) if a == first else None)) as fake:
        s, _, _ = wait(client, scan())
        check("400 then 429s: recovers, still AI-written", fake.calls.count(first) == 7
              and s["reports"][0]["status"] == "ready" and s["reports"][0]["source"].startswith("Groq"),
              f"{fake.calls.count(first)} tries")

    with fake_groq(FakeGroq(error_for=lambda a: Exception("Failed to generate JSON") if a == first else None)) as fake:
        s, _, _ = wait(client, scan())
        check("other errors: 3 tries then template", fake.calls.count(first) == 3 and s["reports"][0]["status"] == "failed",
              f"{fake.calls.count(first)} tries")

    print("Invented numbers")

    def first_report(job_id):
        return client.get(f"/api/jobs/{job_id}/reports/{first}").json()

    with fake_groq(FakeGroq(wrong_number=lambda a, nth: a == first and nth == 1)) as fake:
        s, _, _ = wait(client, scan())
        j = first_report(s["job_id"])
        check("flagged number: one rewrite, clean report kept", fake.calls.count(first) == 2 and j["grounding"]["grounded"]
              and INVENTED not in json.dumps(j["narrative"]) and INVENTED not in j["markdown"],
              f"{fake.calls.count(first)} calls")
        check("rewrite names the bad number", len(fake.corrections) == 1 and INVENTED in fake.corrections[0])
        check("clean reports get no rewrite", len(fake.calls) == len(order) + 1, f"{len(fake.calls)} calls")

    with fake_groq(FakeGroq(wrong_number=lambda a, nth: a == first)) as fake:
        s, _, _ = wait(client, scan())
        j = first_report(s["job_id"])
        check("still wrong: no third try, warning stays", fake.calls.count(first) == 2 and s["reports"][0]["status"] == "ready"
              and j["grounding"]["unsupported_numbers"] == [INVENTED], f"{fake.calls.count(first)} calls")

    errors = iter([None, RateLimited("3600")])
    with fake_groq(FakeGroq(error_for=lambda a: next(errors, None) if a == first else None,
                            wrong_number=lambda a, nth: a == first)) as fake:
        s, _, _ = wait(client, scan())
        j = first_report(s["job_id"])
        check("rewrite fails: flagged AI report kept, no template", s["reports"][0]["status"] == "ready"
              and s["reports"][0]["source"].startswith("Groq") and j["grounding"]["unsupported_numbers"] == [INVENTED])

    real = reports.generate_report

    def crash(evidence, **kwargs):
        if evidence["attack_type"] == first:
            raise ValueError("boom")
        return real(evidence, **kwargs)

    reports.generate_report = crash
    with fake_groq(FakeGroq()):
        s, _, _ = wait(client, scan())
    reports.generate_report = real
    check("crash in one report: job survives", s["status"] == "done" and s["reports"][0]["status"] == "failed"
          and s["reports"][0]["source"] is None and all(r["status"] == "ready" for r in s["reports"][1:]))
    check("crashed report -> 409", code(s["job_id"], first, ".pdf") == 409)

    print("A new scan takes over Groq")
    with fake_groq(FakeGroq(gated=True)) as fake:
        old = scan()
        until(lambda: snap(old)["reports"] and snap(old)["reports"][0]["status"] == "generating")
        new = scan()
        fake.release(len(order) + 1)
        a, _, _ = wait(client, old)
        b, _, _ = wait(client, new)
        check("older scan finishes on templates", a["status"] == "done" and a["reports"][0]["status"] == "ready"
              and all(r["status"] == "failed" for r in a["reports"][1:]), a["warnings"])
        check("newer scan gets Groq", all(r["status"] == "ready" for r in b["reports"])
              and len(fake.calls) == len(order) + 1, f"{len(fake.calls)} calls")

    print("No threats")
    r = upload(client, "benign.csv", benign_csv)
    s, _, _ = wait(client, r.json()["job_id"])
    check("benign file finishes with no reports", s["status"] == "done" and s["results_ready"] and s["reports"] == []
          and s["counts"]["threats"] == 0, s["message"])
    check("/reports empty", client.get(f"/api/jobs/{s['job_id']}/reports").json()["reports"] == [])


def predictions(client, job_id):
    rows = client.get(f"/api/jobs/{job_id}/flows.csv", params={"scope": "all"}).text
    return pd.read_csv(io.StringIO(rows))[["row", "attack_type", "stage1_score"]]


def evaluation_mode(client):
    print("Evaluation mode: CSE-CIC-IDS2018 columns and the Label column")
    sample = pd.read_csv(SAMPLE_2018, low_memory=False)
    check("2018 sample has its original columns", "Dst Port" in sample.columns and "Label" in sample.columns)
    check("2018 sample under 5 MB", SAMPLE_2018.stat().st_size < 5_000_000, f"{SAMPLE_2018.stat().st_size / 1e6:.2f} MB")

    check("2018 sample endpoint removed", client.post("/api/analyze/sample/ids2018").status_code == 404)
    s, _, _ = wait(client, upload(client, SAMPLE_2018.name, SAMPLE_2018.read_bytes()).json()["job_id"])
    check("2018 sample scan", s["status"] == "done" and s["has_evaluation"], s["message"])
    e = client.get(f"/api/jobs/{s['job_id']}/evaluation").json()
    check("every row scored", e["rows"] == s["counts"]["rows_analysed"] and e["rows_excluded"] == 0, f"{e['rows']} rows")
    check("7 classes scored", [c["class"] for c in e["multiclass"]["per_class"]] ==
          ["BENIGN", "Bot", "DDoS", "DoS Hulk", "DoS Slowhttptest", "FTP-Patator", "SSH-Patator"])
    matrix = e["multiclass"]["confusion"]
    check("matrix shows all model classes", len(matrix["predicted"]) == 13 and sum(map(sum, matrix["matrix"])) == e["rows"])
    b = e["stage1"]
    check("binary counts add up", b["tp"] + b["fp"] + b["tn"] + b["fn"] == e["rows"])
    check("metrics are in range", all(0 <= b[k] <= 1 for k in ("accuracy", "precision", "recall", "f1", "fpr", "fnr", "roc_auc")))

    # Same rows, so the labels can't be what decides the predictions
    base = predictions(client, s["job_id"])
    no_label = sample.drop(columns="Label")
    r = upload(client, "2018_no_label.csv", no_label.to_csv(index=False).encode())
    s2, _, _ = wait(client, r.json()["job_id"])
    check("2018 names without Label accepted", s2["status"] == "done" and not s2["has_evaluation"])
    check("no Label: no evaluation", client.get(f"/api/jobs/{s2['job_id']}/evaluation").status_code == 404)
    check("removing labels changes no prediction", predictions(client, s2["job_id"]).equals(base))
    shuffled = sample.assign(Label=sample["Label"].sample(frac=1, random_state=1).to_numpy())
    s3, _, _ = wait(client, upload(client, "2018_shuffled.csv", shuffled.to_csv(index=False).encode()).json()["job_id"])
    check("shuffling labels changes no prediction", predictions(client, s3["job_id"]).equals(base))
    check("shuffling labels does change the score",
          client.get(f"/api/jobs/{s3['job_id']}/evaluation").json()["stage1"]["recall"] != b["recall"]
          or client.get(f"/api/jobs/{s3['job_id']}/evaluation").json()["multiclass"]["accuracy"] != e["multiclass"]["accuracy"])
    check("labels are not in the flow export", "Label" not in client.get(f"/api/jobs/{s['job_id']}/flows.csv").text.splitlines()[0])

    # Labels line up after cleaning drops a row, and the repeated header row is removed
    head = sample.head(300).astype({"Flow Duration": object})
    head.loc[0, "Flow Duration"] = "bad"
    stray = pd.DataFrame([dict(zip(head.columns, head.columns))])
    data = pd.concat([head, stray, sample.iloc[300:320]]).to_csv(index=False).encode()
    s4, _, _ = wait(client, upload(client, "2018_messy.csv", data).json()["job_id"])
    e4 = client.get(f"/api/jobs/{s4['job_id']}/evaluation").json()
    check("repeated header + bad row handled", s4["counts"]["rows_in"] == 320 and e4["rows"] == 319,
          f"{s4['counts']['rows_in']} in, {e4['rows']} scored")
    aligned = sample.drop(index=0).iloc[:299]
    alone, _, _ = wait(client, upload(client, "2018_clean.csv", pd.concat([aligned, sample.iloc[300:320]]).to_csv(index=False).encode()).json()["job_id"])
    e5 = client.get(f"/api/jobs/{alone['job_id']}/evaluation").json()
    check("labels stay aligned after a dropped row", e4["multiclass"]["confusion"]["matrix"] == e5["multiclass"]["confusion"]["matrix"])

    # 2017 names with 2017 labels, and labels the models have no class for
    demo = pd.read_csv(DEMO).head(40)
    tagged = demo.assign(Label=["BENIGN"] * 10 + ["Web Attack - XSS"] * 10 + ["DoS attacks-GoldenEye"] * 15 + [None] * 5)
    s6, _, _ = wait(client, upload(client, "2017_labelled.csv", tagged.to_csv(index=False).encode()).json()["job_id"])
    e6 = client.get(f"/api/jobs/{s6['job_id']}/evaluation").json()
    check("2017 names and labels scored", e6["rows"] == 20 and {c["class"] for c in e6["multiclass"]["per_class"]} == {"BENIGN", "Web Attack"})
    check("unknown labels reported, not guessed", e6["unmapped_labels"] == {"DoS attacks-GoldenEye": 15, "(blank)": 5}
          and any("GoldenEye" in w for w in s6["warnings"]), str(e6["unmapped_labels"]))
    unknown = demo.assign(Label="Nonsense")
    s7, _, _ = wait(client, upload(client, "unknown.csv", unknown.to_csv(index=False).encode()).json()["job_id"])
    e7 = client.get(f"/api/jobs/{s7['job_id']}/evaluation").json()
    check("only unknown labels: nothing scored, job fine", s7["status"] == "done" and e7["rows"] == 0 and e7["multiclass"] is None)
    only_benign = demo.assign(Label="BENIGN")
    s8, _, _ = wait(client, upload(client, "benign.csv", only_benign.to_csv(index=False).encode()).json()["job_id"])
    e8 = client.get(f"/api/jobs/{s8['job_id']}/evaluation").json()["stage1"]
    check("single class: undefined metrics are empty", e8["recall"] is None and e8["roc_auc"] is None and e8["fpr"] is not None)


def main():
    if not ONLINE:
        reports.groq_reachable = lambda timeout=2.0: False   # simulate offline demo
    print("Grounding check")
    ev = {"times_normal": 25500000}
    check("number after em dash accepted",
          grounding_check({"t": "microseconds—25,500,000 times"}, ev)["grounded"])
    check("invented number after em dash caught",
          grounding_check({"t": "microseconds—99 times"}, ev)["unsupported_numbers"] == ["99"])
    check("invented number after space caught",
          grounding_check({"t": "microseconds 99 times"}, ev)["unsupported_numbers"] == ["99"])
    check("invented IP caught",
          "10.0.0.5" in grounding_check({"t": "source—10.0.0.5"}, ev)["unsupported_numbers"])

    with TestClient(app) as client:
        print("Health")
        h = client.get("/api/health").json()
        check("health ok", h["status"] == "ok", f"{h['models']['stage1']} + {h['models']['stage2']}")
        check("32 required columns", len(h["required_columns"]) == 32)

        print("Bad uploads")
        demo = DEMO.read_bytes()
        r = upload(client, "flows.txt", demo)
        check("non-csv rejected", r.status_code == 400, r.json()["detail"]["message"])
        r = upload(client, "empty.csv", b"")
        check("empty rejected", r.status_code == 400, r.json()["detail"]["message"])
        r = upload(client, "junk.csv", b"a,b\n1,2\n")
        d = r.json()["detail"]
        check("missing columns rejected", r.status_code == 400 and len(d["missing_columns"]) == 32, d["message"])
        r = upload(client, "header.csv", demo.splitlines()[0] + b"\n")
        check("header-only rejected", r.status_code == 400, r.json()["detail"]["message"])
        bad = pd.read_csv(DEMO).head(20)
        bad["Flow Duration"] = "not-a-number"
        r = upload(client, "invalid.csv", bad.to_csv(index=False).encode())
        s, _, _ = wait(client, r.json()["job_id"])
        check("all-invalid rows -> job error", s["status"] == "error" and s["stages"]["preprocess"]["status"] == "error",
              s["error"])
        check("unknown job 404", client.get("/api/jobs/nope").status_code == 404)

        print("Demo analysis" + (" (online Groq)" if ONLINE else " (offline, template reports)"))
        r = upload(client, DEMO.name, demo)
        job_id = r.json()["job_id"]
        early = client.get(f"/api/jobs/{job_id}/results")
        s, seen, secs = wait(client, job_id)
        check("job done", s["status"] == "done", f"{secs:.1f}s, stages seen {seen}")
        check("percent 100", s["percent"] == 100, s["percent"])
        check("stage timings", all(v["status"] == "done" for v in s["stages"].values()),
              {k: v["seconds"] for k, v in s["stages"].items()})
        check("results before finish -> 409 or done", early.status_code in (409, 200))
        print("   warnings:", s["warnings"])

        # Results must match a plain pipe.predict() over the whole file
        pipe = state["pipeline"]
        expected = pipe.predict(pd.read_csv(DEMO))
        job = state["jobs"].get(job_id)
        same = (job.results["attack_type"].values == expected["attack_type"].values).all() and \
               (job.results["needs_review"].values == expected["needs_review"].values).all()
        check("chunked results == full predict()", bool(same))
        check("live counts match", s["counts"]["threats"] == int(expected["is_threat"].sum())
              and s["counts"]["suspicious"] == int(expected["suspicious"].sum()),
              f"suspicious={s['counts']['suspicious']} threats={s['counts']['threats']}")

        res = client.get(f"/api/jobs/{job_id}/results").json()
        k = res["kpis"]
        check("KPIs", k["total_flows"] == len(expected) and k["threats"] == int(expected["is_threat"].sum()), k)
        check("risk counts sum", sum(res["risk_counts"].values()) == k["total_flows"], res["risk_counts"])
        check("attack counts", sum(a["count"] for a in res["attack_counts"]) == k["threats"],
              f"{len(res['attack_counts'])} types")
        check("confidence histogram", sum(res["confidence_histogram"]["counts"]) == int(expected["confidence"].notna().sum()))
        check("default page = threats", res["flows"]["total"] == k["threats"] and len(res["flows"]["rows"]) == 50)

        q = client.get(f"/api/jobs/{job_id}/results",
                       params={"attack_type": "DDoS", "risk": "Critical", "size": 10}).json()["flows"]
        check("filter attack+risk", all(r["attack_type"] == "DDoS" and r["risk_level"] == "Critical" for r in q["rows"]),
              f"{q['total']} rows")
        q = client.get(f"/api/jobs/{job_id}/results", params={"needs_review": "true", "size": 500}).json()["flows"]
        check("filter needs_review", all(r["needs_review"] for r in q["rows"]), f"{q['total']} rows")
        q = client.get(f"/api/jobs/{job_id}/results", params={"sort": "confidence", "order": "desc", "size": 5}).json()["flows"]
        confs = [r["confidence"] for r in q["rows"]]
        check("sort confidence desc", confs == sorted(confs, reverse=True), confs)
        q = client.get(f"/api/jobs/{job_id}/results", params={"scope": "all", "page": 999}).json()["flows"]
        check("scope all + page clamp", q["total"] == k["total_flows"] and q["page"] == q["pages"])

        r = client.get(f"/api/jobs/{job_id}/flows.csv", params={"attack_type": "PortScan"})
        csv = pd.read_csv(io.StringIO(r.text))
        check("CSV export", r.status_code == 200 and (csv["attack_type"] == "PortScan").all(), f"{len(csv)} rows")
        row = int(csv["row"].iloc[0])
        f = client.get(f"/api/jobs/{job_id}/flows/{row}").json()
        check("flow detail", len(f["features"]) == 32 and f["attack_type"] == "PortScan")

        print("Threat analysis")
        cards = client.get(f"/api/jobs/{job_id}/analysis").json()["attacks"]
        check("attack cards", len(cards) == len(res["attack_counts"]), [c["attack_type"] for c in cards])
        for c in cards:
            a = client.get(f"/api/jobs/{job_id}/analysis/{c['attack_type']}").json()
            ok = a["count"] == c["count"] and len(a["feature_comparison"]) == 32 and a["stage1_histogram"]
            check(f"analysis {c['attack_type']}", bool(ok), f"defaults={a['default_features'][:3]}")
        check("analysis BENIGN 404", client.get(f"/api/jobs/{job_id}/analysis/BENIGN").status_code == 404)

        print("Incident reports")
        rl = client.get(f"/api/jobs/{job_id}/reports").json()["reports"]
        check("one report per attack type", len(rl) == len(cards), [r["source"] for r in rl][:2])
        if not ONLINE:
            check("offline: template counts as ready, not failed",
                  all(r["status"] == "ready" and r["source"].startswith("template") for r in rl))
        for r in rl:
            a = r["attack_type"]
            j = client.get(f"/api/jobs/{job_id}/reports/{a}").json()
            pdf = client.get(f"/api/jobs/{job_id}/reports/{a}.pdf")
            txt = client.get(f"/api/jobs/{job_id}/reports/{a}.txt")
            ok = (j["markdown"].startswith("# ") and pdf.content[:4] == b"%PDF"
                  and "CYBERSENTRY INCIDENT REPORT" in txt.text
                  and "attachment" in pdf.headers["content-disposition"])
            check(f"report {a}", ok, f"{j['incident_id']}, grounded={j['grounding']['grounded']}, "
                                     f"pdf={len(pdf.content) // 1024}KB")
        check("unknown report 404", client.get(f"/api/jobs/{job_id}/reports/Nope.pdf").status_code == 404)
        check("unknown API 404", client.get("/api/whatever").status_code == 404)

        benign = expected.loc[~expected["is_threat"], pipe.required_features]
        background_reports(client, demo, benign.to_csv(index=False).encode())

        print("Sample endpoint + frontend fallback")
        r = client.post("/api/analyze/sample")
        s, _, secs = wait(client, r.json()["job_id"])
        check("sample job", s["status"] == "done", f"{secs:.1f}s")
        check("demo dataset has no Label, so no evaluation", not s["has_evaluation"]
              and client.get(f"/api/jobs/{s['job_id']}/evaluation").status_code == 404)
        check("/ responds", client.get("/").status_code == 200)

        evaluation_mode(client)

    print(f"\n{'ALL PASSED' if not failures else f'{len(failures)} FAILED: {failures}'}")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
