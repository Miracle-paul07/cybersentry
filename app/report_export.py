
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


# The report's own line of incident details. The PDF and TXT headers show these already.
_GENERATED = re.compile(r"\*\*Generated:\*\*\s*([^|]+?)\s*(?:\||$)")


def _generated_at(blocks):
    for kind, payload in blocks:
        if kind == "meta" and payload:
            return payload.group(1)
    return None


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
        if stripped.startswith("**Incident ID:**"):
            blocks.append(("meta", _GENERATED.search(stripped)))
        elif not stripped:
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


def _sections(blocks):
    """Group blocks so each heading (or closing rule) stays with what follows it."""
    sections = [[]]
    for block in blocks:
        if block[0] in ("heading", "rule"):
            sections.append([])
        sections[-1].append(block)
    return sections


def _write(doc, text, size=10, style="", color=(30, 30, 30), height=5.5, indent=0):
    doc.set_font("Helvetica", style, size)
    doc.set_text_color(*color)
    doc.set_x(doc.l_margin + indent)
    doc.multi_cell(
        doc.epw - indent, height, to_latin1(text),
        new_x=XPos.LMARGIN, new_y=YPos.NEXT,
    )


def _render_section(doc, section):
    for kind, payload in section:
        if kind == "title":
            _write(doc, payload, size=14, style="B", color=(15, 23, 42), height=7)
            doc.ln(1)
        elif kind == "heading":
            doc.ln(2)
            _write(doc, payload, size=12, style="B", color=(30, 64, 175), height=7)
        elif kind == "text":
            _write(doc, payload)
        elif kind == "bullet":
            doc.set_fill_color(60, 60, 60)
            doc.circle(doc.l_margin + 2.5, doc.get_y() + 2.75, 0.8, style="F")
            _write(doc, payload, indent=6)
        elif kind == "numbered":
            number, text = payload
            doc.set_font("Helvetica", "B", 10)
            doc.set_text_color(30, 30, 30)
            doc.cell(6, 5.5, f"{number}.")
            _write(doc, text, indent=6)
        elif kind == "table":
            doc.ln(1)
            doc.set_font("Helvetica", "", 8)
            doc.set_text_color(30, 30, 30)
            doc.set_fill_color(255, 255, 255)
            with doc.table(
                line_height=4.5,
                first_row_as_headings=True,
                headings_style=_heading_style(),
            ) as table:
                for row in payload:
                    table_row = table.row()
                    for cell in row:
                        table_row.cell(to_latin1(cell))
            doc.ln(1)
        elif kind == "rule":
            doc.ln(2)
            doc.line(doc.l_margin, doc.get_y(), doc.w - doc.r_margin, doc.get_y())
            doc.ln(2)
        elif kind == "blank":
            doc.ln(1.5)


def report_to_pdf(markdown, incident_id, severity, attack_type):
    """Render a Markdown report as PDF bytes."""
    pdf = _ReportPDF(format="A4")
    pdf.set_auto_page_break(auto=True, margin=16)
    pdf.set_margins(18, 18, 18)
    pdf.add_page()
    blocks = parse_markdown(markdown)

    # Header block
    _write(pdf, "CyberSentry Incident Report", size=18, style="B", color=(15, 23, 42), height=9)
    _write(pdf, f"Incident ID: {incident_id}", color=(70, 70, 70))
    _write(pdf, f"Attack type: {attack_type}", color=(70, 70, 70))
    generated = _generated_at(blocks)
    if generated:
        _write(pdf, f"Generated: {generated}", color=(70, 70, 70))
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

    for section in _sections(blocks):
        # Trial run: a section that would cross a page moves to the next page whole.
        # One already at the top of a page is longer than a page, so it just flows.
        with pdf.offset_rendering() as trial:
            _render_section(trial, section)
        if trial.page_break_triggered and pdf.get_y() > pdf.t_margin:
            pdf.add_page()
        _render_section(pdf, section)

    return bytes(pdf.output())


def _heading_style():
    from fpdf.fonts import FontFace
    return FontFace(emphasis="BOLD", fill_color=(226, 232, 240))


def report_to_txt(markdown, incident_id, severity, attack_type):
    """Render a Markdown report as readable plain text."""
    blocks = parse_markdown(markdown)
    generated = _generated_at(blocks)
    lines = [
        "CYBERSENTRY INCIDENT REPORT",
        "=" * 60,
        f"Incident ID : {incident_id}",
        f"Attack type : {attack_type}",
        f"Severity    : {severity}",
        *([f"Generated   : {generated}"] if generated else []),
        "=" * 60,
        "",
    ]
    for kind, payload in blocks:
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
