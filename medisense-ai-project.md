# MediSense AI — Complete Development Blueprint

> **AI-Powered Health Intelligence Platform**
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
8. [API Endpoints](#8-api-endpoints)
9. [AI Prompts](#9-ai-prompts)
10. [Database Schema](#10-database-schema)
11. [Environment Variables](#11-environment-variables)
12. [Installation & Setup](#12-installation--setup)
13. [Frontend Components & Types](#13-frontend-components--types)
14. [Demo Scenarios](#14-demo-scenarios)
15. [Safety & Disclaimers](#15-safety--disclaimers)

---

## 1. Project Overview

**Project Name:** MediSense AI

**Tagline:** From consultation to care — AI-powered health intelligence for doctors and patients.

**Type:** Full-stack web application (Doctor side + Patient side + Patient AI Chatbot + Google Meet consultations)

**Core AI:** OpenRouter API (default model: `openai/gpt-4o-mini`) for all intelligence tasks. Sarvam AI for Indic STT/TTS in the patient chatbot.

**Key Differentiators:**
- Three distinct AI workflows in one platform
- Persistent patient chatbot ("Medisense AI") with cross-session memory and voice I/O
- Google Meet consultations with automatic transcript → SOAP processing (no in-app video room — uses the user's existing Meet client and Calendar)
- JWT auth with role-based access (doctor / patient)
- Runs on SQLite (dev) and PostgreSQL (prod) without code changes

---

## 2. Problem Statement

### Problem 1 — Doctor Side (Documentation Burden)
- Physicians spend **9 minutes on EHR** for every 15 minutes of patient care
- **43% of physicians** experience burnout — documentation is the #1 cause
- Doctors spend **2+ hours daily** writing clinical notes manually

### Problem 2 — Patient Side (Health Literacy Gap)
- **90% of adults** struggle to understand health information effectively
- Only **12% of US adults** have proficient health literacy
- Patients don't know: which doctor to see, what to eat, what exercises are safe

### Problem 3 — Continuity of Care
- Patients forget post-consultation advice within hours
- No persistent AI companion that remembers a patient's full medical history
- Disconnected tools for consultations, reports, and follow-up

---

## 3. Solution Summary

MediSense AI is a **multi-sided AI health platform**:

### Doctor Side
- Records consultation audio in real time
- Transcribes speech using Gemini Flash (STT via OpenRouter)
- Labels Doctor vs Patient speech (speaker diarization)
- Extracts medical entities (symptoms, drugs, diagnoses)
- Auto-generates a structured SOAP clinical note
- Doctor reviews, edits, and exports as PDF

### Patient Side — Report Analysis
- Patient uploads blood report / lab result / prescription (PDF or image)
- OCR extracts text from uploaded file
- AI analyzes the report and produces: plain-language summary, flagged abnormal values, specialist recommendations, diet plan, exercise plan, daily precautions

### Patient Side — Medisense AI Chatbot
- Persistent AI medical companion that remembers patient history
- Injects uploaded report summaries + past session summaries into context
- Supports file attachments (images + PDFs) with vision AI analysis
- Auto-generates session titles and summaries for easy reference
- Full chat history with grouped sessions (Today, Yesterday, etc.)

### Video Consultations (Google Meet)
- Doctor or patient schedules a meeting from `/consultation/schedule`
- Backend creates a Google Calendar event with an auto-generated Meet link, emails both parties, and persists a `ConsultationSession` row in `status="scheduled"`
- The Meet conference id is parsed out of the Meet URL at scheduling time, so the session is immediately ready for transcript processing
- Both parties join the standard Google Meet client (browser or native)
- After the call, the doctor opens **Doctor Dashboard → Process Google Meet Consultation**, picks the unprocessed session, and the backend runs the transcript through the diarization → NER → SOAP pipeline as a `BackgroundTask`
- A signed `POST /meet/webhook` (HMAC-SHA256) is also available for fully automatic post-call processing
- A patient-friendly explanation of the SOAP note is generated for the patient

> The previous in-app WebRTC room (`ConsultationRoom.tsx`, `JoinConsultation.tsx`, `routers/consultation.py`, the `consultation/` component directory and `consultationApi.ts`) was removed in May 2026. Google Meet is now the only video-call surface.

---

## 4. System Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                       FRONTEND (React 19 + Vite)                  │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │   Doctor      │  │   Patient    │  │   Patient Chatbot    │   │
│  │   Dashboard   │  │   Dashboard  │  │   (Medisense AI)     │   │
│  │  - Record     │  │  - Upload    │  │  - Persistent chat   │   │
│  │  - Transcript │  │  - 4-tab UI  │  │  - File attachments  │   │
│  │  - SOAP edit  │  │  - PDF guide │  │  - Voice in / out    │   │
│  │  - Process    │  │              │  │  - Session history   │   │
│  │    Meet       │  │              │  │                      │   │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘   │
│         │                 │                      │               │
│  ┌──────┴─────────────────┴──────────────────────┴───────────┐   │
│  │      Schedule Page  ──▶  Google Meet (external client)     │   │
│  └────────────────────────────┬───────────────────────────────┘   │
└───────────────────────────────┼───────────────────────────────────┘
                                │ HTTP + 1 WebSocket (doctor STT)
                                ▼
┌───────────────────────────────────────────────────────────────────┐
│                      BACKEND (FastAPI, /api prefix)                │
│                                                                   │
│  Auth (JWT) ─── Doctor ─── Patient ─── Chatbot widget             │
│  Patient Chatbot (Medisense AI) ─── Meet ─── Google OAuth         │
│                                                                   │
│  Services: claude_service, transcription, diarization, ner,       │
│           report_parser, pdf_export, auth_service,                │
│           chatbot_agent, patient_chatbot, google_calendar,        │
│           sarvam_stt_service, sarvam_tts_service                  │
│                                                                   │
│  Prompts: prompts/*.txt (9 prompt files loaded at import)         │
│  Database: SQLAlchemy async — SQLite (dev) or Postgres (prod),   │
│            7 tables, idempotent ALTER-TABLE migrations.           │
└───────────────────────────────┬───────────────────────────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                 │
    ┌─────────▼──────┐  ┌──────▼───────┐  ┌──────▼──────┐
    │  OpenRouter API │  │  Sarvam AI   │  │  Google     │
    │  (gpt-4o-mini)  │  │  (STT/TTS)   │  │  Calendar / │
    │                 │  │              │  │  Meet       │
    └────────────────┘  └──────────────┘  └─────────────┘
```

---

## 5. Tech Stack

### Backend
| Tool | Purpose |
|------|---------|
| Python 3.11+ | Primary language |
| FastAPI | REST API + WebSockets |
| Uvicorn | ASGI server |
| OpenAI SDK | LLM calls via OpenRouter (all AI) |
| OpenAI Agents SDK | Multi-agent chatbot orchestration |
| Sarvam AI SDK | Indic STT (saaras:v3) + TTS (bulbul:v3) |
| PyMuPDF (fitz) | PDF text extraction |
| Pillow | Image processing for vision OCR pipeline |
| ReportLab | PDF generation |
| SQLAlchemy (async) | ORM with SQLite |
| bcrypt + PyJWT | Authentication |
| pydantic-settings | Configuration from .env |
| Google API Client | Calendar + Meet integration |

> **No local models**: Diarization uses pause-based heuristics, NER uses regex, OCR uses OpenRouter vision models. Nothing is downloaded or run locally.

### Frontend
| Tool | Purpose |
|------|---------|
| React 19 | UI framework |
| TypeScript 5+ | Type safety |
| Vite | Build tool + dev server |
| Vanilla CSS | Glassmorphism styling (no Tailwind) |
| WebSocket API | Real-time STT streaming on the doctor side |
| Google Meet (external) | Video consultations — opened from `SchedulePage.tsx` |

---

## 6. Project Structure

```
MediSenseAI/
├── backend/
│   ├── main.py                        # FastAPI app + lifespan + CORS
│   ├── config.py                      # Settings loaded from .env (no prompts)
│   ├── database.py                    # 7 ORM models + init_db with migrations
│   ├── requirements.txt
│   ├── .env                           # All env vars (not committed to git)
│   ├── prompts/                       # AI prompt templates (plain-text files)
│   │   ├── __init__.py                # Loader — reads .txt, exports constants
│   │   ├── soap_note.txt              # SOAP note generation
│   │   ├── report_analysis.txt        # Medical report analysis
│   │   ├── summary_specialist.txt     # Summary + specialist routing
│   │   ├── lifestyle_guide.txt        # Diet/exercise/precautions
│   │   ├── patient_explanation.txt    # Post-call patient guide
│   │   ├── patient_chatbot_system.txt # Medisense AI system prompt
│   │   ├── patient_chatbot_summary.txt # Session summary prompt
│   │   ├── chatbot_system.txt         # Website chatbot prompt
│   │   └── safety_system.txt          # Safety guardrails
│   ├── routers/                       # 7 routers, all mounted under /api
│   │   ├── auth.py                    # POST /auth/register, /auth/login, GET /auth/me
│   │   ├── doctor.py                  # WS /doctor/stream-audio, POST /doctor/generate-note, /export-pdf, GET /sessions
│   │   ├── patient.py                 # POST /patient/upload, /analyze, /export-pdf, GET /history*
│   │   ├── chatbot.py                 # POST /chatbot/message
│   │   ├── patient_chatbot.py         # Medisense AI sessions + messages + voice + TTS + attachments
│   │   ├── meet.py                    # Schedule + list + Meet transcript processing + webhook
│   │   └── google_oauth.py            # Google Calendar OAuth flow
│   ├── services/
│   │   ├── claude_service.py          # All LLM calls via OpenRouter + vision OCR
│   │   ├── transcription.py           # STT (Gemini Flash via OpenRouter)
│   │   ├── diarization.py             # Speaker labeling (pause-based heuristic)
│   │   ├── ner.py                     # Medical NER (regex keyword matching)
│   │   ├── report_parser.py           # PyMuPDF + OpenRouter vision OCR
│   │   ├── pdf_export.py              # ReportLab PDF generation
│   │   ├── auth_service.py            # bcrypt hashing + JWT
│   │   ├── chatbot_agent.py           # Website chatbot multi-agent system
│   │   ├── patient_chatbot.py         # Medisense AI memory + agent
│   │   ├── google_calendar.py         # Google Calendar + Meet link creation
│   │   ├── sarvam_stt_service.py      # Sarvam AI speech-to-text
│   │   └── sarvam_tts_service.py      # Sarvam AI text-to-speech
│   ├── models/
│   │   ├── auth_models.py
│   │   ├── doctor_models.py
│   │   ├── patient_models.py
│   │   ├── chatbot_models.py
│   │   └── patient_chatbot_models.py
│   ├── scripts/
│   │   └── setup_google_calendar.py   # One-time Google OAuth setup
│   └── utils/
│       ├── helpers.py
│       └── storage.py
│
├── frontend/src/
│   ├── App.tsx                        # Landing page + Navbar + Routes
│   ├── index.css                      # Design system (glassmorphism, CSS vars)
│   ├── main.tsx
│   ├── pages/                         # 14 pages — no in-app video room
│   │   ├── Login.tsx, Register.tsx
│   │   ├── DoctorDashboard.tsx        # Audio → SOAP + Process Google Meet section
│   │   ├── PatientDashboard.tsx
│   │   ├── PatientChat.tsx            # Medisense AI chatbot UI
│   │   ├── SchedulePage.tsx           # Doctor + patient scheduling
│   │   └── [8 marketing pages]
│   ├── components/
│   │   ├── ChatbotWidget.tsx, ProtectedRoute.tsx, ScrollToTop.tsx
│   │   ├── doctor/     (AudioRecorder, LiveTranscript, SoapNoteEditor)
│   │   └── patient/    (ReportUploader, ReportSummary, SpecialistGuide, DietExercisePlan, PrecautionsList)
│   ├── api/            (authApi, doctorApi, patientApi, chatbotApi,
│   │                    patientChatbotApi, meetApi, googleIntegrationApi)
│   ├── contexts/       (AuthContext)
│   ├── hooks/          (useAudioRecorder, useWebSocket)
│   └── types/          (auth, doctor, patient, consultation [Google types only],
│                        chatbot, patientChatbot)
│
├── demo/
│   ├── sample_reports/
│   ├── sample_transcripts/
│   └── generate_sample_reports.py
│
├── CLAUDE.md
├── README.md
└── medisense-ai-project.md (this file)
```

---

## 7. Module Workflows

### 7.1 Doctor Side — Audio to SOAP Note

```
Browser Mic → AudioChunks → WebSocket → Gemini Flash STT → Raw Transcript
                                                    ↓
                                      Pause-Based Speaker Diarization
                                                    ↓
                                      Labeled Transcript (DOCTOR/PATIENT)
                                                    ↓
                                      Regex Medical NER
                                                    ↓
                                      AI (Prompt 1) → SOAP Note JSON
                                                    ↓
                                      Frontend Editor → PDF Export
```

### 7.2 Patient Side — Report Upload to Health Guide

```
File Upload (PDF/Image)
        ↓
PyMuPDF (text PDF) or OpenRouter Vision OCR (scanned/image)
        ↓
Raw Text Extracted
        ↓
AI Prompt 2: Report Analysis → Findings JSON
        ↓
AI Prompt 3: Summary + Specialist → { summary, specialist, urgency }
        ↓
AI Prompt 4: Lifestyle Guide → { diet, exercise, precautions }
        ↓
4-Tab Patient Dashboard → Downloadable PDF Health Guide
```

### 7.3 Patient Chatbot — Medisense AI

```
Patient opens /patient/chat
        ↓
System loads: patient profile + report summaries + past session summaries
        ↓
System prompt injected with full patient context
        ↓
Patient sends message (optionally with image/PDF attachments)
        ↓
If attachments: base64-encoded, sent to vision model for analysis
        ↓
AI responds with personalized, history-aware medical guidance
        ↓
Every N messages: auto-generate session summary for future memory
        ↓
On session end: final summary stored, sidebar refreshes
```

### 7.4 Google Meet Consultation (schedule → call → SOAP)

```
Doctor or patient opens /consultation/schedule and submits the form
        ↓
POST /api/meet/schedule
        ↓
google_calendar.create_meeting_event(...)
   → Google Calendar event with auto-generated Meet link
   → Email invite sent to the other party
        ↓
ConsultationSession row persisted (status="scheduled")
   → meet_link, google_event_id, google_event_link, google_invite_status
   → meet_conference_id auto-extracted from the Meet URL
   → processing_status = "pending"
        ↓
Both parties join Google Meet at the scheduled time (external client)
        ↓
After the call ends:
        ↓
Doctor opens Doctor Dashboard → "Process Google Meet Consultation"
        ↓
POST /api/meet/process-transcript {session_id, meet_conference_id?}
        ↓
BackgroundTask: fetch transcript → diarization → NER → SOAP (Prompt 1)
                                            → patient explanation (Prompt 5)
        ↓
Frontend polls GET /api/meet/process-status/{task_id}
        ↓
SoapNoteEditor renders the result; patient explanation stored on the session
        ↓
(Optional) POST /api/meet/webhook (HMAC-SHA256) can trigger the same
            pipeline automatically when Google reports "meeting ended".
```

---

## 8. API Endpoints

### Auth
```
POST  /auth/register    { email, password, full_name, role }  →  { user, token }
POST  /auth/login       { email, password }                   →  { user, token }
GET   /auth/me          (Bearer token)                        →  { user }
```

All routers are mounted under the `/api` prefix.

### Auth
```
POST  /api/auth/register   { email, password, full_name, role }  →  { user, token }
POST  /api/auth/login      { email, password }                   →  { user, token }
GET   /api/auth/me         (Bearer token)                        →  { user }
```

### Doctor
```
WS    /api/doctor/stream-audio       Streams audio chunks, returns transcript segments
POST  /api/doctor/generate-note      { transcript, session_id }  →  { soap_note, entities }
POST  /api/doctor/export-pdf         { soap_note }               →  PDF file
GET   /api/doctor/sessions           List past consultation sessions
```

### Patient
```
POST  /api/patient/upload                 multipart { file }     →  { file_id, raw_text }
POST  /api/patient/analyze                { file_id, raw_text }  →  { findings, summary, diet, ... }
POST  /api/patient/export-pdf             { analysis_result }    →  PDF file
GET   /api/patient/history                                       →  list of past analyses
GET   /api/patient/history/{record_id}                           →  full record
GET   /api/patient/history/{record_id}/file                      →  original uploaded file
GET   /api/patient/history/{record_id}/pdf                       →  generated health-guide PDF
```

### Google Meet (scheduling + transcript processing)
```
POST  /api/meet/schedule                {doctor_name, patient_name, scheduled_at,
                                         duration_minutes, reason,
                                         patient_email?, doctor_email?}
                                                            →  ScheduledMeetingDTO
GET   /api/meet/scheduled                                   →  { meetings: [...] }
GET   /api/meet/sessions/unprocessed                        →  list of sessions ready to process
POST  /api/meet/link-conference         {session_id, meet_conference_id, ...}
                                                            →  { session_id, status }
POST  /api/meet/process-transcript      {session_id, meet_conference_id?}
                                                            →  { task_id, status }
GET   /api/meet/process-status/{task_id}                    →  { status, soap_note, patient_explanation, ... }
POST  /api/meet/webhook                 (HMAC-SHA256 signed)→  triggers processing on "meeting ended"
```

### Google Calendar OAuth
```
GET   /api/integrations/google/status                       →  { connected, email }
GET   /api/integrations/google/auth-url                     →  { auth_url, state }
GET   /api/integrations/google/callback                     OAuth redirect target
POST  /api/integrations/google/disconnect                   →  { ok: true }
```

### Patient Chatbot (Medisense AI)
```
POST  /api/patient-chat/message                  { session_id?, message, attachments[] }  →  { reply, session_id, ... }
GET   /api/patient-chat/history/{patient_id}                                              →  { sessions[] }
GET   /api/patient-chat/session/{session_id}                                              →  { messages[] }
POST  /api/patient-chat/session/end              { session_id }                           →  { summary }
POST  /api/patient-chat/voice-message            { audio_base64, mime_type }              →  { transcript }
POST  /api/patient-chat/tts                      { text }                                  →  { audio_base64, mime_type }
GET   /api/patient-chat/attachment/{attachment_id}                                        →  raw bytes
```

### Website Chatbot
```
POST  /api/chatbot/message    { message, session_id? }  →  { reply, session_id }
```

### System
```
GET   /health   (also /api/health)   →  { status, version, model, environment }
GET   /                              →  { message, docs, health }
```

---

## 9. AI Prompts

All prompts live in the `prompts/` folder as plain-text `.txt` files. They are loaded at import time by `prompts/__init__.py` and exported as Python constants. Import them via `from prompts import SOAP_NOTE_PROMPT`.

| # | File | Constant | Used By | Purpose |
|---|------|----------|---------|---------|
| 1 | `soap_note.txt` | `SOAP_NOTE_PROMPT` | Doctor/Consultation | Generate structured SOAP note from transcript + entities |
| 2 | `report_analysis.txt` | `REPORT_ANALYSIS_PROMPT` | Patient | Extract findings from any medical report type |
| 3 | `summary_specialist.txt` | `SUMMARY_SPECIALIST_PROMPT` | Patient | Plain-language summary + specialist routing |
| 4 | `lifestyle_guide.txt` | `LIFESTYLE_GUIDE_PROMPT` | Patient | Diet, exercise, precautions tailored to conditions |
| 5 | `patient_explanation.txt` | `PATIENT_EXPLANATION_PROMPT` | Consultation | Post-call patient-friendly explanation of SOAP note |
| 6 | `patient_chatbot_system.txt` | `PATIENT_CHATBOT_SYSTEM_PROMPT` | Medisense AI | System prompt with patient profile + memory injection |
| 7 | `patient_chatbot_summary.txt` | `PATIENT_CHATBOT_SUMMARY_PROMPT` | Medisense AI | Auto-summarize chat sessions for future memory |
| 8 | `chatbot_system.txt` | `CHATBOT_SYSTEM_PROMPT` | Website widget | Visitor-facing support chatbot personality |
| 9 | `safety_system.txt` | `SAFETY_SYSTEM_MESSAGE` | All AI calls | Medical safety guardrails prepended to every call |

---

## 10. Database Schema

7 tables managed by SQLAlchemy async ORM. Works against SQLite (dev) or PostgreSQL via `asyncpg` (prod). Schema additions are applied as idempotent `ALTER TABLE ADD COLUMN` migrations in `init_db()`.

```sql
-- Auth (extended with Google OAuth fields used by routers/google_oauth.py)
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    created_at TIMESTAMP,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL,                 -- "doctor" | "patient"
    google_refresh_token TEXT,          -- per-user Calendar OAuth (optional)
    google_calendar_email TEXT
);

-- Doctor consultations + scheduled Google Meet consultations.
-- A single row carries both: status starts "scheduled" if created via /meet/schedule,
-- or "in_progress" if started via the doctor audio-recording flow.
CREATE TABLE consultation_sessions (
    id TEXT PRIMARY KEY,
    created_at TIMESTAMP,
    doctor_id TEXT REFERENCES users(id),
    doctor_name TEXT,
    patient_identifier TEXT,
    patient_name TEXT,
    raw_transcript TEXT,
    labeled_transcript TEXT,            -- JSON
    extracted_entities TEXT,            -- JSON
    soap_note TEXT,                     -- JSON
    soap_pdf_path TEXT,
    soap_pdf_size INTEGER,
    status TEXT DEFAULT 'in_progress',  -- "scheduled" | "in_progress" | "completed"

    -- Google Meet linkage
    meet_conference_id TEXT,            -- e.g. "tie-mhnt-nii", parsed from Meet URL
    processing_status TEXT,             -- "pending" | "running" | "completed" | "failed"
    processing_task_id TEXT,

    -- Scheduling fields (added when created via /meet/schedule)
    scheduled_at TIMESTAMP,             -- TIMESTAMP WITHOUT TIME ZONE; stored as UTC-naive
    duration_minutes INTEGER,
    reason TEXT,
    patient_email TEXT,
    doctor_email TEXT,
    organizer_id TEXT REFERENCES users(id),
    organizer_role TEXT,                -- "doctor" | "patient"

    -- Google Calendar / Meet artifacts
    meet_link TEXT,                     -- e.g. "https://meet.google.com/tie-mhnt-nii"
    google_event_id TEXT,
    google_event_link TEXT,
    google_invite_status TEXT,          -- "sent" | "skipped" | "failed"
    google_invite_error TEXT
);

-- ⚠️ Datetime gotcha: scheduled_at is naive. The frontend sends an ISO string with a
-- Z/offset, so routers/meet.py converts the parsed datetime to UTC and strips tzinfo
-- before insert. asyncpg refuses to bind a tz-aware datetime against a naive column.

-- Website chatbot widget
CREATE TABLE chatbot_sessions (
    id TEXT PRIMARY KEY,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    user_id TEXT REFERENCES users(id),
    message_count INTEGER DEFAULT 0,
    messages TEXT  -- JSON list
);

-- Patient report analyses
CREATE TABLE patient_analyses (
    id TEXT PRIMARY KEY,
    created_at TIMESTAMP,
    patient_id TEXT REFERENCES users(id),
    file_name TEXT, file_type TEXT,
    uploaded_file_path TEXT, uploaded_file_size INTEGER,
    raw_text TEXT,
    findings TEXT, summary TEXT, specialists TEXT,
    urgency TEXT, diet_plan TEXT, exercise_plan TEXT, precautions TEXT,
    generated_pdf_path TEXT, generated_pdf_size INTEGER
);

-- Medisense AI chat sessions
CREATE TABLE patient_chat_sessions (
    id TEXT PRIMARY KEY,
    patient_id TEXT REFERENCES users(id) NOT NULL,
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    title TEXT,
    session_summary TEXT,
    message_count INTEGER DEFAULT 0,
    last_summary_at_count INTEGER DEFAULT 0
);

-- Medisense AI chat messages
CREATE TABLE patient_chat_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES patient_chat_sessions(id) NOT NULL,
    patient_id TEXT REFERENCES users(id) NOT NULL,
    role TEXT NOT NULL,  -- "user" | "assistant"
    content TEXT NOT NULL,
    created_at TIMESTAMP,
    message_metadata TEXT,   -- JSON
    file_references TEXT     -- JSON list of {filename, mime_type, size_bytes, kind}
);

-- Audit trail
CREATE TABLE patient_chat_audit (
    id TEXT PRIMARY KEY,
    patient_id TEXT REFERENCES users(id) NOT NULL,
    action TEXT NOT NULL,
    timestamp TIMESTAMP,
    ip_address TEXT,
    detail TEXT
);
```

---

## 11. Environment Variables

Create `/backend/.env`:

```env
# ── OpenRouter / LLM
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
AI_MODEL=openai/gpt-4o-mini
CHATBOT_MODEL=openai/gpt-4o-mini
PATIENT_CHATBOT_MODEL=openai/gpt-4o-mini
PATIENT_CHATBOT_SUMMARY_EVERY=10
VISION_MODEL=openai/gpt-4o-mini
MEDICAL_MODEL=openai/gpt-4o-mini

# ── App
APP_HOST=127.0.0.1
APP_PORT=8000
ENVIRONMENT=development

# ── File upload
UPLOAD_DIR=./tmp/medisense_uploads
MAX_FILE_SIZE_MB=20
ALLOWED_FILE_TYPES=application/pdf,image/jpeg,image/png

# ── STT model
WHISPER_MODEL=google/gemini-2.5-flash

# ── Database
DATABASE_URL=sqlite+aiosqlite:///./medisense.db
FRONTEND_URL=http://localhost:5173

# ── Auth / JWT
JWT_SECRET=<256-bit-hex-secret>
JWT_ALGORITHM=HS256
JWT_EXPIRES_MINUTES=10080

# ── Google Calendar OAuth
GOOGLE_CLIENT_ID=<from-google-cloud-console>
GOOGLE_CLIENT_SECRET=<from-google-cloud-console>
GOOGLE_REDIRECT_URI=http://localhost:8000/integrations/google/callback
GOOGLE_POST_AUTH_REDIRECT=http://localhost:5173/consultation/schedule
GOOGLE_REFRESH_TOKEN=<from-setup-script>
GOOGLE_CALENDAR_EMAIL=<email>
GOOGLE_MEET_WEBHOOK_SECRET=<256-bit-hex-secret>

# ── Sarvam AI (Indic STT/TTS) — leave empty to fall back to Gemini Flash
SARVAM_API_KEY=
SARVAM_STT_MODEL=saaras:v3
SARVAM_TTS_MODEL=bulbul:v3
SARVAM_BASE_URL=https://api.sarvam.ai
SARVAM_WS_BASE_URL=wss://api.sarvam.ai
SARVAM_TTS_SPEAKER=anushka
SARVAM_TTS_LANGUAGE=en-IN
```

---

## 12. Installation & Setup

### Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
# Edit .env with your OpenRouter API key
python main.py
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Verify
```bash
curl http://localhost:8000/health
# {"status":"ok","version":"1.0.0","model":"openai/gpt-4o-mini","environment":"development"}
```

---

## 13. Frontend Components & Types

### Key Type Interfaces

```typescript
// types/auth.types.ts
interface User { id: string; email: string; full_name: string; role: 'doctor' | 'patient'; }

// types/patientChatbot.types.ts
interface PatientChatSessionSummary {
  id: string; started_at: string; ended_at?: string;
  title?: string; session_summary?: string; message_count: number;
}
interface PatientChatMessage {
  id: string; role: 'user' | 'assistant'; content: string;
  created_at: string; file_references?: ChatFileReference[];
}
interface ChatFileReference {
  filename: string; mime_type: string; size_bytes: number; kind: 'image' | 'pdf';
}

// types/consultation.types.ts — trimmed; only Google integration types remain
type GoogleInviteStatus = 'sent' | 'skipped' | 'failed';
interface GoogleConnectionStatus { connected: boolean; email: string | null; }
interface GoogleAuthUrlResponse { auth_url: string; state: string; }

// api/meetApi.ts — scheduling lives here now
interface ScheduleMeetingRequest {
  doctor_name: string;
  patient_name: string;
  patient_email?: string;
  doctor_email?: string;
  scheduled_at: string;        // ISO 8601 with offset/Z
  duration_minutes: number;
  reason: string;
}
interface ScheduledMeeting {
  session_id: string;
  doctor_name: string;
  patient_name: string;
  patient_email?: string | null;
  doctor_email?: string | null;
  scheduled_at: string;
  duration_minutes: number;
  reason: string;
  status: string;              // "scheduled" | "completed" | ...
  created_at: string;
  organizer_role?: 'doctor' | 'patient' | null;
  meet_link?: string | null;
  google_event_id?: string | null;
  google_event_link?: string | null;
  google_invite_status?: GoogleInviteStatus;
  google_invite_error?: string | null;
}
```

### PatientChat.tsx Key Components
- `BotAvatar` — Unified AI avatar (gradient circle + icon) used in sidebar, header, and message bubbles
- `MessageBubble` — Chat message with file chips and timestamp
- `ThinkingIndicator` — Animated loading (pulsing 🧠 + shimmer text + bouncing dots)
- `AttachmentPreview` — Pending file preview with remove button
- `FileChip` — Inline file reference display in messages

---

## 14. Demo Scenarios

### Scenario 1 — Doctor (Chest Pain)
Register as doctor → Dashboard → Record → Read chest_pain_consultation.txt → Stop → Generate SOAP → Export PDF

### Scenario 2 — Patient (Report Analysis)
Register as patient → Dashboard → Upload diabetes_blood_report.pdf → View 4 tabs → Download PDF

### Scenario 3 — Patient (AI Chatbot)
Login as patient → Chat with Medisense AI → Ask about symptoms → Upload lab image → Start new chat → AI remembers history

### Scenario 4 — Google Meet Consultation
Doctor or patient logs in → `/consultation/schedule` → fills the form → backend creates a Google Calendar event with a Meet link → both parties receive an invite → join Google Meet at the scheduled time → after the call, the doctor opens **Doctor Dashboard → "Process Google Meet Consultation"** and clicks **Process** → the transcript is run through diarization → NER → SOAP, the SOAP note appears in the editor, and a patient-friendly explanation is stored on the session.

> Google Meet transcripts require a Google Workspace plan (Business Standard or higher). Free `@gmail.com` accounts can host the call but won't produce a transcript.

---

## 15. Safety & Disclaimers

Every AI-generated output includes this disclaimer:

```
⚠️ IMPORTANT: This information is AI-generated and is for educational purposes only.
It is NOT a substitute for professional medical advice, diagnosis, or treatment.
Always consult a qualified healthcare provider before making any health decisions.
```

### Safety Rules (enforced via SAFETY_SYSTEM_MESSAGE in prompts/safety_system.txt)
1. Never make definitive diagnoses — use "suggests", "may indicate"
2. Never recommend specific drug doses
3. Never contradict existing prescriptions
4. Always include emergency warning signs
5. Doctor review is mandatory — SOAP notes are drafts
6. Never invent/hallucinate medical information

---

*MediSense AI — AI-Powered Health Intelligence Platform*
*Always consult a qualified healthcare professional for medical decisions.*
