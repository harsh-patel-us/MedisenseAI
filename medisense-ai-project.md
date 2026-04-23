# MediSense AI — Complete Development Blueprint

> **Project for Hackathon | AI-Powered Health Intelligence Platform**
> Use this file as context for your VSCode LLM (GitHub Copilot, Cursor, Continue, etc.) to generate accurate, project-specific code.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Problem Statement](#2-problem-statement)
3. [Solution Summary](#3-solution-summary)
4. [System Architecture](#4-system-architecture)
5. [Tech Stack](#5-tech-stack)
6. [Project Structure](#6-project-structure)
7. [Module Workflows](#7-module-workflows)
   - 7.1 [Doctor Side — Audio to SOAP Note](#71-doctor-side--audio-to-soap-note)
   - 7.2 [Patient Side — Report Upload to Health Guide](#72-patient-side--report-upload-to-health-guide)
8. [API Endpoints](#8-api-endpoints)
9. [Claude AI Prompts](#9-claude-ai-prompts)
10. [Database Schema](#10-database-schema)
11. [Day-by-Day Build Plan](#11-day-by-day-build-plan)
12. [Environment Variables](#12-environment-variables)
13. [Installation & Setup](#13-installation--setup)
14. [Frontend Components](#14-frontend-components)
15. [Testing Strategy](#15-testing-strategy)
16. [Demo Scenarios](#16-demo-scenarios)
17. [Safety & Disclaimers](#17-safety--disclaimers)

---

## 1. Project Overview

**Project Name:** MediSense AI

**Tagline:** From consultation to care — AI-powered health intelligence for doctors and patients.

**Type:** Full-stack web application (Doctor side + Patient side)

**Core AI:** Anthropic Claude API (`claude-sonnet-4-5`) for all intelligence tasks

**Hackathon Goal:** Build a working MVP in 20 days that demonstrates real-time AI clinical note generation for doctors AND AI-powered health report analysis for patients.

---

## 2. Problem Statement

### Problem 1 — Doctor Side (Documentation Burden)

- Physicians spend **9 minutes on EHR** for every 15 minutes of patient care
- **43% of physicians** experience burnout — documentation is the #1 cause
- **75% of healthcare workers** say documentation hampers patient care
- **77% of providers** finish notes after working hours ("pajama time")
- Doctors spend **2+ hours daily** writing clinical notes manually

### Problem 2 — Patient Side (Health Literacy Gap)

- **90% of adults** struggle to understand health information effectively
- Only **12% of US adults** have proficient health literacy
- Poor health literacy costs healthcare systems **$236 billion annually**
- Patients with low health literacy are **3x more likely** to revisit ER
- After receiving a report, patients don't know: which doctor to see, what to eat, what exercises are safe, or what precautions to take

---

## 3. Solution Summary

MediSense AI is a **dual-sided AI health platform**:

### Doctor Side
- Records consultation audio in real time
- Transcribes speech using Whisper (speech-to-text)
- Labels Doctor vs Patient speech (speaker diarization)
- Extracts medical entities (symptoms, drugs, diagnoses)
- **Auto-generates a structured SOAP clinical note using Claude API**
- Doctor reviews, edits, and exports as PDF

### Patient Side
- Patient uploads blood report / lab result / prescription (PDF or image)
- OCR extracts text from uploaded file
- **Claude AI analyzes the report and produces:**
  1. Plain-language summary of all findings
  2. Flagged abnormal values (high/low with explanation)
  3. Recommended specialist to visit + urgency level
  4. Personalized diet plan (foods to eat and avoid)
  5. Safe exercise plan for their condition
  6. Daily precautions and lifestyle warnings

---

## 4. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND (React)                        │
│  ┌─────────────────────┐    ┌──────────────────────────┐   │
│  │   Doctor Dashboard  │    │   Patient Dashboard      │   │
│  │  - Record audio     │    │  - Upload report         │   │
│  │  - Live transcript  │    │  - View 4-tab results    │   │
│  │  - Edit SOAP note   │    │  - Download PDF guide    │   │
│  └──────────┬──────────┘    └─────────────┬────────────┘   │
└─────────────┼─────────────────────────────┼────────────────┘
              │ WebSocket (audio)            │ HTTP POST (file)
              ▼                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND (FastAPI)                         │
│                                                             │
│  /doctor/stream-audio  ──►  Whisper STT  ──►  Diarization  │
│  /doctor/generate-note ──►  scispaCy NER ──►  Claude API   │
│                                                             │
│  /patient/upload       ──►  PyMuPDF/OCR  ──►  Claude API   │
│  /patient/analyze      ──►  Claude API (4 prompts)         │
│                                                             │
└──────────────────────────────┬──────────────────────────────┘
                               │
              ┌────────────────▼────────────────┐
              │         Claude API              │
              │  (claude-sonnet-4-5)            │
              │  - SOAP note generation         │
              │  - Report analysis              │
              │  - Specialist routing           │
              │  - Diet + exercise plans        │
              └─────────────────────────────────┘
```

---

## 5. Tech Stack

### Backend
| Tool | Version | Purpose |
|------|---------|---------|
| Python | 3.11+ | Primary language |
| FastAPI | 0.110+ | REST API + WebSockets |
| Uvicorn | 0.29+ | ASGI server |
| openai-whisper | latest | Speech-to-text (local) |
| pyannote.audio | 3.1+ | Speaker diarization |
| scispaCy | 0.5+ | Medical NER |
| PyMuPDF (fitz) | 1.23+ | PDF text extraction |
| pytesseract | 0.3+ | OCR for scanned images |
| anthropic | 0.25+ | Claude API client |
| reportlab | 4.0+ | PDF generation for export |
| python-multipart | latest | File upload handling |
| Pillow | 10+ | Image preprocessing |

### Frontend
| Tool | Version | Purpose |
|------|---------|---------|
| React | 18+ | UI framework |
| TypeScript | 5+ | Type safety |
| TailwindCSS | 3+ | Styling |
| Axios | 1.6+ | HTTP requests |
| WebSocket API | native | Real-time audio streaming |
| react-syntax-highlighter | latest | Code/note display |
| jsPDF | 2.5+ | Frontend PDF download |

### Infrastructure
| Tool | Purpose |
|------|---------|
| SQLite (dev) / PostgreSQL (prod) | Database |
| dotenv | Environment variables |
| CORS middleware | Cross-origin requests |

---

## 6. Project Structure

```
medisense-ai/
├── backend/
│   ├── main.py                    # FastAPI app entry point
│   ├── config.py                  # Settings, env vars, constants
│   ├── requirements.txt
│   ├── .env                       # API keys (never commit)
│   │
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── doctor.py              # Doctor-side endpoints
│   │   └── patient.py             # Patient-side endpoints
│   │
│   ├── services/
│   │   ├── __init__.py
│   │   ├── transcription.py       # Whisper STT service
│   │   ├── diarization.py         # Speaker labeling service
│   │   ├── ner.py                 # Medical entity extraction
│   │   ├── report_parser.py       # PDF + OCR parsing
│   │   ├── claude_service.py      # All Claude API calls
│   │   └── pdf_export.py          # PDF generation
│   │
│   ├── models/
│   │   ├── __init__.py
│   │   ├── doctor_models.py       # Pydantic models for doctor side
│   │   └── patient_models.py      # Pydantic models for patient side
│   │
│   └── utils/
│       ├── __init__.py
│       └── helpers.py             # Shared utility functions
│
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   │
│   │   ├── pages/
│   │   │   ├── DoctorDashboard.tsx
│   │   │   └── PatientDashboard.tsx
│   │   │
│   │   ├── components/
│   │   │   ├── doctor/
│   │   │   │   ├── AudioRecorder.tsx
│   │   │   │   ├── LiveTranscript.tsx
│   │   │   │   └── SoapNoteEditor.tsx
│   │   │   │
│   │   │   └── patient/
│   │   │       ├── ReportUploader.tsx
│   │   │       ├── ReportSummary.tsx
│   │   │       ├── SpecialistGuide.tsx
│   │   │       ├── DietExercisePlan.tsx
│   │   │       └── PrecautionsList.tsx
│   │   │
│   │   ├── hooks/
│   │   │   ├── useAudioRecorder.ts
│   │   │   └── useWebSocket.ts
│   │   │
│   │   ├── api/
│   │   │   ├── doctorApi.ts
│   │   │   └── patientApi.ts
│   │   │
│   │   └── types/
│   │       ├── doctor.types.ts
│   │       └── patient.types.ts
│   │
│   ├── package.json
│   ├── tsconfig.json
│   └── tailwind.config.js
│
├── tests/
│   ├── test_doctor_routes.py
│   ├── test_patient_routes.py
│   └── test_claude_service.py
│
├── demo/
│   ├── sample_reports/
│   │   ├── diabetes_blood_report.pdf
│   │   ├── low_haemoglobin_cbc.pdf
│   │   └── liver_function_test.pdf
│   └── sample_transcripts/
│       ├── chest_pain_consultation.txt
│       ├── diabetes_followup.txt
│       └── pediatric_fever.txt
│
└── README.md
```

---

## 7. Module Workflows

### 7.1 Doctor Side — Audio to SOAP Note

```
Step 1: Doctor opens Doctor Dashboard in browser
Step 2: Clicks "Start Recording" button
        → Browser requests microphone permission
        → Web Audio API captures mic stream
        → Audio chunks sent via WebSocket to /doctor/stream-audio

Step 3: Backend receives audio chunks
        → Assembles audio buffer
        → Passes to Whisper model (openai-whisper)
        → Whisper returns text transcript

Step 4: Speaker Diarization
        → pyannote.audio segments transcript
        → Labels each segment as DOCTOR or PATIENT
        → Returns: [{"speaker": "DOCTOR", "text": "...", "start": 0.0, "end": 5.2}, ...]

Step 5: Live transcript displayed on frontend
        → WebSocket pushes labeled segments to frontend in real time
        → Frontend renders transcript with color-coded speaker labels

Step 6: Doctor clicks "Generate SOAP Note"
        → POST /doctor/generate-note with full transcript
        → Backend runs scispaCy NER on transcript
        → Extracts: symptoms, medications, diagnoses, vitals, allergies

Step 7: Claude API call — SOAP Note Generation
        → Input: labeled transcript + extracted entities
        → Output: structured SOAP JSON
        → See Prompt 1 in Section 9

Step 8: SOAP Note displayed in editor
        → 4 editable sections: Subjective / Objective / Assessment / Plan
        → Doctor can edit any section
        → Doctor can request "Regenerate section" if needed

Step 9: Export
        → Click "Copy to clipboard" → copies formatted text
        → Click "Download PDF" → reportlab generates clinical note PDF
        → Saved to session history
```

**Data flow diagram:**
```
Browser Mic → AudioChunks → WebSocket → Whisper STT → Raw Transcript
                                                            ↓
                                              pyannote.audio Diarization
                                                            ↓
                                              Labeled Transcript (DOCTOR/PATIENT)
                                                            ↓
                                              scispaCy Medical NER
                                                            ↓
                                              Claude API (Prompt 1)
                                                            ↓
                                              SOAP Note JSON → Frontend Editor → PDF Export
```

---

### 7.2 Patient Side — Report Upload to Health Guide

```
Step 1: Patient opens Patient Dashboard
Step 2: Uploads file (PDF, JPG, PNG) via drag-and-drop or file picker
        → POST /patient/upload (multipart/form-data)
        → File saved temporarily to /tmp/uploads/

Step 3: Backend parses the file
        → If PDF with text: PyMuPDF (fitz) extracts text directly
        → If PDF scanned / image: Pillow preprocesses → Tesseract OCR
        → Returns: raw_text string

Step 4: Claude API Call 1 — Report Analysis
        → Input: raw_text
        → Output: structured findings JSON
        → See Prompt 2 in Section 9

Step 5: Claude API Call 2 — Plain Language Summary + Specialist
        → Input: findings JSON
        → Output: { summary, specialist_recommendations, urgency }
        → See Prompt 3 in Section 9

Step 6: Claude API Call 3 — Diet, Exercise, Precautions
        → Input: findings JSON + diagnosed conditions
        → Output: { diet_plan, exercise_plan, precautions }
        → See Prompt 4 in Section 9

Step 7: Frontend renders 4-tab Patient Dashboard
        Tab 1: Report Summary — findings table with normal/abnormal flags
        Tab 2: Specialist to Visit — recommended doctors + urgency badge
        Tab 3: Diet + Exercise — foods to eat/avoid, exercise plan
        Tab 4: Precautions — daily warnings, when to go to ER

Step 8: Patient can Download Full Health Report as PDF
        → reportlab generates branded health guide PDF
        → Includes all 4 sections + disclaimer
```

**Data flow diagram:**
```
File Upload (PDF/Image)
        ↓
PyMuPDF (text PDF) or Tesseract OCR (scanned/image)
        ↓
Raw Text Extracted
        ↓
Claude Prompt 2: Report Analysis → Findings JSON
        ↓
Claude Prompt 3: Summary + Specialist → { summary, specialist, urgency }
        ↓
Claude Prompt 4: Lifestyle Guide → { diet, exercise, precautions }
        ↓
4-Tab Patient Dashboard → Downloadable PDF Health Guide
```

---

## 8. API Endpoints

### Doctor Endpoints

```
WebSocket  ws://localhost:8000/doctor/stream-audio
           Streams audio chunks from browser, returns live transcript segments

POST       /doctor/generate-note
           Body: { transcript: [...], session_id: string }
           Returns: { soap_note: { S, O, A, P }, entities: {...} }

POST       /doctor/export-pdf
           Body: { soap_note: {...}, patient_name?: string }
           Returns: PDF file (application/pdf)

GET        /doctor/sessions
           Returns: list of past consultation sessions
```

### Patient Endpoints

```
POST       /patient/upload
           Body: multipart/form-data { file: File }
           Returns: { file_id: string, raw_text: string, file_type: string }

POST       /patient/analyze
           Body: { file_id: string, raw_text: string }
           Returns: {
             findings: [...],
             summary: string,
             specialists: [...],
             urgency: "routine" | "within_1_week" | "go_today",
             diet_plan: { eat: [...], avoid: [...] },
             exercise_plan: [...],
             precautions: { daily: [...], warnings: [...], emergency: [...] }
           }

POST       /patient/export-pdf
           Body: { analysis_result: {...}, patient_name?: string }
           Returns: PDF file (application/pdf)
```

### Health Check

```
GET        /health
           Returns: { status: "ok", version: "1.0.0" }
```

---

## 9. Claude AI Prompts

### Prompt 1 — SOAP Note Generation (Doctor Side)

```python
SOAP_NOTE_PROMPT = """
You are an expert medical scribe assistant. You will be given a labeled
doctor-patient consultation transcript and extracted medical entities.
Your task is to generate a structured SOAP clinical note.

RULES:
- Use only information explicitly stated in the transcript
- Never invent, assume, or hallucinate any medical details
- If a section has no information, write "Not documented in this consultation"
- Use standard medical abbreviations where appropriate
- Keep language professional and concise

TRANSCRIPT:
{labeled_transcript}

EXTRACTED ENTITIES:
Symptoms: {symptoms}
Medications mentioned: {medications}
Diagnoses mentioned: {diagnoses}
Vitals mentioned: {vitals}

Generate a SOAP note in the following JSON format:
{{
  "subjective": {{
    "chief_complaint": "...",
    "history_of_present_illness": "...",
    "review_of_systems": "...",
    "patient_reported_medications": "..."
  }},
  "objective": {{
    "vitals": "...",
    "physical_examination": "...",
    "relevant_findings": "..."
  }},
  "assessment": {{
    "primary_diagnosis": "...",
    "differential_diagnoses": "...",
    "clinical_impression": "..."
  }},
  "plan": {{
    "investigations_ordered": "...",
    "medications_prescribed": "...",
    "referrals": "...",
    "patient_instructions": "...",
    "follow_up": "..."
  }}
}}

Return ONLY valid JSON. No explanation, no markdown, no preamble.
"""
```

---

### Prompt 2 — Report Analysis (Patient Side)

```python
REPORT_ANALYSIS_PROMPT = """
You are a medical laboratory report analyzer. Read the following medical
report text and extract all test results in a structured format.

REPORT TEXT:
{raw_report_text}

Return a JSON object with this exact structure:
{{
  "report_type": "blood_test | urine_test | imaging | other",
  "findings": [
    {{
      "test_name": "Haemoglobin",
      "patient_value": "10.2",
      "unit": "g/dL",
      "reference_range": "12.0 - 17.5",
      "status": "low | high | normal",
      "flag": true | false
    }}
  ],
  "conditions_suggested": ["anaemia", "diabetes"],
  "critical_alerts": ["Any value requiring immediate attention"]
}}

Return ONLY valid JSON. No explanation, no markdown.
"""
```

---

### Prompt 3 — Plain Language Summary + Specialist (Patient Side)

```python
SUMMARY_SPECIALIST_PROMPT = """
You are a patient health advisor. Based on these lab findings, provide:
1. A plain-language summary a patient with no medical background can understand
2. Specialist recommendations with reasons
3. Urgency assessment

FINDINGS:
{findings_json}

RULES:
- Use simple, everyday language — avoid all medical jargon
- Be reassuring but honest about abnormal findings
- For Indian patients, use relatable context where helpful
- Never make a definitive diagnosis — say "suggests" or "may indicate"
- Always recommend consulting a doctor

Return JSON:
{{
  "plain_summary": "Your blood test results show... [2-3 sentences in simple English]",
  "what_this_means": "...[explain what the abnormal values mean for daily life]",
  "specialists": [
    {{
      "type": "Endocrinologist",
      "reason": "Your blood sugar levels are elevated, suggesting possible diabetes",
      "priority": 1
    }}
  ],
  "urgency": "routine | within_1_week | go_today",
  "urgency_reason": "..."
}}

Return ONLY valid JSON. No explanation, no markdown.
"""
```

---

### Prompt 4 — Diet, Exercise, Precautions (Patient Side)

```python
LIFESTYLE_GUIDE_PROMPT = """
You are a health and wellness advisor specializing in patient education
for Indian patients. Based on the diagnosed conditions below, provide
personalized lifestyle guidance.

CONDITIONS: {conditions}
PATIENT FINDINGS SUMMARY: {findings_summary}

Generate comprehensive lifestyle guidance in JSON format:
{{
  "diet_plan": {{
    "foods_to_eat": [
      {{
        "food": "Bitter gourd (karela)",
        "reason": "Excellent for blood sugar control",
        "how_much": "2-3 times per week"
      }}
    ],
    "foods_to_avoid": [
      {{
        "food": "White rice in large portions",
        "reason": "Causes rapid blood sugar spikes"
      }}
    ],
    "meal_timing_tips": "..."
  }},
  "exercise_plan": [
    {{
      "activity": "Brisk walking",
      "duration": "30 minutes",
      "frequency": "Daily",
      "benefit": "Lowers blood sugar and improves insulin sensitivity",
      "caution": "Check blood sugar before exercising"
    }}
  ],
  "exercises_to_avoid": ["Heavy weight lifting until sugar is controlled"],
  "precautions": {{
    "daily_habits": [
      "Check blood sugar every morning before eating",
      "Drink 8-10 glasses of water daily"
    ],
    "lifestyle_warnings": [
      "Avoid alcohol — worsens both blood sugar and anaemia",
      "Sleep 7-8 hours — poor sleep worsens insulin resistance"
    ],
    "emergency_signs": [
      "Blood sugar above 300 mg/dL — go to ER immediately",
      "Severe dizziness or fainting"
    ]
  }}
}}

Return ONLY valid JSON. No explanation, no markdown.
"""
```

---

## 10. Database Schema

```sql
-- Sessions for doctor consultations
CREATE TABLE consultation_sessions (
    id TEXT PRIMARY KEY,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    doctor_name TEXT,
    patient_identifier TEXT,
    raw_transcript TEXT,
    labeled_transcript JSON,
    extracted_entities JSON,
    soap_note JSON,
    status TEXT DEFAULT 'in_progress'  -- in_progress | completed | exported
);

-- Patient report analyses
CREATE TABLE patient_analyses (
    id TEXT PRIMARY KEY,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    file_name TEXT,
    file_type TEXT,
    raw_text TEXT,
    findings JSON,
    summary TEXT,
    specialists JSON,
    urgency TEXT,
    diet_plan JSON,
    exercise_plan JSON,
    precautions JSON
);
```

---

## 11. Day-by-Day Build Plan

### Phase 1 — Foundation + Doctor Audio Side (Days 1–5)

| Day | Task | Output |
|-----|------|--------|
| 1 | Project setup: FastAPI skeleton, React app, .env config, install all deps | Running hello world on both ends |
| 2 | Browser mic capture with Web Audio API, WebSocket connection to backend | Audio chunks streaming to backend |
| 3 | Integrate Whisper STT — receive audio, return transcript | Raw text transcript from speech |
| 4 | pyannote.audio diarization — label DOCTOR / PATIENT segments | Labeled transcript |
| 5 | Live transcript frontend — color-coded speaker segments | Real-time transcript display |

**Milestone:** Speak for 30 seconds, see a live labeled transcript on screen.

---

### Phase 2 — SOAP Note Generation (Days 6–8)

| Day | Task | Output |
|-----|------|--------|
| 6 | scispaCy NER — extract symptoms, medications, diagnoses from transcript | Entities JSON |
| 7 | Claude API integration — Prompt 1 SOAP note generation | SOAP note JSON from Claude |
| 8 | SOAP note editor UI — 4 editable sections, save/copy/PDF export | Full doctor workflow working |

**Milestone:** Full doctor side works end-to-end. Speak → transcript → SOAP note → export.

---

### Phase 3 — Patient Report Upload + Analysis (Days 9–13)

| Day | Task | Output |
|-----|------|--------|
| 9 | File upload endpoint — accept PDF and images, save to /tmp | File saved, file_id returned |
| 10 | PyMuPDF text extraction + Tesseract OCR fallback | Raw text from any report type |
| 11 | Claude Prompt 2 — Report analysis, findings JSON | Structured findings with flags |
| 12 | Claude Prompt 3 — Plain language summary + specialist routing | Summary + specialist JSON |
| 13 | Claude Prompt 4 — Diet, exercise, precaution plan | Full lifestyle guide JSON |

**Milestone:** Upload a blood report PDF, receive all 4 AI-generated sections in JSON.

---

### Phase 4 — Patient Dashboard UI (Days 14–16)

| Day | Task | Output |
|-----|------|--------|
| 14 | Report Summary tab — findings table, normal/abnormal color flags | Tab 1 working |
| 15 | Specialist Guide tab + Diet & Exercise tab | Tabs 2 and 3 working |
| 16 | Precautions tab + PDF export for patient health guide | Full patient UI working |

**Milestone:** Complete patient flow — upload report, see all 4 tabs, download PDF guide.

---

### Phase 5 — Safety, Polish, Demo Prep (Days 17–20)

| Day | Task | Output |
|-----|------|--------|
| 17 | Add confidence flags on low-confidence transcript segments | Yellow-highlighted uncertain segments |
| 18 | Safety disclaimers on all AI outputs, error handling, loading states | Production-quality UX |
| 19 | Prepare 3 demo scenarios with sample reports and audio clips | Demo-ready data |
| 20 | Pitch deck (5 slides), rehearse demo, final bug fixes | Hackathon-ready |

**Milestone:** Flawless 3-minute demo. Both sides work perfectly with pre-loaded demo data.

---

## 12. Environment Variables

Create a `.env` file in `/backend/`:

```env
# Anthropic Claude API
ANTHROPIC_API_KEY=your_anthropic_api_key_here
CLAUDE_MODEL=claude-sonnet-4-5

# App settings
APP_HOST=0.0.0.0
APP_PORT=8000
ENVIRONMENT=development

# File upload
UPLOAD_DIR=/tmp/medisense_uploads
MAX_FILE_SIZE_MB=20
ALLOWED_FILE_TYPES=application/pdf,image/jpeg,image/png

# Whisper model (tiny/base/small/medium/large)
WHISPER_MODEL=base

# Database
DATABASE_URL=sqlite:///./medisense.db

# CORS
FRONTEND_URL=http://localhost:5173

# Optional: Deepgram (alternative to Whisper for faster cloud STT)
# DEEPGRAM_API_KEY=your_deepgram_key_here
```

---

## 13. Installation & Setup

### Backend Setup

```bash
# Clone and navigate
cd medisense-ai/backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install fastapi uvicorn python-multipart anthropic openai-whisper \
  pyannote.audio scispacy pymupdf pytesseract pillow reportlab \
  python-dotenv sqlalchemy pydantic

# Install scispaCy medical model
pip install https://s3-us-west-2.amazonaws.com/ai2-s2-scispacy/releases/v0.5.1/en_core_sci_sm-0.5.1.tar.gz

# Install Tesseract (for OCR)
# Ubuntu/Debian: sudo apt-get install tesseract-ocr
# macOS: brew install tesseract
# Windows: Download installer from github.com/UB-Mannheim/tesseract

# Copy and fill environment variables
cp .env.example .env
# Edit .env with your API keys

# Run backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Setup

```bash
cd medisense-ai/frontend

# Install dependencies
npm install

# Start development server
npm run dev
# Runs on http://localhost:5173
```

### Verify Setup

```bash
# Check backend health
curl http://localhost:8000/health

# Expected response:
# {"status": "ok", "version": "1.0.0"}
```

---

## 14. Frontend Components

### Key Component Interfaces

```typescript
// types/doctor.types.ts
export interface TranscriptSegment {
  speaker: 'DOCTOR' | 'PATIENT';
  text: string;
  start: number;
  end: number;
  confidence?: number;
}

export interface SoapNote {
  subjective: {
    chief_complaint: string;
    history_of_present_illness: string;
    review_of_systems: string;
    patient_reported_medications: string;
  };
  objective: {
    vitals: string;
    physical_examination: string;
    relevant_findings: string;
  };
  assessment: {
    primary_diagnosis: string;
    differential_diagnoses: string;
    clinical_impression: string;
  };
  plan: {
    investigations_ordered: string;
    medications_prescribed: string;
    referrals: string;
    patient_instructions: string;
    follow_up: string;
  };
}

// types/patient.types.ts
export interface Finding {
  test_name: string;
  patient_value: string;
  unit: string;
  reference_range: string;
  status: 'low' | 'high' | 'normal';
  flag: boolean;
}

export interface Specialist {
  type: string;
  reason: string;
  priority: number;
}

export type UrgencyLevel = 'routine' | 'within_1_week' | 'go_today';

export interface DietItem {
  food: string;
  reason: string;
  how_much?: string;
}

export interface ExerciseItem {
  activity: string;
  duration: string;
  frequency: string;
  benefit: string;
  caution?: string;
}

export interface PatientAnalysis {
  findings: Finding[];
  plain_summary: string;
  what_this_means: string;
  specialists: Specialist[];
  urgency: UrgencyLevel;
  urgency_reason: string;
  diet_plan: {
    foods_to_eat: DietItem[];
    foods_to_avoid: DietItem[];
    meal_timing_tips: string;
  };
  exercise_plan: ExerciseItem[];
  exercises_to_avoid: string[];
  precautions: {
    daily_habits: string[];
    lifestyle_warnings: string[];
    emergency_signs: string[];
  };
}
```

### AudioRecorder Hook

```typescript
// hooks/useAudioRecorder.ts
// This hook manages microphone access, audio capture,
// and WebSocket streaming to the backend.
// Key functions to implement:
// - startRecording(): request mic permission, open WebSocket, stream chunks
// - stopRecording(): close WebSocket, trigger SOAP note generation
// - onTranscriptUpdate(callback): called with each new TranscriptSegment
```

---

## 15. Testing Strategy

### Sample Test Cases

```python
# tests/test_claude_service.py

# Test 1: SOAP note generation
# Input: Sample chest pain consultation transcript
# Expected: JSON with all 4 SOAP sections populated

# Test 2: Report analysis
# Input: Diabetes blood report text (glucose: 142 mg/dL, HbA1c: 7.8%)
# Expected: findings with glucose and HbA1c flagged as HIGH

# Test 3: Specialist routing
# Input: High blood sugar findings
# Expected: Endocrinologist as primary recommendation, urgency: within_1_week

# Test 4: Lifestyle guide
# Input: Condition = ["type_2_diabetes", "anaemia"]
# Expected: karela in diet, walking in exercise, blood sugar checks in precautions

# Test 5: Edge case — normal report
# Input: All values within reference range
# Expected: All findings marked normal, urgency: routine, GP recommendation
```

### Sample Demo Reports to Create

```
demo/sample_reports/
├── diabetes_blood_report.pdf
│   Glucose: 142 mg/dL (High), HbA1c: 7.8% (High),
│   Haemoglobin: 10.2 g/dL (Low), Cholesterol: 218 mg/dL (Borderline)
│
├── low_haemoglobin_cbc.pdf
│   Haemoglobin: 8.5 g/dL (Low), MCV: 65 fL (Low),
│   Iron: 38 ug/dL (Low) — classic iron deficiency anaemia
│
└── liver_function_test.pdf
    SGPT/ALT: 68 U/L (High), SGOT/AST: 52 U/L (High),
    Bilirubin: 1.8 mg/dL (Borderline) — suggests hepatic stress
```

---

## 16. Demo Scenarios

### Demo Scenario 1 — Doctor Side (Chest Pain Consultation)

**Script to read aloud during demo:**
```
Doctor: Good morning, what brings you in today?
Patient: I've been having chest tightness since this morning, doctor.
Doctor: Can you describe the pain? Is it sharp or dull?
Patient: More like pressure, maybe 6 out of 10. It gets worse when I climb stairs.
Doctor: Any shortness of breath or sweating?
Patient: A little breathless, yes. No fever though.
Doctor: Have you had any heart problems before?
Patient: No, this is the first time. I'm 45 years old.
Doctor: Okay. I'm going to order an ECG and troponin blood test.
         Avoid any strenuous activity until we get the results.
         Come back in 48 hours or go to the ER if the pain gets worse.
```

**Expected SOAP output:**
- S: Chest pressure 6/10, worse on exertion, mild dyspnoea, 45M no prior cardiac history
- O: No fever reported, no vitals documented in consultation
- A: Possible musculoskeletal or cardiac origin chest pain, rule out ACS
- P: ECG ordered, troponin blood test, avoid exertion, follow up 48hrs or ER if worse

---

### Demo Scenario 2 — Patient Side (Diabetes Blood Report)

**Upload:** `diabetes_blood_report.pdf`

**Expected output across 4 tabs:**
- Tab 1: Glucose HIGH (142), HbA1c HIGH (7.8%), Haemoglobin LOW (10.2), Cholesterol BORDERLINE
- Tab 2: Endocrinologist (diabetes), Haematologist (anaemia) — Urgency: Within 1 week
- Tab 3: Eat karela, palak, moong dal. Avoid maida, sugary drinks. Walk 30 min daily.
- Tab 4: Check sugar daily, inspect feet, drink 8-10 glasses water, no alcohol

---

### Demo Scenario 3 — Patient Side (Liver Function Test)

**Upload:** `liver_function_test.pdf`

**Expected output:**
- Tab 1: SGPT HIGH (68), SGOT HIGH (52), Bilirubin BORDERLINE
- Tab 2: Gastroenterologist / Hepatologist — Urgency: Within 1 week
- Tab 3: Avoid alcohol completely, eat papaya, avoid oily food, gentle yoga only
- Tab 4: No alcohol, no paracetamol in excess, stay hydrated

---

## 17. Safety & Disclaimers

### Required Disclaimers

Every AI-generated output MUST include this disclaimer:

```
⚠️ IMPORTANT: This information is AI-generated and is for educational
purposes only. It is NOT a substitute for professional medical advice,
diagnosis, or treatment. Always consult a qualified healthcare provider
before making any health decisions. If you are experiencing a medical
emergency, call emergency services immediately.
```

### Safety Rules for Claude Prompts

1. **Never make definitive diagnoses** — use "suggests", "may indicate", "consistent with"
2. **Never recommend specific drug doses** — say "your doctor will prescribe appropriate medication"
3. **Never contradict an existing prescription** — say "discuss with your doctor before changing"
4. **Always include emergency warning signs** — when to call 911 / go to ER
5. **Flag low-confidence transcription** — yellow-highlight uncertain segments in doctor side
6. **Doctor review is mandatory** — SOAP notes are drafts until doctor approves

### Claude Prompt Safety System Message

Add this as a system message to ALL Claude API calls:

```python
SAFETY_SYSTEM_MESSAGE = """
You are a medical AI assistant. You must follow these safety rules at all times:
1. Never invent, hallucinate, or assume medical information not present in the input
2. Never provide specific drug dosages or treatment protocols
3. Never make definitive diagnoses — use qualifying language
4. Always recommend consulting a licensed medical professional
5. If you detect any life-threatening emergency signs in the input, flag them prominently
6. All output is a draft for professional review — never final medical advice
"""
```

---

## Appendix — Quick Reference Commands

```bash
# Start backend (from /backend/)
uvicorn main:app --reload --port 8000

# Start frontend (from /frontend/)
npm run dev

# Run tests
pytest tests/ -v

# Check Claude API connection
python -c "import anthropic; c = anthropic.Anthropic(); print('Connected:', c.models.list())"

# Generate sample PDF report for testing
python demo/generate_sample_report.py

# Format code
black backend/
prettier --write "frontend/src/**/*.{ts,tsx}"
```

---

*MediSense AI — Built for [Your Company Hackathon] | Powered by Claude API*
*Always consult a qualified healthcare professional for medical decisions.*
