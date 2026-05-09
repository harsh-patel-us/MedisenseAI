"""
pdf_export.py — PDF generation for SOAP notes (doctor) and patient health guides
Uses ReportLab.
"""
import io
import logging
import os
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)


# ── Unicode font registration ────────────────────────────────────────────
# ReportLab ships only Latin fonts (Helvetica, Times-Roman, Courier). For
# Indic / Arabic scripts we have to register a TrueType font that covers
# the relevant glyphs. We register a *family* (regular + bold) so that
# `<b>...</b>` tags inside Paragraph text resolve to a real bold variant.
#
# Priority order:
#   1. Project-relative `backend/fonts/` bundle (Noto / DejaVu).
#   2. Multi-script Indic font shipped with Windows (Nirmala UI .ttc).
#   3. Other Windows / macOS / Linux multi-script fallbacks.
# If nothing works we keep using Helvetica and warn — text in Devanagari,
# Bengali, Tamil, etc. would then render as missing-glyph boxes/empty
# strings, which was the bug that motivated this rewrite.

_UNICODE_FONT_NAME = "MediSenseUnicode"
_UNICODE_FONT_BOLD_NAME = "MediSenseUnicode-Bold"
_UNICODE_FONT_REGISTERED: bool | None = None  # tri-state: None = not tried yet

# Each candidate is (regular_path, bold_path | None,
#                    regular_subfont_index | None, bold_subfont_index | None).
# The subfont indices are only used for `.ttc` collections — None means
# treat as a plain `.ttf`.
_FONT_CANDIDATES: list[tuple[Path, Path | None, int | None, int | None]] = [
    # ── Project-bundled (preferred — guaranteed Indic + Latin coverage) ──
    (
        Path(__file__).resolve().parent.parent / "fonts" / "NotoSans-Regular.ttf",
        Path(__file__).resolve().parent.parent / "fonts" / "NotoSans-Bold.ttf",
        None, None,
    ),
    (
        Path(__file__).resolve().parent.parent / "fonts" / "DejaVuSans.ttf",
        Path(__file__).resolve().parent.parent / "fonts" / "DejaVuSans-Bold.ttf",
        None, None,
    ),
    # ── Linux distro paths ──
    (
        Path("/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf"),
        Path("/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf"),
        None, None,
    ),
    (
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        None, None,
    ),
    # ── Windows: Nirmala UI is Microsoft's pan-Indic font (Win 8+) ──
    # Covers Devanagari, Bengali, Tamil, Telugu, Kannada, Malayalam,
    # Gurmukhi, Gujarati, Oriya — exactly the scripts we localize into.
    # Ships as a `.ttc` collection on most installs; we read subfont 0.
    (
        Path(r"C:\Windows\Fonts\Nirmala.ttf"),
        Path(r"C:\Windows\Fonts\NirmalaB.ttf"),
        None, None,
    ),
    (
        Path(r"C:\Windows\Fonts\Nirmala.ttc"),
        Path(r"C:\Windows\Fonts\Nirmala.ttc"),
        0, 1,
    ),
    # ── Windows: Arial Unicode MS (ships with MS Office) ──
    (
        Path(r"C:\Windows\Fonts\arialuni.ttf"),
        None, None, None,
    ),
    # ── Windows: Segoe UI (decent Indic + Arabic + Latin coverage) ──
    (
        Path(r"C:\Windows\Fonts\segoeui.ttf"),
        Path(r"C:\Windows\Fonts\segoeuib.ttf"),
        None, None,
    ),
    # ── Windows: Microsoft Sans Serif (broad Unicode, weak Indic) ──
    (
        Path(r"C:\Windows\Fonts\micross.ttf"),
        None, None, None,
    ),
    # ── Windows: Arial (last-ditch — limited Indic but better than blanks) ──
    (
        Path(r"C:\Windows\Fonts\arial.ttf"),
        Path(r"C:\Windows\Fonts\arialbd.ttf"),
        None, None,
    ),
    # ── macOS ──
    (
        Path("/Library/Fonts/Arial Unicode.ttf"),
        None, None, None,
    ),
    (
        Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf"),
        None, None, None,
    ),
]


def _ensure_unicode_font() -> str:
    """Register a Unicode-capable TTF *family* (regular + bold) the first
    time we need one and wire `<b>` tag mapping so HTML-style bold inside
    Paragraph text resolves to the real bold face.

    Returns the family name to use as `fontName=` on ParagraphStyle (and as
    the FONTNAME entry in TableStyle), or "Helvetica" if no candidate was
    found. Idempotent; safe to call from multiple PDF generators.
    """
    global _UNICODE_FONT_REGISTERED
    if _UNICODE_FONT_REGISTERED:
        return _UNICODE_FONT_NAME
    if _UNICODE_FONT_REGISTERED is False:
        return "Helvetica"

    try:
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
        from reportlab.lib.fonts import addMapping
    except Exception:
        _UNICODE_FONT_REGISTERED = False
        return "Helvetica"

    def _make_ttfont(name: str, path: Path, subfont: int | None) -> TTFont:
        if subfont is not None:
            return TTFont(name, str(path), subfontIndex=subfont)
        return TTFont(name, str(path))

    for reg_path, bold_path, reg_idx, bold_idx in _FONT_CANDIDATES:
        try:
            if not reg_path.exists():
                continue
            pdfmetrics.registerFont(_make_ttfont(_UNICODE_FONT_NAME, reg_path, reg_idx))

            # Register a bold variant. If we don't have a real bold TTF for
            # this candidate, alias the regular face under the bold name so
            # `<b>` tags don't drop the run silently.
            if bold_path and bold_path.exists():
                try:
                    pdfmetrics.registerFont(
                        _make_ttfont(_UNICODE_FONT_BOLD_NAME, bold_path, bold_idx)
                    )
                except Exception:
                    pdfmetrics.registerFont(
                        _make_ttfont(_UNICODE_FONT_BOLD_NAME, reg_path, reg_idx)
                    )
            else:
                pdfmetrics.registerFont(
                    _make_ttfont(_UNICODE_FONT_BOLD_NAME, reg_path, reg_idx)
                )

            # Tell ReportLab how to resolve <b>/<i> inside Paragraph text.
            addMapping(_UNICODE_FONT_NAME, 0, 0, _UNICODE_FONT_NAME)        # regular
            addMapping(_UNICODE_FONT_NAME, 1, 0, _UNICODE_FONT_BOLD_NAME)   # bold
            addMapping(_UNICODE_FONT_NAME, 0, 1, _UNICODE_FONT_NAME)        # italic → reg
            addMapping(_UNICODE_FONT_NAME, 1, 1, _UNICODE_FONT_BOLD_NAME)   # bold-italic

            logger.info(
                f"Registered Unicode PDF font family from {reg_path}"
                f" (bold: {bold_path if bold_path and bold_path.exists() else 'aliased to regular'})"
            )
            _UNICODE_FONT_REGISTERED = True
            return _UNICODE_FONT_NAME
        except Exception as exc:
            logger.debug(f"Skipping font candidate {reg_path}: {exc}")
            continue

    logger.warning(
        "No Unicode-capable TTF font found — non-English PDF text may render "
        "as missing-glyph boxes. Drop a TTF (e.g. NotoSans-Regular.ttf) into "
        "backend/fonts/ to fix this for production."
    )
    _UNICODE_FONT_REGISTERED = False
    return "Helvetica"


def _bold_font_for(family: str) -> str:
    """Return the matching bold face name for a registered family.

    For the registered Unicode family we have an explicit "-Bold" variant.
    For Helvetica (the fallback) ReportLab knows the built-in name.
    """
    if family == _UNICODE_FONT_NAME:
        return _UNICODE_FONT_BOLD_NAME
    return f"{family}-Bold"


# RTL-script codes where ReportLab's left-to-right layout is known to be
# imperfect. We still render the text but warn the patient on the PDF.
_RTL_LANGUAGE_CODES = {"ur", "ar", "he", "fa"}

# ── Colours & branding ─────────────────────────────────────────────────────
BRAND_BLUE = (0.09, 0.35, 0.69)       # #1759B0
BRAND_TEAL = (0.02, 0.68, 0.71)       # #05AEBB
DANGER_RED  = (0.84, 0.18, 0.18)      # #D72E2E
WARN_AMBER  = (0.95, 0.60, 0.07)      # #F29912
OK_GREEN    = (0.13, 0.64, 0.34)      # #21A257
LIGHT_GREY  = (0.95, 0.95, 0.97)
WHITE       = (1, 1, 1)
DARK        = (0.1, 0.1, 0.15)

DISCLAIMER = (
    "⚠ IMPORTANT DISCLAIMER: This information is AI-generated and is for educational "
    "purposes only. It is NOT a substitute for professional medical advice, diagnosis, "
    "or treatment. Always consult a qualified healthcare provider before making any health "
    "decisions. If you are experiencing a medical emergency, call emergency services immediately."
)


def _set_font(canvas, name="Helvetica", size=10, bold=False):
    try:
        canvas.setFont(f"{name}-Bold" if bold else name, size)
    except Exception:
        canvas.setFont("Helvetica", size)


def generate_soap_pdf(soap_note: dict, patient_name: str = "Anonymous Patient",
                      doctor_name: str = "Attending Physician",
                      session_id: str | None = None) -> bytes:
    """Generate a branded SOAP clinical note PDF."""
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib import colors
        from reportlab.lib.units import cm
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
        )
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.enums import TA_LEFT, TA_CENTER

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer, pagesize=A4,
            rightMargin=2*cm, leftMargin=2*cm, topMargin=2*cm, bottomMargin=2*cm
        )
        styles = getSampleStyleSheet()
        elements = []

        # ── Header ──
        header_style = ParagraphStyle("header", parent=styles["Title"],
                                       textColor=colors.HexColor("#1759B0"), fontSize=22, spaceAfter=4)
        sub_style = ParagraphStyle("sub", parent=styles["Normal"],
                                    textColor=colors.HexColor("#05AEBB"), fontSize=11, spaceAfter=2)
        elements.append(Paragraph("MediSense AI", header_style))
        elements.append(Paragraph("Clinical SOAP Note", sub_style))
        elements.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor("#1759B0")))
        elements.append(Spacer(1, 0.3*cm))

        # ── Meta info ──
        meta = [
            ["Patient:", patient_name, "Doctor:", doctor_name],
            ["Date:", datetime.now().strftime("%d %B %Y, %H:%M"), "Session ID:", session_id or "—"],
        ]
        meta_table = Table(meta, colWidths=[2.5*cm, 7*cm, 2.5*cm, 5.5*cm])
        meta_table.setStyle(TableStyle([
            ("FONTNAME", (0,0), (-1,-1), "Helvetica"),
            ("FONTSIZE", (0,0), (-1,-1), 9),
            ("FONTNAME", (0,0), (0,-1), "Helvetica-Bold"),
            ("FONTNAME", (2,0), (2,-1), "Helvetica-Bold"),
            ("TEXTCOLOR", (0,0), (-1,-1), colors.HexColor("#222233")),
            ("ROWBACKGROUNDS", (0,0), (-1,-1), [colors.HexColor("#F2F4F8"), colors.white]),
            ("PADDING", (0,0), (-1,-1), 5),
        ]))
        elements.append(meta_table)
        elements.append(Spacer(1, 0.5*cm))

        # ── SOAP Sections ──
        section_heading = ParagraphStyle("sh", parent=styles["Heading2"],
                                          textColor=colors.white, fontSize=12,
                                          backColor=colors.HexColor("#1759B0"),
                                          borderPad=6, spaceAfter=4, spaceBefore=10)
        field_style = ParagraphStyle("field", parent=styles["Normal"],
                                      fontSize=9, textColor=colors.HexColor("#222233"),
                                      spaceAfter=3)
        label_style = ParagraphStyle("label", parent=styles["Normal"],
                                      fontSize=9, fontName="Helvetica-Bold",
                                      textColor=colors.HexColor("#1759B0"))

        sections = [
            ("S — Subjective", soap_note.get("subjective", {}), [
                ("Chief Complaint", "chief_complaint"),
                ("History of Present Illness", "history_of_present_illness"),
                ("Review of Systems", "review_of_systems"),
                ("Patient Reported Medications", "patient_reported_medications"),
            ]),
            ("O — Objective", soap_note.get("objective", {}), [
                ("Vitals", "vitals"),
                ("Physical Examination", "physical_examination"),
                ("Relevant Findings", "relevant_findings"),
            ]),
            ("A — Assessment", soap_note.get("assessment", {}), [
                ("Primary Diagnosis", "primary_diagnosis"),
                ("Differential Diagnoses", "differential_diagnoses"),
                ("Clinical Impression", "clinical_impression"),
            ]),
            ("P — Plan", soap_note.get("plan", {}), [
                ("Investigations Ordered", "investigations_ordered"),
                ("Medications Prescribed", "medications_prescribed"),
                ("Referrals", "referrals"),
                ("Patient Instructions", "patient_instructions"),
                ("Follow Up", "follow_up"),
            ]),
        ]

        for title, data, fields in sections:
            elements.append(Paragraph(f"  {title}", section_heading))
            for label, key in fields:
                value = data.get(key, "Not documented")
                if value:
                    elements.append(Paragraph(f"{label}:", label_style))
                    elements.append(Paragraph(str(value), field_style))
            elements.append(Spacer(1, 0.3*cm))

        # ── Disclaimer ──
        elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#D72E2E")))
        elements.append(Spacer(1, 0.2*cm))
        disclaimer_style = ParagraphStyle("disc", parent=styles["Normal"],
                                           fontSize=7.5, textColor=colors.HexColor("#D72E2E"))
        elements.append(Paragraph(DISCLAIMER, disclaimer_style))

        doc.build(elements)
        return buffer.getvalue()

    except ImportError:
        logger.error("reportlab not installed. Run: pip install reportlab")
        return b""


def generate_patient_pdf(
    analysis: dict,
    patient_name: str = "Anonymous Patient",
    language: str = "en",
) -> bytes:
    """Generate a branded patient health guide PDF.

    `language` is the ISO code for the patient's preferred language — when
    it is not "en" we emit a top-of-document header note explaining that
    the body content was generated in that language and (best-effort)
    register a Unicode-capable TTF font so Indic / Arabic glyphs render.
    """
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib import colors
        from reportlab.lib.units import cm
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
            HRFlowable, ListFlowable, ListItem
        )
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.enums import TA_LEFT, TA_CENTER

        # Pull config inside the function so import-time failures don't
        # take down PDF generation entirely.
        try:
            from config import SUPPORTED_LANGUAGES, normalize_language
            lang_code = normalize_language(language)
            lang_label = SUPPORTED_LANGUAGES.get(lang_code, "English")
        except Exception:
            lang_code = "en"
            lang_label = "English"

        body_font = "Helvetica"
        if lang_code != "en":
            body_font = _ensure_unicode_font()
        # Bold face that pairs with `body_font` — the Unicode family has an
        # explicit "-Bold" variant we registered; Helvetica uses the
        # built-in "Helvetica-Bold". Used everywhere we'd otherwise hard-
        # code "Helvetica-Bold", so non-English PDFs no longer fall back to
        # a Latin-only face on bold runs (the bug that surfaced as empty
        # cells in the findings table for translated values).
        bold_font = _bold_font_for(body_font)

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer, pagesize=A4,
            rightMargin=2*cm, leftMargin=2*cm, topMargin=2*cm, bottomMargin=2*cm
        )
        styles = getSampleStyleSheet()
        elements = []

        header_style = ParagraphStyle("h", parent=styles["Title"],
                                       textColor=colors.HexColor("#1759B0"), fontSize=22, spaceAfter=4,
                                       fontName=bold_font)
        sub_style = ParagraphStyle("s", parent=styles["Normal"],
                                    textColor=colors.HexColor("#05AEBB"), fontSize=11, spaceAfter=2,
                                    fontName=body_font)
        section_heading = ParagraphStyle("sh", parent=styles["Heading2"],
                                          textColor=colors.white, fontSize=12,
                                          backColor=colors.HexColor("#1759B0"),
                                          borderPad=6, spaceAfter=6, spaceBefore=10,
                                          fontName=bold_font)
        body = ParagraphStyle(
            "body", parent=styles["Normal"], fontSize=9, spaceAfter=3,
            fontName=body_font,
        )
        bold_label = ParagraphStyle("bl", parent=styles["Normal"],
                                    fontSize=9, fontName=bold_font,
                                    textColor=colors.HexColor("#1759B0"))

        # Header
        elements.append(Paragraph("MediSense AI", header_style))
        elements.append(Paragraph("Personal Health Guide", sub_style))
        elements.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor("#1759B0")))
        elements.append(Spacer(1, 0.2*cm))
        elements.append(Paragraph(f"Prepared for: <b>{patient_name}</b>  |  Date: {datetime.now().strftime('%d %B %Y')}", body))

        # Language note: surfaces what language the LLM was asked to use,
        # plus a heads-up for RTL scripts where ReportLab's left-to-right
        # layout can mis-render.
        if lang_code != "en":
            lang_note_style = ParagraphStyle(
                "lang_note", parent=styles["Normal"],
                fontSize=8.5, textColor=colors.HexColor("#1759B0"),
                fontName=body_font, spaceBefore=4, spaceAfter=4,
            )
            note = (
                f"Content generated in {lang_label} as per patient preference."
            )
            if lang_code in _RTL_LANGUAGE_CODES:
                note += (
                    " Note: this language is written right-to-left; PDF layout"
                    " may not render perfectly — the in-app text and chatbot"
                    " responses are authoritative."
                )
            elements.append(Paragraph(note, lang_note_style))

        elements.append(Spacer(1, 0.4*cm))

        # Tab 1: Summary
        urgency = analysis.get("urgency", "routine")
        urgency_color = {"go_today": "#D72E2E", "within_1_week": "#F29912", "routine": "#21A257"}.get(urgency, "#21A257")
        elements.append(Paragraph("  📋 Report Summary", section_heading))
        elements.append(Paragraph(analysis.get("plain_summary", ""), body))
        elements.append(Paragraph(analysis.get("what_this_means", ""), body))
        elements.append(Spacer(1, 0.3*cm))

        # Findings table
        findings = analysis.get("findings", [])
        if findings:
            table_data = [["Test", "Your Value", "Normal Range", "Status"]]
            for f in findings:
                status = f.get("status", "normal").upper()
                table_data.append([
                    f.get("test_name", ""),
                    f"{f.get('patient_value', '')} {f.get('unit', '')}".strip(),
                    f.get("reference_range", ""),
                    status,
                ])
            findings_table = Table(table_data, colWidths=[5*cm, 3.5*cm, 4*cm, 3*cm])
            status_styles = []
            for i, f in enumerate(findings, 1):
                s = f.get("status", "normal")
                bg = colors.HexColor("#FFE5E5") if s == "high" else \
                     colors.HexColor("#FFF3E0") if s == "low" else \
                     colors.HexColor("#E8F5E9")
                status_styles.append(("BACKGROUND", (3, i), (3, i), bg))
            findings_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1759B0")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), bold_font),
                # Body cells must use the Unicode family too; without this
                # row the table inherits Helvetica and translated values
                # like "9.2 ग्राम" or "उच्च" rendered as blanks.
                ("FONTNAME", (0, 1), (-1, -1), body_font),
                ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5F7FB")]),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CCCCDD")),
                ("PADDING", (0, 0), (-1, -1), 5),
            ] + status_styles))
            elements.append(findings_table)
            elements.append(Spacer(1, 0.4*cm))

        # Specialist
        specialists = analysis.get("specialists", [])
        if specialists:
            elements.append(Paragraph("  🏥 Specialist Recommendations", section_heading))
            urgency_label = {"go_today": "⚠ GO TODAY", "within_1_week": "Within 1 Week", "routine": "Routine"}.get(urgency, "Routine")
            elements.append(Paragraph(f"Urgency: <font color='{urgency_color}'><b>{urgency_label}</b></font>  —  {analysis.get('urgency_reason', '')}", body))
            for sp in specialists:
                elements.append(Paragraph(f"• <b>{sp.get('type', '')}</b>: {sp.get('reason', '')}", body))
            elements.append(Spacer(1, 0.3*cm))

        # Diet
        diet = analysis.get("diet_plan", {})
        if diet:
            elements.append(Paragraph("  🥗 Diet Plan", section_heading))
            eat = diet.get("foods_to_eat", [])
            avoid = diet.get("foods_to_avoid", [])
            if eat:
                elements.append(Paragraph("Foods to Eat:", bold_label))
                for item in eat:
                    elements.append(Paragraph(f"  ✓ <b>{item.get('food', '')}</b> — {item.get('reason', '')} ({item.get('how_much', '')})", body))
            if avoid:
                elements.append(Paragraph("Foods to Avoid:", bold_label))
                for item in avoid:
                    elements.append(Paragraph(f"  ✗ <b>{item.get('food', '')}</b> — {item.get('reason', '')}", body))
            if diet.get("meal_timing_tips"):
                elements.append(Paragraph(f"Meal Timing: {diet['meal_timing_tips']}", body))
            elements.append(Spacer(1, 0.3*cm))

        # Exercise
        exercises = analysis.get("exercise_plan", [])
        if exercises:
            elements.append(Paragraph("  🏃 Exercise Plan", section_heading))
            for ex in exercises:
                elements.append(Paragraph(
                    f"• <b>{ex.get('activity', '')}</b> — {ex.get('duration', '')} {ex.get('frequency', '')}  |  {ex.get('benefit', '')}",
                    body
                ))

        # Precautions
        prec = analysis.get("precautions", {})
        if prec:
            elements.append(Paragraph("  ⚠ Precautions & Safety", section_heading))
            for h in prec.get("daily_habits", []):
                elements.append(Paragraph(f"  • {h}", body))
            for w in prec.get("lifestyle_warnings", []):
                elements.append(Paragraph(f"  ⚠ {w}", body))
            emergency = prec.get("emergency_signs", [])
            if emergency:
                elements.append(Paragraph("Emergency Signs — Go to ER immediately:", bold_label))
                for e in emergency:
                    elements.append(Paragraph(f"  🚨 {e}", ParagraphStyle("em", parent=body, textColor=colors.HexColor("#D72E2E"), fontName=body_font)))

        # Disclaimer
        elements.append(Spacer(1, 0.5*cm))
        elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#D72E2E")))
        elements.append(Paragraph(DISCLAIMER, ParagraphStyle("d", parent=styles["Normal"], fontSize=7.5, textColor=colors.HexColor("#D72E2E"), fontName=body_font)))

        doc.build(elements)
        return buffer.getvalue()

    except ImportError:
        logger.error("reportlab not installed")
        return b""


def generate_consultation_patient_pdf(
    explanation: dict,
    patient_name: str = "Anonymous Patient",
    doctor_name: str = "Attending Physician",
    session_id: str | None = None,
    language: str = "en",
) -> bytes:
    """Generate a patient-friendly consultation summary PDF in plain language.

    `language` is the ISO code the LLM was asked to write in. When non-English
    we register and use a Unicode-capable font family for every text style so
    Devanagari / Tamil / Bengali etc. don't render as empty cells.
    """
    try:
        from reportlab.lib import colors
        from reportlab.lib.enums import TA_LEFT
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import cm
        from reportlab.platypus import (
            HRFlowable,
            Paragraph,
            SimpleDocTemplate,
            Spacer,
            Table,
            TableStyle,
        )

        try:
            from config import normalize_language
            lang_code = normalize_language(language)
        except Exception:
            lang_code = "en"

        body_font = "Helvetica"
        if lang_code != "en":
            body_font = _ensure_unicode_font()
        bold_font = _bold_font_for(body_font)

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer, pagesize=A4,
            rightMargin=2*cm, leftMargin=2*cm, topMargin=2*cm, bottomMargin=2*cm,
        )
        styles = getSampleStyleSheet()

        header_style = ParagraphStyle("h", parent=styles["Title"],
                                       textColor=colors.HexColor("#1759B0"), fontSize=22, spaceAfter=4,
                                       fontName=bold_font)
        sub_style = ParagraphStyle("s", parent=styles["Normal"],
                                    textColor=colors.HexColor("#05AEBB"), fontSize=11, spaceAfter=2,
                                    fontName=body_font)
        section_heading = ParagraphStyle("sh", parent=styles["Heading2"],
                                          textColor=colors.white, fontSize=12,
                                          backColor=colors.HexColor("#1759B0"),
                                          borderPad=6, spaceAfter=6, spaceBefore=12,
                                          fontName=bold_font)
        body = ParagraphStyle("body", parent=styles["Normal"], fontSize=9.5, spaceAfter=4, leading=14,
                              fontName=body_font)
        bold_label = ParagraphStyle("bl", parent=styles["Normal"],
                                    fontSize=9.5, fontName=bold_font,
                                    textColor=colors.HexColor("#1759B0"), spaceAfter=2)
        bullet = ParagraphStyle("bullet", parent=styles["Normal"], fontSize=9.5, spaceAfter=3,
                                 leftIndent=12, leading=14, fontName=body_font)
        warn = ParagraphStyle("warn", parent=styles["Normal"], fontSize=9.5,
                               textColor=colors.HexColor("#D72E2E"), spaceAfter=3, leftIndent=12,
                               fontName=body_font)

        elements = []

        # ── Header ──
        elements.append(Paragraph("MediSense AI", header_style))
        elements.append(Paragraph("Your Consultation Summary", sub_style))
        elements.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor("#1759B0")))
        elements.append(Spacer(1, 0.2*cm))

        meta = [
            ["Patient:", patient_name, "Doctor:", doctor_name],
            ["Date:", datetime.now().strftime("%d %B %Y, %H:%M"), "Session:", session_id or "—"],
        ]
        meta_table = Table(meta, colWidths=[2.5*cm, 7*cm, 2.5*cm, 5.5*cm])
        meta_table.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, -1), body_font),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("FONTNAME", (0, 0), (0, -1), bold_font),
            ("FONTNAME", (2, 0), (2, -1), bold_font),
            ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#222233")),
            ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.HexColor("#F2F4F8"), colors.white]),
            ("PADDING", (0, 0), (-1, -1), 5),
        ]))
        elements.append(meta_table)
        elements.append(Spacer(1, 0.4*cm))

        # ── Greeting ──
        greeting = explanation.get("greeting", "")
        if greeting:
            elements.append(Paragraph(greeting, body))
            elements.append(Spacer(1, 0.3*cm))

        # ── What Was Found ──
        found = explanation.get("what_was_found", {})
        if found:
            elements.append(Paragraph("  🔍 What the Doctor Found", section_heading))
            if found.get("diagnosis"):
                elements.append(Paragraph("Diagnosis:", bold_label))
                elements.append(Paragraph(found["diagnosis"], body))
            if found.get("in_simple_terms"):
                elements.append(Paragraph("In Simple Terms:", bold_label))
                elements.append(Paragraph(found["in_simple_terms"], body))
            if found.get("why_this_happened"):
                elements.append(Paragraph("Why This Happened:", bold_label))
                elements.append(Paragraph(found["why_this_happened"], body))
            if found.get("what_it_means_for_you"):
                elements.append(Paragraph("What This Means for You:", bold_label))
                elements.append(Paragraph(found["what_it_means_for_you"], body))
            elements.append(Spacer(1, 0.3*cm))

        # ── Your Treatment ──
        treatment = explanation.get("your_treatment", {})
        if treatment:
            elements.append(Paragraph("  💊 Your Treatment Plan", section_heading))
            if treatment.get("overview"):
                elements.append(Paragraph(treatment["overview"], body))

            meds = treatment.get("medications", [])
            if meds:
                elements.append(Paragraph("Medications Prescribed:", bold_label))
                for med in meds:
                    elements.append(Paragraph(
                        f"<b>{med.get('name', '')}</b> — {med.get('what_it_does', '')}", bullet
                    ))
                    if med.get("how_to_take"):
                        elements.append(Paragraph(f"  How to take: {med['how_to_take']}", bullet))
                    if med.get("side_effects_to_watch"):
                        elements.append(Paragraph(
                            f"  Watch for: {med['side_effects_to_watch']}", bullet
                        ))
                elements.append(Spacer(1, 0.2*cm))

            tests = treatment.get("tests_ordered", [])
            if tests:
                elements.append(Paragraph("Tests/Investigations Ordered:", bold_label))
                for t in tests:
                    elements.append(Paragraph(
                        f"• <b>{t.get('test', '')}</b> — {t.get('why', '')}", bullet
                    ))
            elements.append(Spacer(1, 0.3*cm))

        # ── What to Do Next ──
        next_steps = explanation.get("what_to_do_next", {})
        if next_steps:
            elements.append(Paragraph("  📋 What to Do Next", section_heading))

            immediate = next_steps.get("immediate_steps", [])
            if immediate:
                elements.append(Paragraph("Immediate Steps:", bold_label))
                for step in immediate:
                    elements.append(Paragraph(f"✓ {step}", bullet))

            lifestyle = next_steps.get("lifestyle_changes", [])
            if lifestyle:
                elements.append(Paragraph("Lifestyle Changes:", bold_label))
                for change in lifestyle:
                    elements.append(Paragraph(f"• {change}", bullet))

            if next_steps.get("follow_up"):
                elements.append(Paragraph("Follow-Up:", bold_label))
                elements.append(Paragraph(next_steps["follow_up"], body))

            emergency = next_steps.get("when_to_seek_help_immediately", [])
            if emergency:
                elements.append(Paragraph("⚠ Seek Immediate Help If:", bold_label))
                for sign in emergency:
                    elements.append(Paragraph(f"🚨 {sign}", warn))
            elements.append(Spacer(1, 0.3*cm))

        # ── Reassurance ──
        reassurance = explanation.get("reassurance", "")
        if reassurance:
            elements.append(Paragraph("  💙 A Note from Your Care Team", section_heading))
            elements.append(Paragraph(reassurance, body))
            elements.append(Spacer(1, 0.3*cm))

        # ── Disclaimer ──
        elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#D72E2E")))
        elements.append(Spacer(1, 0.2*cm))
        elements.append(Paragraph(
            DISCLAIMER,
            ParagraphStyle("d", parent=styles["Normal"], fontSize=7.5,
                           textColor=colors.HexColor("#D72E2E"),
                           fontName=body_font),
        ))

        doc.build(elements)
        return buffer.getvalue()

    except ImportError:
        logger.error("reportlab not installed")
        return b""
