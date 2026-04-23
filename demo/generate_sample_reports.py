"""
generate_sample_reports.py — Creates realistic demo medical report PDFs
Run from the project root: python demo/generate_sample_reports.py
Requires: pip install reportlab
"""
import os
from pathlib import Path

OUTPUT_DIR = Path(__file__).parent / "sample_reports"
OUTPUT_DIR.mkdir(exist_ok=True)


def make_pdf(filename: str, title: str, patient_name: str, age: str, content_lines: list[str]):
    """Build a simple medical report PDF using ReportLab."""
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib import colors
        from reportlab.lib.units import cm
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.enums import TA_CENTER
        from datetime import datetime

        path = OUTPUT_DIR / filename
        doc = SimpleDocTemplate(str(path), pagesize=A4,
                                rightMargin=2*cm, leftMargin=2*cm,
                                topMargin=2*cm, bottomMargin=2*cm)
        styles = getSampleStyleSheet()
        elements = []

        # ── Header ──
        lab_style = ParagraphStyle("lab", parent=styles["Title"], fontSize=20,
                                   textColor=colors.HexColor("#1759B0"), spaceAfter=4, alignment=TA_CENTER)
        sub_style = ParagraphStyle("sub", parent=styles["Normal"], fontSize=11,
                                   textColor=colors.HexColor("#05AEBB"), spaceAfter=2, alignment=TA_CENTER)
        elements.append(Paragraph("City Diagnostics & Laboratory Services", lab_style))
        elements.append(Paragraph("NABL Accredited | ISO 9001:2015 Certified", sub_style))
        elements.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor("#1759B0")))
        elements.append(Spacer(1, 0.3*cm))

        # ── Report title ──
        title_style = ParagraphStyle("rt", parent=styles["Heading1"], fontSize=14,
                                     textColor=colors.HexColor("#222233"), spaceAfter=4)
        elements.append(Paragraph(f"📋 {title}", title_style))

        # ── Patient info ──
        date_str = datetime.now().strftime("%d/%m/%Y")
        info = [
            ["Patient Name:", patient_name, "Report Date:", date_str],
            ["Age / Gender:", age, "Sample Type:", "Venous Blood"],
            ["Ref. Doctor:", "Dr. Anand Sharma", "Report ID:", f"CDL-2024-{os.urandom(3).hex().upper()}"],
        ]
        info_table = Table(info, colWidths=[3*cm, 6*cm, 3*cm, 5.5*cm])
        info_table.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
            ("PADDING", (0, 0), (-1, -1), 5),
            ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.HexColor("#F2F4F8"), colors.white]),
        ]))
        elements.append(info_table)
        elements.append(Spacer(1, 0.5*cm))
        elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#CCCCDD")))
        elements.append(Spacer(1, 0.3*cm))

        # ── Test results table ──
        body_style = ParagraphStyle("body", parent=styles["Normal"], fontSize=9)
        label_style = ParagraphStyle("label", parent=styles["Normal"], fontSize=9, fontName="Helvetica-Bold",
                                     textColor=colors.HexColor("#1759B0"))
        elements.append(Paragraph("Test Results", label_style))
        elements.append(Spacer(1, 0.2*cm))

        # Table header
        header = ["Test Name", "Patient Value", "Unit", "Reference Range", "Flag"]
        rows = [header]
        row_colors = []

        for line in content_lines:
            if isinstance(line, list):
                rows.append(line)
                # Color abnormal flags
                flag = line[-1].strip().upper()
                if flag == "HIGH":
                    row_colors.append(("BACKGROUND", (4, len(rows)-1), (4, len(rows)-1), colors.HexColor("#FFE5E5")))
                elif flag == "LOW":
                    row_colors.append(("BACKGROUND", (4, len(rows)-1), (4, len(rows)-1), colors.HexColor("#FFF3E0")))
                else:
                    row_colors.append(("BACKGROUND", (4, len(rows)-1), (4, len(rows)-1), colors.HexColor("#E8F5E9")))

        result_table = Table(rows, colWidths=[5*cm, 3*cm, 2*cm, 4*cm, 2.5*cm])
        style_cmds = [
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1759B0")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8.5),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5F7FB")]),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CCCCDD")),
            ("PADDING", (0, 0), (-1, -1), 6),
            ("ALIGN", (1, 0), (2, -1), "CENTER"),
            ("ALIGN", (4, 0), (4, -1), "CENTER"),
            ("FONTNAME", (4, 1), (4, -1), "Helvetica-Bold"),
        ] + row_colors
        result_table.setStyle(TableStyle(style_cmds))
        elements.append(result_table)
        elements.append(Spacer(1, 0.5*cm))

        # ── Footer disclaimer ──
        disc_style = ParagraphStyle("disc", parent=styles["Normal"], fontSize=7.5,
                                    textColor=colors.HexColor("#D72E2E"))
        elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#D72E2E")))
        elements.append(Paragraph(
            "⚠ This report is for informational purposes only. Results must be interpreted "
            "by a qualified physician in clinical context. This is a sample/demo document "
            "generated for the MediSense AI hackathon project.",
            disc_style,
        ))

        doc.build(elements)
        print(f"[OK] Created: {path}")

    except ImportError:
        print("[ERROR] reportlab not installed. Run: pip install reportlab")
        # Fallback: write a plain text file with the same data
        txt_path = OUTPUT_DIR / filename.replace(".pdf", ".txt")
        with open(txt_path, "w") as f:
            f.write(f"MEDICAL REPORT - {title}\nPatient: {patient_name} | Age: {age}\n\n")
            f.write("Test Name | Patient Value | Unit | Reference Range | Flag\n")
            f.write("-" * 70 + "\n")
            for line in content_lines:
                if isinstance(line, list):
                    f.write(" | ".join(str(x) for x in line) + "\n")
        print(f"[OK] Created text fallback: {txt_path}")


def main():
    # ── Report 1: Diabetes Blood Report ──────────────────────────────────
    make_pdf(
        "diabetes_blood_report.pdf",
        "Complete Blood Count + Metabolic Panel",
        "Ramesh Kumar Sharma",
        "52 Years / Male",
        [
            ["Fasting Blood Glucose", "142", "mg/dL", "70 - 110", "HIGH"],
            ["HbA1c (Glycated Haemoglobin)", "7.8", "%", "4.0 - 5.6", "HIGH"],
            ["Haemoglobin", "10.2", "g/dL", "13.0 - 17.5", "LOW"],
            ["Total Cholesterol", "218", "mg/dL", "< 200", "HIGH"],
            ["HDL Cholesterol", "38", "mg/dL", "> 40", "LOW"],
            ["LDL Cholesterol", "145", "mg/dL", "< 130", "HIGH"],
            ["Triglycerides", "195", "mg/dL", "< 150", "HIGH"],
            ["Serum Creatinine", "1.1", "mg/dL", "0.7 - 1.2", "Normal"],
            ["eGFR", "72", "mL/min/1.73m²", "> 60", "Normal"],
            ["Platelet Count", "1.85", "Lakhs/μL", "1.5 - 4.0", "Normal"],
            ["WBC Count", "8,200", "cells/μL", "4,000 - 11,000", "Normal"],
        ],
    )

    # ── Report 2: Iron Deficiency Anaemia (CBC) ────────────────────────
    make_pdf(
        "low_haemoglobin_cbc.pdf",
        "Complete Blood Count (CBC) with Iron Studies",
        "Priya Sundar Rajan",
        "28 Years / Female",
        [
            ["Haemoglobin", "8.5", "g/dL", "12.0 - 15.5", "LOW"],
            ["Haematocrit (PCV)", "26", "%", "36 - 46", "LOW"],
            ["MCV (Mean Cell Volume)", "65", "fL", "80 - 100", "LOW"],
            ["MCH", "18", "pg", "27 - 33", "LOW"],
            ["MCHC", "28", "g/dL", "32 - 36", "LOW"],
            ["Serum Iron", "38", "μg/dL", "60 - 170", "LOW"],
            ["TIBC", "480", "μg/dL", "240 - 450", "HIGH"],
            ["Transferrin Saturation", "8", "%", "20 - 50", "LOW"],
            ["Serum Ferritin", "5", "ng/mL", "12 - 150", "LOW"],
            ["RBC Count", "3.8", "millions/μL", "3.8 - 5.2", "Normal"],
            ["WBC Count", "7,500", "cells/μL", "4,000 - 11,000", "Normal"],
            ["Platelet Count", "2.40", "Lakhs/μL", "1.5 - 4.0", "Normal"],
        ],
    )

    # ── Report 3: Liver Function Test (LFT) ───────────────────────────
    make_pdf(
        "liver_function_test.pdf",
        "Liver Function Test (LFT) Panel",
        "Anil Gupta",
        "44 Years / Male",
        [
            ["SGPT / ALT", "68", "U/L", "7 - 56", "HIGH"],
            ["SGOT / AST", "52", "U/L", "10 - 40", "HIGH"],
            ["Alkaline Phosphatase (ALP)", "148", "U/L", "44 - 147", "HIGH"],
            ["Gamma GT (GGT)", "85", "U/L", "8 - 61", "HIGH"],
            ["Total Bilirubin", "1.8", "mg/dL", "0.2 - 1.2", "HIGH"],
            ["Direct Bilirubin", "0.6", "mg/dL", "0.0 - 0.3", "HIGH"],
            ["Indirect Bilirubin", "1.2", "mg/dL", "0.2 - 0.9", "HIGH"],
            ["Total Protein", "7.2", "g/dL", "6.0 - 8.0", "Normal"],
            ["Serum Albumin", "3.8", "g/dL", "3.5 - 5.0", "Normal"],
            ["Serum Globulin", "3.4", "g/dL", "2.0 - 3.5", "Normal"],
            ["A/G Ratio", "1.1", "", "1.2 - 2.2", "LOW"],
            ["Prothrombin Time", "14", "seconds", "11 - 13", "HIGH"],
        ],
    )

    print("\nAll sample reports generated in:", OUTPUT_DIR.resolve())
    print(
        "\nTo use with MediSense AI:\n"
        "1. Start the backend: cd backend && uvicorn main:app --reload\n"
        "2. Start the frontend: cd frontend && npm run dev\n"
        "3. Navigate to http://localhost:5173/patient\n"
        "4. Upload any of the PDFs from demo/sample_reports/\n"
    )


if __name__ == "__main__":
    main()
