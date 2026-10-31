
"""Convert Markdown incident reports into downloadable PDF and plain-text files."""
import re

from fpdf import FPDF
from fpdf.enums import XPos, YPos


# Common non-latin-1 characters the LLM may write; anything else becomes "?"
_REPLACEMENTS = {
    "\u2010": "-", "\u2011": "-", "\u2012": "-", "\u2013": "-", "\u2014": "-", "\u2212": "-",
    "\u2018": "'", "\u2019": "'", "\u201a": "'", "\u201c": '"', "\u201d": '"', "\u201e": '"',
    "\u2026": "...", "\u2022": "-", "\u00a0": " ", "\u2009": " ", "\u202f": " ",
    "\u2192": "->", "\u2190": "<-", "\u2194": "<->", "\u21d2": "=>",
    "\u2264": "<=", "\u2265": ">=", "\u2260": "!=", "\u2248": "~",
    "\u2713": "v", "\u2714": "v", "\u2717": "x", "\u2718": "x",
}

_SEVERITY_COLORS = {
    "Low": (16, 185, 129),
    "Medium": (245, 158, 11),
    "High": (249, 115, 22),
    "Critical": (239, 68, 68),
}


def to_latin1(text):
    """Make text safe for the PDF core fonts, which only support latin-1."""
    for bad, good in _REPLACEMENTS.items():
        text = text.replace(bad, good)
    return text.encode("latin-1", errors="replace").decode("latin-1")


def strip_inline(text):
    """Remove Markdown emphasis and code markers."""
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"(?<!\w)\*(.+?)\*(?!\w)", r"\1", text)
    text = re.sub(r"(?<!\w)_(.+?)_(?!\w)", r"\1", text)
    return text.replace("`", "")


def _table_cells(line):
    return [strip_inline(c.strip()) for c in line.strip().strip("|").split("|")]


def _is_separator(line):
    return bool(re.fullmatch(r"\|?[\s:\-|]+\|?", line.strip())) and "-" in line


def parse_markdown(markdown):
    """Split a report into blocks: (kind, payload)."""
    blocks = []
    table = []
    for raw in markdown.splitlines():
        line = raw.rstrip()
        if line.strip().startswith("|"):
            if not _is_separator(line):
                table.append(_table_cells(line))
            continue
        if table:
            blocks.append(("table", table))
            table = []

        stripped = line.strip()
        if not stripped:
            blocks.append(("blank", None))
        elif stripped == "---":
            blocks.append(("rule", None))
        elif stripped.startswith("# "):
            blocks.append(("title", strip_inline(stripped[2:])))
        elif stripped.startswith("## ") or stripped.startswith("### "):
            blocks.append(("heading", strip_inline(stripped.lstrip("#").strip())))
        elif re.match(r"^[-*] ", stripped):
            blocks.append(("bullet", strip_inline(stripped[2:])))
        elif re.match(r"^\d+\. ", stripped):
            number, text = stripped.split(". ", 1)
            blocks.append(("numbered", (number, strip_inline(text))))
        else:
            blocks.append(("text", strip_inline(stripped)))
    if table:
        blocks.append(("table", table))
    return blocks


class _ReportPDF(FPDF):
    def footer(self):
        self.set_y(-12)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 8, f"CyberSentry incident report - page {self.page_no()}", align="C")


def report_to_pdf(markdown, incident_id, severity, attack_type):
    """Render a Markdown report as PDF bytes."""
    pdf = _ReportPDF(format="A4")
    pdf.set_auto_page_break(auto=True, margin=16)
    pdf.set_margins(18, 18, 18)
    pdf.add_page()

    def write(text, size=10, style="", color=(30, 30, 30), height=5.5, indent=0):
        pdf.set_font("Helvetica", style, size)
        pdf.set_text_color(*color)
        pdf.set_x(pdf.l_margin + indent)
        pdf.multi_cell(
            pdf.epw - indent, height, to_latin1(text),
            new_x=XPos.LMARGIN, new_y=YPos.NEXT,
        )

    # Header block
    write("CyberSentry Incident Report", size=18, style="B", color=(15, 23, 42), height=9)
    write(f"Incident ID: {incident_id}", size=10, color=(70, 70, 70))
    write(f"Attack type: {attack_type}", size=10, color=(70, 70, 70))
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_fill_color(*_SEVERITY_COLORS.get(severity, (100, 116, 139)))
    pdf.set_text_color(255, 255, 255)
    pdf.cell(
        pdf.get_string_width(f"Severity: {severity}") + 8, 7,
        to_latin1(f"Severity: {severity}"), fill=True,
        new_x=XPos.LMARGIN, new_y=YPos.NEXT,
    )
    pdf.ln(3)
    pdf.set_draw_color(200, 200, 200)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    pdf.ln(3)

    for kind, payload in parse_markdown(markdown):
        if kind == "title":
            write(payload, size=14, style="B", color=(15, 23, 42), height=7)
            pdf.ln(1)
        elif kind == "heading":
            pdf.ln(2)
            write(payload, size=12, style="B", color=(30, 64, 175), height=7)
        elif kind == "text":
            write(payload)
        elif kind == "bullet":
            pdf.set_fill_color(60, 60, 60)
            pdf.circle(pdf.l_margin + 2.5, pdf.get_y() + 2.75, 0.8, style="F")
            write(payload, indent=6)
        elif kind == "numbered":
            number, text = payload
            pdf.set_font("Helvetica", "B", 10)
            pdf.set_text_color(30, 30, 30)
            pdf.cell(6, 5.5, f"{number}.")
            write(text, indent=6)
        elif kind == "table":
            pdf.ln(1)
            pdf.set_font("Helvetica", "", 8)
            pdf.set_text_color(30, 30, 30)
            pdf.set_fill_color(255, 255, 255)
            with pdf.table(
                line_height=4.5,
                first_row_as_headings=True,
                headings_style=_heading_style(),
            ) as table:
                for row in payload:
                    table_row = table.row()
                    for cell in row:
                        table_row.cell(to_latin1(cell))
            pdf.ln(1)
        elif kind == "rule":
            pdf.ln(2)
            pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
            pdf.ln(2)
        elif kind == "blank":
            pdf.ln(1.5)

    return bytes(pdf.output())


def _heading_style():
    from fpdf.fonts import FontFace
    return FontFace(emphasis="BOLD", fill_color=(226, 232, 240))


def report_to_txt(markdown, incident_id, severity, attack_type):
    """Render a Markdown report as readable plain text."""
    lines = [
        "CYBERSENTRY INCIDENT REPORT",
        "=" * 60,
        f"Incident ID : {incident_id}",
        f"Attack type : {attack_type}",
        f"Severity    : {severity}",
        "=" * 60,
        "",
    ]
    for kind, payload in parse_markdown(markdown):
        if kind == "title":
            lines += [payload.upper(), ""]
        elif kind == "heading":
            if lines[-1] != "":
                lines.append("")
            lines += [payload.upper(), "-" * len(payload)]
        elif kind == "text":
            lines.append(payload)
        elif kind == "bullet":
            lines.append(f"  * {payload}")
        elif kind == "numbered":
            lines.append(f"  {payload[0]}. {payload[1]}")
        elif kind == "table":
            widths = [max(len(row[i]) for row in payload if i < len(row))
                      for i in range(len(payload[0]))]
            for n, row in enumerate(payload):
                lines.append("  " + " | ".join(c.ljust(w) for c, w in zip(row, widths)))
                if n == 0:
                    lines.append("  " + "-+-".join("-" * w for w in widths))
        elif kind == "rule":
            lines.append("-" * 60)
        elif kind == "blank":
            if lines[-1] != "":
                lines.append("")
    return "\n".join(lines).strip() + "\n"
