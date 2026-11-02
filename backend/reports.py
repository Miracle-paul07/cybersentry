"""Incident reports: evidence -> Groq (or template fallback) -> markdown / PDF / TXT."""
import os
import socket

from genai_report import GENERIC_KB, KB, build_evidence, generate_report
from report_export import report_to_pdf, report_to_txt

GROQ_HOST = ("api.groq.com", 443)
SEVERITY_RANK = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
# After this many attack types in a row use up their retries, Groq is treated as down.
# Otherwise 12 types could each spend minutes waiting on it.
MAX_FAILURES_IN_A_ROW = 2
llm_client = None   # None = a real Groq client. The tests put a fake one here.


def groq_reachable(timeout=2.0):
    """Quick connectivity check so offline demos skip Groq's retry sleeps."""
    try:
        with socket.create_connection(GROQ_HOST, timeout=timeout):
            return True
    except OSError:
        return False


def severity_of(attack):
    return KB.get(attack, GENERIC_KB)["severity"]


def report_order(results):
    """Detected attack types (BENIGN skipped) as (type, flows), most severe first, then most flows."""
    counts = results.loc[results["is_threat"], "attack_type"].value_counts()
    return sorted(((attack, int(count)) for attack, count in counts.items()),
                  key=lambda item: (SEVERITY_RANK.get(severity_of(item[0]), len(SEVERITY_RANK)), -item[1]))


def llm_available():
    """(can Groq be used, warning to show if not)"""
    if not os.environ.get("GROQ_API_KEY"):
        return False, "GROQ_API_KEY is not set, so template reports were generated instead of AI-written ones."
    if not groq_reachable():
        return False, ("The Groq API could not be reached (offline?), so template reports "
                       "were generated instead of AI-written ones.")
    return True, None


def write_report(attack, results, baseline, use_llm):
    """One attack type's report. generate_report already falls back to the template if Groq fails."""
    flows = results.loc[results["attack_type"] == attack]
    evidence = build_evidence(flows, attack, baseline, len(results))
    try:
        markdown, narrative, check, source = generate_report(evidence, use_llm=use_llm, client=llm_client)
    except Exception:
        markdown, narrative, check, source = generate_report(evidence, use_llm=False)
    return {
        "attack_type": attack,
        "markdown": markdown,
        "narrative": narrative,
        "grounding": check,
        "evidence": evidence,
        "incident_id": evidence["incident_id"],
        "severity": evidence["severity"],
        "source": source,
    }


def generate_reports(attack_types, results, baseline, on_state, on_warning, cancelled=lambda: False):
    """
    Write the reports one at a time, in the order given. A type whose AI report can't be
    written gets the template report and the state "failed"; nothing here stops the run.

    on_state(attack, status, report=None) reports each change: generating / ready / failed.
    on_warning(text) is for notices to show the user.
    cancelled() turning true stops Groq calls, so a newer scan gets the rate limit.
    """
    wanted_llm, warning = llm_available()
    if warning:
        on_warning(warning)
    use_llm = wanted_llm
    failures_in_a_row = 0

    for attack in attack_types:
        if use_llm and cancelled():
            use_llm = False
            on_warning("A newer scan started, so this scan's remaining reports use the template.")
        on_state(attack, "generating")
        try:
            report = write_report(attack, results, baseline, use_llm)
        except Exception as e:
            print(f"[reports] could not write the {attack} report: {e}", flush=True)
            report = None
        # With no key or no internet, a template report is expected, not a failure
        failed = report is None or (wanted_llm and report["source"].startswith("template"))
        if failed and use_llm:
            on_warning("Some AI reports could not be written, so those attack types use the template report.")
        failures_in_a_row = failures_in_a_row + 1 if failed else 0
        if use_llm and failures_in_a_row >= MAX_FAILURES_IN_A_ROW:
            use_llm = False
            on_warning("Groq kept failing, so the remaining reports use the template.")
        on_state(attack, "failed" if failed else "ready", report)


def export(report, fmt):
    """PDF or TXT bytes for one report, using the Streamlit app's exporter."""
    args = (report["markdown"], report["incident_id"], report["severity"], report["attack_type"])
    if fmt == "pdf":
        return report_to_pdf(*args)
    return report_to_txt(*args).encode("utf-8")
