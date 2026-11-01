"""Incident reports: evidence -> Groq (or template fallback) -> markdown / PDF / TXT."""
import os
import socket

from genai_report import build_evidence, generate_report
from report_export import report_to_pdf, report_to_txt

GROQ_HOST = ("api.groq.com", 443)


def groq_reachable(timeout=2.0):
    """Quick connectivity check so offline demos skip Groq's retry sleeps."""
    try:
        with socket.create_connection(GROQ_HOST, timeout=timeout):
            return True
    except OSError:
        return False


def generate_reports(results, baseline, progress=None):
    """
    One incident report per detected attack type (BENIGN skipped), same rules as
    app/backend.py. Falls back to the template report when Groq is unavailable.
    Returns (reports dict, list of warning strings).
    """
    attack_types = results.loc[results["is_threat"], "attack_type"].value_counts().index.tolist()
    use_llm = bool(os.environ.get("GROQ_API_KEY"))
    warnings = []
    if not use_llm:
        warnings.append("GROQ_API_KEY is not set, so template reports were generated "
                        "instead of AI-written ones.")
    elif attack_types and not groq_reachable():
        use_llm = False
        warnings.append("The Groq API could not be reached (offline?), so template reports "
                        "were generated instead of AI-written ones.")

    reports = {}
    for i, attack in enumerate(attack_types):
        if progress:
            progress(i, len(attack_types), attack)
        flows = results.loc[results["attack_type"] == attack]
        evidence = build_evidence(flows, attack, baseline, len(results))
        try:
            markdown, narrative, check, source = generate_report(evidence, use_llm=use_llm)
        except Exception:
            markdown, narrative, check, source = generate_report(evidence, use_llm=False)
        if use_llm and source.startswith("template"):
            warnings.append(f"The AI report for {attack} failed, so a template report "
                            "is shown instead.")
        reports[attack] = {
            "attack_type": attack,
            "markdown": markdown,
            "narrative": narrative,
            "grounding": check,
            "evidence": evidence,
            "incident_id": evidence["incident_id"],
            "severity": evidence["severity"],
            "source": source,
        }
    if progress:
        progress(len(attack_types), len(attack_types), None)
    return reports, warnings


def export(report, fmt):
    """PDF or TXT bytes for one report, using the Streamlit app's exporter."""
    args = (report["markdown"], report["incident_id"], report["severity"], report["attack_type"])
    if fmt == "pdf":
        return report_to_pdf(*args)
    return report_to_txt(*args).encode("utf-8")
