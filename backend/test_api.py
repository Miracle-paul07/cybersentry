"""
End-to-end API test with the demo CSV.

    python -m backend.test_api            # template reports (Groq disabled)
    python -m backend.test_api --online   # real Groq calls if GROQ_API_KEY is set
"""
import io
import sys
import time

import pandas as pd
from fastapi.testclient import TestClient

from . import PROJECT_ROOT, reports
from .main import app, state

from genai_report import grounding_check  # noqa: E402  (src/ on sys.path via backend/__init__.py)

ONLINE = "--online" in sys.argv
DEMO = PROJECT_ROOT / "app" / "sample_data" / "demo_flows.csv"
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

        print("Sample endpoint + frontend fallback")
        r = client.post("/api/analyze/sample")
        s, _, secs = wait(client, r.json()["job_id"])
        check("sample job", s["status"] == "done", f"{secs:.1f}s")
        check("/ responds", client.get("/").status_code == 200)

    print(f"\n{'ALL PASSED' if not failures else f'{len(failures)} FAILED: {failures}'}")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
