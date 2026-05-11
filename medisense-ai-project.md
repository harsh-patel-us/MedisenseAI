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

**Type:** Full-stack web application combining doctor dashboard, patient dashboard, persistent patient AI chatbot, doctor↔patient live chat, Google Meet consultations, multilingual UI, medication tracking, biomarker trends, wearable ingestion, pre-visit intake forms, follow-up planning, and SOAP audit.

**Core AI:** OpenRouter API (default model: `openai/gpt-4o-mini`) for all intelligence tasks. Sarvam AI for Indic STT/TTS in the patient chatbot. All AI calls accept a `language=` parameter that injects a per-call directive into the prompt.

**Key Differentiators:**
- Three distinct AI workflows in one platform — plus medication tracking, biomarker trend charting, wearable ingestion, follow-up plans, SOAP audit, and pre-visit intake forms
- Persistent patient chatbot ("Medisense AI") with cross-session memory, voice I/O, doctor takeover via WebSocket, and a specialty/doctor picker
- Google Meet consultations with automatic transcript → SOAP processing (no in-app video room — uses the user's existing Meet client and Calendar) plus a tokenized pre-visit intake URL generated at scheduling time
- 11-language UI (English + Hindi/Gujarati/Bengali/Tamil/Telugu/Marathi/Kannada/Malayalam/Punjabi/Urdu) with Unicode-safe PDF export
- JWT auth with role-based access (doctor / patient), profile editing, profile-pic upload, and per-doctor specialty
- Runs on SQLite (dev) and PostgreSQL (prod) without code changes via idempotent ALTER TABLE migrations

---

## 2. Problem Statement

### Problem 1 — Doctor Side (Documentation Burden)
- Physicians spend **9 minutes on EHR** for every 15 minutes of patient care
- **43% of physicians** experience burnout — documentation is the #1 cause
- Doctors spend **2+ hours daily** writing clinical notes manually
- Pre-visit context is rarely captured before the call begins

### Problem 2 — Patient Side (Health Literacy Gap)
- **90% of adults** struggle to understand health information effectively
- Only **12% of US adults** have proficient health literacy
- Patients don't know: which doctor to see, what to eat, what exercises are safe
- Indian-language patients are largely unserved by English-only health apps

### Problem 3 — Continuity of Care
- Patients forget post-consultation advice within hours
- No persistent AI companion that remembers a patient's full medical history, medications, biomarker trends, and wearable data
- Disconnected tools for consultations, reports, medication interactions, and follow-up

---

## 3. Solution Summary

MediSense AI is a **multi-sided AI health platform**:

### Doctor Side
- Doctor uploads a pre-recorded consultation audio file (mp3, wav, webm, ogg, flac, or m4a)
- Transcribes speech using Gemini Flash (STT via OpenRouter)
- Labels Doctor vs Patient speech (alternating turns based on transcript line breaks)
- Extracts medical entities (symptoms, drugs, diagnoses)
- Auto-generates a structured SOAP clinical note
- A second LLM pass audits the SOAP note for missing context / hallucination → results surface in `SoapAuditPanel`
- A follow-up extraction pass produces actionable post-visit tasks; the doctor can download a follow-up PDF or send it to the patient
- Doctor reviews, edits, and exports the SOAP note as PDF
- Live doctor↔patient chat console (`DoctorChat.tsx`) lets doctors take over an in-flight chatbot session via a WebSocket-backed AI-on/AI-off toggle

> **Live recording removed (May 2026):** the previous browser-mic + WebSocket streaming flow is no longer wired into the dashboard. The `WebSocket /doctor/stream-audio` endpoint and `useAudioRecorder` / `AudioRecorder` / `LiveTranscript` modules remain on disk but are unused — the dashboard now uses `AudioFileUpload` + `TranscriptView` against `POST /doctor/upload-audio`.

### Patient Side — Report Analysis
- Patient uploads blood report / lab result / prescription (PDF or image)
- OCR extracts text from uploaded file
- AI analyzes the report and produces: plain-language summary, flagged abnormal values, specialist recommendations, diet plan, exercise plan, daily precautions
- Findings normalized into `LabBiomarker` rows and visualized in a trend chart
- Medications extracted and run through an interaction-check prompt against the patient's existing list; alerts surface in `MedicationTracker` and the chatbot context
- Emergency-screening prompt flags red-flag symptoms (`EmergencyAlert`)
- Health guide PDF export with full Unicode support across all 11 supported languages

### Patient Side — Wearable Ingestion
- Patient uploads an Apple Health export ZIP, Google Fit / Fitbit JSON, or raw XML
- `wearable_parser_service.py` normalizes the data into stat buckets
- `analyze_wearable_data` LLM helper turns the buckets into a clinician-friendly narrative

### Patient Side — Medisense AI Chatbot
- Persistent AI medical companion that remembers patient history
- Injects uploaded report summaries + active medications + past session summaries into context
- Specialty / specific-doctor picker so chats can be routed to the right human
- Supports file attachments (images + PDFs) with vision AI analysis
- Voice in (Sarvam STT, Gemini fallback) + voice out (Sarvam TTS bulbul:v3)
- Auto-generates session titles and summaries for easy reference
- Full chat history with grouped sessions (Today, Yesterday, etc.)
- Doctors can take over via `DoctorChatView` — `chat_ws.py` broadcasts messages to both sides

### Pre-Visit Intake
- Every scheduled consultation issues a tokenized intake URL (returned in the schedule success panel + persisted on the session row)
- Patients open `/intake/{token}` (public route, no login), answer the form, and submit
- `intake_service.py` runs the AI summary prompt; the doctor sees the summary above the SOAP note when they process the Meet recording

### Video Consultations (Google Meet)
- Doctor or patient schedules a meeting from `/consultation/schedule`
- Backend creates a Google Calendar event with an auto-generated Meet link, emails both parties, and persists a `ConsultationSession` row in `status="scheduled"`
- The Meet conference id is parsed out of the Meet URL at scheduling time, so the session is immediately ready for transcript processing
- Both parties join the standard Google Meet client (browser or native)
- After the call, the doctor opens **Doctor Dashboard → Process Google Meet Consultation**, picks the unprocessed session, and the backend runs the transcript through the diarization → NER → SOAP → audit → follow-up pipeline as a `BackgroundTask`
- A signed `POST /meet/webhook` (HMAC-SHA256) is also available for fully automatic post-call processing
- A patient-friendly explanation of the SOAP note is generated for the patient

> The previous in-app WebRTC room (`ConsultationRoom.tsx`, `JoinConsultation.tsx`, `routers/consultation.py`, the `consultation/` component directory and `consultationApi.ts`) was removed in May 2026. Google Meet is now the only video-call surface.

---

## 4. System Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                       FRONTEND (React 19 + Vite)                   │
│                                                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐     │
│  │   Doctor      │  │   Patient    │  │   Patient Chatbot    │     │
│  │   Dashboard   │  │   Dashboard  │  │   (Medisense AI)     │     │
│  │  - Audio      │  │  - 7-tab UI  │  │  - Persistent chat   │     │
│  │  - SOAP       │  │  - Meds      │  │  - Specialty picker  │     │
│  │  - Audit      │  │  - Trends    │  │  - Voice in / out    │     │
│  │  - Follow-up  │  │  - Wearables │  │  - Session history   │     │
│  │  - DoctorChat │  │  - Emergency │  │  - Doctor takeover   │     │
│  │  - Meet proc. │  │  - Intake    │  │                      │     │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘     │
│         │                 │                      │                 │
│  ┌──────┴─────────────────┴──────────────────────┴───────────┐     │
│  │  Schedule  ──▶  Google Meet (external)  +  Intake URL     │     │
│  └────────────────────────────┬───────────────────────────────┘     │
└───────────────────────────────┼─────────────────────────────────────┘
                                │ HTTP + WebSocket (doctor↔patient chat,
                                │                   patient chatbot live)
                                ▼
┌───────────────────────────────────────────────────────────────────┐
│                      BACKEND (FastAPI, /api prefix)                │
│                                                                    │
│  Auth (JWT + language + profile + specialty)                       │
│  Doctor (audio, SOAP, audit, follow-up, sessions, doctor↔chat)     │
│  Patient (report, biomarker, wearable, history)                    │
│  Medications (CRUD, interactions, reminder feed)                   │
│  Patient Chatbot (Medisense AI + WebSocket takeover)               │
│  Meet (schedule, process-transcript, intake form)                  │
│  Google OAuth (Calendar / Meet)                                    │
│  Chatbot widget (visitor)                                          │
│                                                                    │
│  Services: claude_service, transcription, diarization, ner,        │
│           report_parser, pdf_export (Unicode font family),         │
│           auth_service, chatbot_agent, patient_chatbot, chat_ws,   │
│           medication_service, biomarker_service, intake_service,   │
│           followup_service, wearable_parser_service,               │
│           emergency_screening_service, soap_audit_service,         │
│           specialties, google_calendar, sarvam_stt_service,        │
│           sarvam_tts_service                                       │
│                                                                    │
│  Prompts: prompts/*.txt (20 prompt files loaded at import)         │
│  Database: SQLAlchemy async — SQLite (dev) or Postgres (prod),     │
│            15 tables, idempotent ALTER-TABLE migrations.           │
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
| ReportLab | PDF generation (with Unicode font family registration) |
| SQLAlchemy (async) | ORM with SQLite / PostgreSQL |
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
| File upload (multipart) | Doctor consultation audio + patient reports + wearable exports |
| Web Audio API + MediaRecorder | Patient chatbot voice input |
| Native WebSocket | Doctor↔patient live chat takeover |
| Google Meet (external) | Video consultations — opened from `SchedulePage.tsx` |

---

## 6. Project Structure

```
MediSenseAI/
├── backend/
│   ├── main.py                        # FastAPI app + lifespan + CORS
│   ├── config.py                      # Settings + SUPPORTED_LANGUAGES + normalize_language
│   ├── database.py                    # 15 ORM models + init_db with migrations
│   ├── requirements.txt
│   ├── .env                           # All env vars (not committed to git)
│   ├── prompts/                       # 20 AI prompt templates (plain-text files)
│   │   ├── __init__.py                # Loader — reads .txt, exports constants
│   │   ├── soap_note.txt              # SOAP note generation
│   │   ├── soap_audit.txt             # SOAP audit / re-grading
│   │   ├── report_analysis.txt        # Medical report analysis
│   │   ├── summary_specialist.txt     # Summary + specialist routing
│   │   ├── lifestyle_guide.txt        # Diet/exercise/precautions
│   │   ├── patient_explanation.txt    # Post-call patient guide
│   │   ├── patient_chatbot_system.txt # Medisense AI system prompt
│   │   ├── patient_chatbot_summary.txt # Session summary prompt
│   │   ├── chatbot_system.txt         # Website chatbot prompt
│   │   ├── safety_system.txt          # Safety guardrails
│   │   ├── language_instruction.txt   # Per-call language directive
│   │   ├── medication_extraction.txt
│   │   ├── medication_interaction.txt
│   │   ├── adherence_reminder.txt
│   │   ├── biomarker_extraction.txt
│   │   ├── wearable_narrative.txt
│   │   ├── intake_summary.txt
│   │   ├── followup_extraction.txt
│   │   └── emergency_screening.txt
│   ├── routers/                       # 8 routers, all mounted under /api
│   │   ├── auth.py                    # Auth + language + profile + specialty
│   │   ├── doctor.py                  # Audio + SOAP + audit + follow-up + doctor↔chat
│   │   │                              # (legacy WS /doctor/stream-audio still defined but unused)
│   │   ├── patient.py                 # Upload + analyze + history + biomarker + wearable
│   │   ├── medications.py             # Medication CRUD + interactions + reminder feed
│   │   ├── chatbot.py                 # POST /chatbot/message
│   │   ├── patient_chatbot.py         # Medisense AI + WebSocket takeover
│   │   ├── meet.py                    # Schedule + transcript processing + intake form + webhook
│   │   └── google_oauth.py            # Google Calendar OAuth flow
│   ├── services/                      # 22 service modules (see Tech Stack)
│   ├── models/                        # Pydantic schemas
│   ├── fonts/                         # Optional: bundled Unicode TTFs for PDF export
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
│   ├── pages/                         # 18 pages — no in-app video room
│   │   ├── Login.tsx, Register.tsx, ProfilePage.tsx
│   │   ├── DoctorDashboard.tsx        # Audio → SOAP + audit + follow-up + Meet processing
│   │   ├── DoctorChat.tsx             # Live doctor↔patient chat console
│   │   ├── PatientDashboard.tsx       # Patient landing
│   │   ├── PatientReportUpload.tsx    # 7-tab analysis results
│   │   ├── PatientChat.tsx            # Medisense AI chatbot UI
│   │   ├── IntakeForm.tsx             # Public pre-visit intake form
│   │   ├── SchedulePage.tsx           # Doctor + patient scheduling + intake URL
│   │   └── [8 marketing pages]
│   ├── components/
│   │   ├── ChatbotWidget.tsx, ProtectedRoute.tsx, ScrollToTop.tsx,
│   │   │ LanguageSelector.tsx
│   │   ├── doctor/   AudioFileUpload, TranscriptView, SoapNoteEditor,
│   │   │             SoapAuditPanel, FollowUpCard, DoctorLayout, DoctorSidebar,
│   │   │             DoctorChatView, DoctorChatOverlay
│   │   │             (AudioRecorder + LiveTranscript still on disk but unused)
│   │   └── patient/  ReportUploader, ReportSummary, SpecialistGuide,
│   │                 DietExercisePlan, PrecautionsList, MedicationTracker,
│   │                 LabTrendChart, WearableUploader, EmergencyAlert,
│   │                 PatientLayout, PatientSidebar
│   ├── api/   authApi, doctorApi, doctorChatApi, patientApi, medicationApi,
│   │         chatbotApi, patientChatbotApi, meetApi, googleIntegrationApi
│   ├── contexts/  AuthContext (user, token, login/logout/setUser)
│   ├── hooks/     useAudioRecorder, useWebSocket
│   └── types/     auth, doctor, patient, medication, consultation
│                  (Google + intake), chatbot, patientChatbot
│
├── demo/
│   ├── sample_reports/
│   ├── sample_transcripts/
│   ├── sample_audio/                  # doctor_patient_demo.mp3 + .txt (gTTS)
│   ├── generate_sample_reports.py
│   └── generate_sample_audio.py
│
├── CLAUDE.md
├── README.md
├── DEPLOYMENT.md
├── AGENTS.md
├── GEMINI.md
└── medisense-ai-project.md (this file)
```

---

## 7. Module Workflows

### 7.1 Doctor Side — Audio Upload to SOAP Note (with audit + follow-up)

```
Doctor uploads audio file (mp3 / wav / webm / ogg / flac / m4a)
        ↓
POST /api/doctor/upload-audio  (multipart, ≤ MAX_FILE_SIZE_MB)
        ↓
services/transcription.py → Gemini Flash STT (OpenRouter)  →  Raw Transcript text
        ↓
routers/doctor.py: split transcript by line breaks, alternate DOCTOR/PATIENT turns
        ↓
TranscriptSegment[] returned to the dashboard along with a fresh session_id
        ↓
POST /api/doctor/generate-note  →  Regex Medical NER  →  AI (SOAP) → SOAP Note JSON
        ↓
Background:
  • soap_audit_service: re-grade SOAP → audit findings
  • followup_service: extract follow-up tasks → FollowUpPlan row
        ↓
SoapNoteEditor + SoapAuditPanel + FollowUpCard
        ↓
PDF Export (Unicode-safe; respects doctor's preferred_language fallback)
```

### 7.2 Patient Side — Report Upload to Health Guide (with medications + biomarkers + emergency)

```
File Upload (PDF/Image)
        ↓
PyMuPDF (text PDF) or OpenRouter Vision OCR (scanned/image)
        ↓
Raw Text Extracted
        ↓
AI analyze_report (uses preferred_language)  →  Findings JSON
        ↓
AI summary + specialist  →  { summary, specialist, urgency }
        ↓
AI lifestyle_guide  →  { diet, exercise, precautions }
        ↓
biomarker_service  →  LabBiomarker rows for trend chart
        ↓
medication_service:
  • extract medications from raw_text  →  PatientMedication rows
  • run interaction-check vs existing meds  →  MedicationInteractionAlert rows
        ↓
emergency_screening_service: red-flag detection for EmergencyAlert
        ↓
7-Tab Patient Dashboard (Summary / Specialist / Diet / Precautions / Medications / Trends / Wearables)
        ↓
Downloadable PDF Health Guide (Unicode font family for non-English)
```

### 7.3 Patient Chatbot — Medisense AI

```
Patient opens /patient/chat (optionally picks specialty/doctor)
        ↓
System loads: patient profile + report summaries + active medications + past session summaries
        ↓
System prompt injected with full patient context + language directive
        ↓
Patient sends message (optionally with image/PDF attachments)
        ↓
If attachments: persisted as PatientChatAttachment, base64-encoded for vision model
        ↓
Doctor takeover? If toggled off, message broadcast via /patient/chat/ws/{session_id}
                 to the assigned doctor; their reply is sent back through the same WS.
        Otherwise the LLM responds with personalized, history-aware medical guidance.
        ↓
Every N messages: auto-generate session summary for future memory
        ↓
On session end: final summary stored, sidebar refreshes
```

### 7.4 Wearable Ingestion

```
Patient uploads Apple Health export ZIP / Google Fit / Fitbit JSON / XML
        ↓
POST /api/patient/wearable/upload  (multipart, ≤ WEARABLE_MAX_FILE_SIZE_MB)
        ↓
wearable_parser_service.parse  →  normalized stats {steps, hr, sleep, ...}
        ↓
analyze_wearable_data (LLM, language-aware) → narrative
        ↓
WearableDataRecord row + WearableUploader UI display
```

### 7.5 Pre-Visit Intake

```
POST /api/meet/schedule  →  generates intake_token + intake_url
        ↓
Patient opens /intake/{token} (public route)
        ↓
GET  /api/meet/intake/{token}                       →  IntakeFormResponse (questions)
        ↓
POST /api/meet/intake/{token}/submit  {answers}     →  IntakeSubmitResponse
        ↓
intake_service.generate_summary  (LLM)              →  intake_summary persisted
        ↓
Doctor sees the summary on Doctor Dashboard above the SOAP note
        ↓
GET  /api/meet/sessions/{session_id}/intake-summary →  doctor-side fetch
```

### 7.6 Google Meet Consultation (schedule → call → SOAP)

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
   → intake_token + intake_url returned to the success panel
        ↓
Both parties join Google Meet at the scheduled time (external client)
        ↓
After the call ends:
        ↓
Doctor opens Doctor Dashboard → "Process Google Meet Consultation"
        ↓
POST /api/meet/process-transcript {session_id, meet_conference_id?}
        ↓
BackgroundTask: fetch transcript → diarization → NER → SOAP
                                            → soap_audit (Prompt 2)
                                            → followup_extraction (Prompt 18)
                                            → patient explanation (Prompt 5)
        ↓
Frontend polls GET /api/meet/process-status/{task_id}
        ↓
SoapNoteEditor + SoapAuditPanel + FollowUpCard render the result;
patient explanation stored on the session
        ↓
(Optional) POST /api/meet/webhook (HMAC-SHA256) can trigger the same
            pipeline automatically when Google reports "meeting ended".
```

---

## 8. API Endpoints

All routers are mounted under the `/api` prefix.

### Auth (`/api/auth`)
```
POST  /auth/register                { email, password, full_name, role, preferred_language? }  →  { user, token }
POST  /auth/login                   { email, password }                  →  { user, token }
GET   /auth/me                      (Bearer token)                       →  { user }
GET   /auth/languages                                                    →  { languages: [{ code, label }, ...] }
PATCH /auth/language                { language: "hi" }                   →  { user }
PUT   /auth/me/profile              { full_name, email, password? }      →  { user }
GET   /auth/me/profile-pic                                               →  raw image
PUT   /auth/me/profile-pic          multipart { file }                   →  { user }
GET   /auth/specialties                                                  →  [{ id, name }, ...]
PUT   /auth/me/specialty            { specialty: "cardiology" }          →  { user }
```

### Doctor (`/api/doctor`)
```
POST  /doctor/upload-audio                  multipart { file }            →  { session_id, transcript[], raw_text }
POST  /doctor/generate-note                 { transcript, session_id }    →  { soap_note, entities }
GET   /doctor/sessions/{session_id}/audit                                 →  { findings: [...] }
GET   /doctor/sessions/{session_id}/followup                              →  { followup_plan }
POST  /doctor/sessions/{session_id}/followup/pdf                          →  PDF file
POST  /doctor/sessions/{session_id}/followup/send-to-patient              →  { ok: true }
POST  /doctor/export-pdf                    { soap_note }                 →  PDF file
GET   /doctor/sessions                                                    →  list past consultation sessions

# Doctor↔patient live chat console
GET   /doctor/active-chats                                                →  [DoctorChatActiveSession, ...]
GET   /doctor/chat-sessions                                               →  paginated DoctorChatSession list
GET   /doctor/chat/{session_id}                                           →  PatientChatSessionMessagesResponse
POST  /doctor/chat/{session_id}/toggle-ai     { enabled: bool }           →  { ai_enabled }
POST  /doctor/chat/{session_id}/message       { content }                 →  { message }

WS    /doctor/stream-audio                  (legacy — defined but unused)
```

### Patient (`/api/patient`)
```
POST  /patient/upload                       multipart { file }            →  { file_id, raw_text }
POST  /patient/analyze                      { file_id, raw_text }         →  PatientAnalysis
POST  /patient/export-pdf                   { analysis_result }           →  PDF file
GET   /patient/history                                                    →  HistoryListResponse
GET   /patient/history/{record_id}                                        →  HistoryDetail
GET   /patient/history/{record_id}/file                                   →  original uploaded file
GET   /patient/history/{record_id}/pdf                                    →  generated health-guide PDF
GET   /patient/{patient_id}/biomarker-trends                              →  BiomarkerTrendResponse

# Wearable / health-app data
POST  /patient/wearable/upload              multipart { file }            →  WearableDataRecordResponse
GET   /patient/{patient_id}/wearable-records                              →  WearableRecordListResponse
GET   /patient/wearable/{record_id}                                       →  WearableDataRecord
```

### Medications (`/api/medications`)
```
GET    /medications/{patient_id}                                          →  MedicationListResponse
POST   /medications/{patient_id}/add        { name, dosage, frequency, ... }  →  MedicationOut
DELETE /medications/{patient_id}/{med_id}                                 →  MedicationOut (is_active=0)
GET    /medications/{patient_id}/interactions                             →  InteractionListResponse
POST   /medications/{patient_id}/interactions/{alert_id}/dismiss          →  { dismissed: true }
GET    /medications/{patient_id}/reminder-feed                            →  ReminderFeedResponse
```

### Patient Chatbot (`/api/patient/chat`)
```
POST  /patient/chat/message              { session_id?, message, attachments[] }  →  PatientChatResponse
GET   /patient/chat/history/{patient_id}                                          →  PatientChatHistoryResponse
GET   /patient/chat/session/{session_id}                                          →  PatientChatSessionMessagesResponse
POST  /patient/chat/session/end          { session_id }                           →  EndSessionResponse
POST  /patient/chat/voice-message        { audio_base64, mime_type }              →  PatientVoiceMessageResponse
POST  /patient/chat/tts                  { text }                                  →  PatientTTSResponse
GET   /patient/chat/attachment/{attachment_id}                                    →  raw bytes
GET   /patient/chat/specialties                                                   →  SpecialtiesResponse
GET   /patient/chat/doctors                                                       →  DoctorListResponse
WS    /patient/chat/ws/{session_id}      (live patient↔doctor takeover)
```

### Google Meet (`/api/meet`)
```
POST  /meet/schedule                {doctor_name, patient_name, scheduled_at,
                                     duration_minutes, reason,
                                     patient_email?, doctor_email?}
                                                            →  ScheduledMeetingDTO (incl. intake_url)
GET   /meet/scheduled                                       →  ScheduledListResponse
GET   /meet/sessions/unprocessed                            →  list of UnprocessedSessionDTO
POST  /meet/link-conference         {session_id, meet_conference_id, ...}
                                                            →  LinkConferenceResponse
POST  /meet/process-transcript      {session_id, meet_conference_id?}
                                                            →  ProcessTranscriptResponse
GET   /meet/process-status/{task_id}                        →  ProcessStatusResponse
POST  /meet/webhook                 (HMAC-SHA256 signed)    →  WebhookResponse
GET   /meet/intake/{token}                                  →  IntakeFormResponse  (public)
POST  /meet/intake/{token}/submit                           →  IntakeSubmitResponse (public)
GET   /meet/sessions/{session_id}/intake-summary            →  IntakeSummary (doctor-side)
```

### Google Calendar OAuth (`/api/integrations/google`)
```
GET   /integrations/google/status                           →  GoogleConnectionStatus
GET   /integrations/google/auth-url                         →  GoogleAuthUrlResponse
GET   /integrations/google/callback                         OAuth redirect target
POST  /integrations/google/disconnect                       →  { ok: true }
```

### Website Chatbot (`/api/chatbot`)
```
POST  /chatbot/message    { message, session_id? }  →  { reply, session_id }
```

### System
```
GET   /health   (also /api/health)   →  { status, version, model, environment }
GET   /                              →  { message, docs, health }
```

---

## 9. AI Prompts

All prompts live in the `prompts/` folder as plain-text `.txt` files. They are loaded at import time by `prompts/__init__.py` and exported as Python constants. Import them via `from prompts import SOAP_NOTE_PROMPT`.

| #  | File                          | Constant                          | Used By                | Purpose |
|----|-------------------------------|-----------------------------------|------------------------|---------|
| 1  | `soap_note.txt`               | `SOAP_NOTE_PROMPT`                | Doctor / Consultation  | Generate structured SOAP note from transcript + entities |
| 2  | `soap_audit.txt`              | `SOAP_AUDIT_PROMPT`               | Doctor                 | Re-grade a SOAP note for missing context / hallucination |
| 3  | `report_analysis.txt`         | `REPORT_ANALYSIS_PROMPT`          | Patient                | Extract findings from any medical report type |
| 4  | `summary_specialist.txt`      | `SUMMARY_SPECIALIST_PROMPT`       | Patient                | Plain-language summary + specialist routing |
| 5  | `lifestyle_guide.txt`         | `LIFESTYLE_GUIDE_PROMPT`          | Patient                | Diet, exercise, precautions tailored to conditions |
| 6  | `patient_explanation.txt`     | `PATIENT_EXPLANATION_PROMPT`      | Consultation           | Post-call patient-friendly explanation of SOAP note |
| 7  | `patient_chatbot_system.txt`  | `PATIENT_CHATBOT_SYSTEM_PROMPT`   | Medisense AI           | System prompt with patient profile + memory injection |
| 8  | `patient_chatbot_summary.txt` | `PATIENT_CHATBOT_SUMMARY_PROMPT`  | Medisense AI           | Auto-summarize chat sessions for future memory |
| 9  | `chatbot_system.txt`          | `CHATBOT_SYSTEM_PROMPT`           | Website widget         | Visitor-facing support chatbot personality |
| 10 | `safety_system.txt`           | `SAFETY_SYSTEM_MESSAGE`           | All AI calls           | Medical safety guardrails prepended to every call |
| 11 | `language_instruction.txt`    | `LANGUAGE_INSTRUCTION_PROMPT`     | All AI calls           | Per-call language directive selected by `preferred_language` |
| 12 | `medication_extraction.txt`   | `MEDICATION_EXTRACTION_PROMPT`    | Medication tracker     | Pull current medications out of free-text reports |
| 13 | `medication_interaction.txt`  | `MEDICATION_INTERACTION_PROMPT`   | Medication tracker     | Score drug-drug interactions for active medications |
| 14 | `adherence_reminder.txt`      | `ADHERENCE_REMINDER_PROMPT`       | Medication tracker     | Friendly adherence reminder copy |
| 15 | `biomarker_extraction.txt`    | `BIOMARKER_EXTRACTION_PROMPT`     | Biomarker service      | Normalize lab findings into typed biomarker rows |
| 16 | `wearable_narrative.txt`      | `WEARABLE_NARRATIVE_PROMPT`       | Wearable parser        | Turn parsed wearable data into a clinician-friendly narrative |
| 17 | `intake_summary.txt`          | `INTAKE_SUMMARY_PROMPT`           | Intake service         | Convert pre-visit intake answers into a clinical summary |
| 18 | `followup_extraction.txt`     | `FOLLOWUP_EXTRACTION_PROMPT`      | Follow-up service      | Extract follow-up tasks and timelines from a SOAP note |
| 19 | `emergency_screening.txt`     | `EMERGENCY_SCREENING_PROMPT`      | Emergency service      | Flag red-flag symptoms for the emergency-alert UI |

---

## 10. Database Schema

15 tables managed by SQLAlchemy async ORM. Works against SQLite (dev) or PostgreSQL via `asyncpg` (prod). Schema additions are applied as idempotent `ALTER TABLE ADD COLUMN` migrations in `init_db()`.

> **Bool/Int gotcha**: Several flags (`PatientMedication.is_active`, `MedicationInteractionAlert.is_dismissed`, `ConsultationSession.doctor_joined`, `FollowUpPlan.is_sent_to_patient`) are declared `Mapped[bool] = mapped_column(Integer, ...)` for cross-DB compatibility. **Compare with `== 0` / `== 1`** (and assign `0` / `1`), never `== False` / `== True` — Postgres rejects `integer = boolean`.
>
> **Datetime gotcha**: `scheduled_at` is a naive `DateTime` column → maps to `TIMESTAMP WITHOUT TIME ZONE` in Postgres. The frontend sends ISO 8601 with a `Z`/offset, so `routers/meet.py` parses it as tz-aware and then strips to UTC before storing. asyncpg refuses to bind tz-aware datetimes against naive columns.

```sql
-- Auth (extended with Google OAuth, language, profile pic, specialty)
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    created_at TIMESTAMP,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL,                 -- "doctor" | "patient"
    preferred_language TEXT DEFAULT 'en',
    profile_picture_path TEXT,
    profile_picture_mime TEXT,
    specialty TEXT,                     -- doctors only (FK → specialties.id)
    google_refresh_token TEXT,
    google_calendar_email TEXT
);

-- Doctor consultations + scheduled Google Meet consultations + intake form.
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
    meet_conference_id TEXT,
    processing_status TEXT,
    processing_task_id TEXT,
    doctor_joined INTEGER DEFAULT 0,    -- bool-as-int

    -- Scheduling fields (added when created via /meet/schedule)
    scheduled_at TIMESTAMP,             -- TIMESTAMP WITHOUT TIME ZONE; UTC-naive
    duration_minutes INTEGER,
    reason TEXT,
    patient_email TEXT,
    doctor_email TEXT,
    organizer_id TEXT REFERENCES users(id),
    organizer_role TEXT,                -- "doctor" | "patient"

    -- Google Calendar / Meet artifacts
    meet_link TEXT,
    google_event_id TEXT,
    google_event_link TEXT,
    google_invite_status TEXT,          -- "sent" | "skipped" | "failed"
    google_invite_error TEXT,

    -- Pre-visit intake form
    intake_token TEXT,
    intake_data TEXT,                   -- JSON {questions, answers, patient_name}
    intake_summary TEXT,
    intake_submitted_at TIMESTAMP
);

-- Website chatbot widget
CREATE TABLE chatbot_sessions (
    id TEXT PRIMARY KEY,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    user_id TEXT REFERENCES users(id),
    message_count INTEGER DEFAULT 0,
    messages TEXT
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
    generated_pdf_path TEXT, generated_pdf_size INTEGER,
    language TEXT                       -- preferred_language at analysis time
);

-- Medisense AI chat sessions (with doctor routing + AI takeover)
CREATE TABLE patient_chat_sessions (
    id TEXT PRIMARY KEY,
    patient_id TEXT REFERENCES users(id) NOT NULL,
    doctor_id TEXT REFERENCES users(id),
    specialty TEXT,
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    title TEXT,
    session_summary TEXT,
    message_count INTEGER DEFAULT 0,
    last_summary_at_count INTEGER DEFAULT 0,
    ai_enabled INTEGER DEFAULT 1        -- bool-as-int (doctor takeover)
);

-- Medisense AI chat messages
CREATE TABLE patient_chat_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES patient_chat_sessions(id) NOT NULL,
    patient_id TEXT REFERENCES users(id) NOT NULL,
    role TEXT NOT NULL,                 -- "user" | "assistant" | "doctor"
    content TEXT NOT NULL,
    created_at TIMESTAMP,
    message_metadata TEXT,              -- JSON
    file_references TEXT                -- JSON list
);

-- Persisted attachments
CREATE TABLE patient_chat_attachments (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES patient_chat_sessions(id),
    message_id TEXT REFERENCES patient_chat_messages(id),
    file_path TEXT, mime_type TEXT, size_bytes INTEGER, kind TEXT
);

-- Doctor's view of an active chat
CREATE TABLE doctor_chat_sessions (
    id TEXT PRIMARY KEY,
    doctor_id TEXT REFERENCES users(id),
    patient_chat_session_id TEXT REFERENCES patient_chat_sessions(id),
    last_seen_at TIMESTAMP,
    is_active INTEGER DEFAULT 1
);

-- Medication tracking
CREATE TABLE patient_medications (
    id TEXT PRIMARY KEY,
    patient_id TEXT REFERENCES users(id) NOT NULL,
    name TEXT NOT NULL,
    dosage TEXT, frequency TEXT, route TEXT, notes TEXT,
    started_at TIMESTAMP, source TEXT,  -- "ai_extracted" | "manual"
    is_active INTEGER DEFAULT 1         -- bool-as-int
);

CREATE TABLE medication_interaction_alerts (
    id TEXT PRIMARY KEY,
    patient_id TEXT REFERENCES users(id) NOT NULL,
    drug_a TEXT, drug_b TEXT,
    severity TEXT,                      -- "low" | "moderate" | "high"
    description TEXT,
    is_dismissed INTEGER DEFAULT 0,     -- bool-as-int
    created_at TIMESTAMP
);

-- Lab biomarkers for the trend chart
CREATE TABLE lab_biomarkers (
    id TEXT PRIMARY KEY,
    patient_id TEXT REFERENCES users(id) NOT NULL,
    analysis_id TEXT REFERENCES patient_analyses(id),
    test_name TEXT, value REAL, unit TEXT, status TEXT,
    reference_range TEXT, taken_at TIMESTAMP
);

-- Follow-up plans extracted from SOAP notes
CREATE TABLE followup_plans (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES consultation_sessions(id),
    plan_json TEXT,
    pdf_path TEXT,
    is_sent_to_patient INTEGER DEFAULT 0,  -- bool-as-int
    created_at TIMESTAMP
);

-- Wearable / health-app data
CREATE TABLE wearable_data_records (
    id TEXT PRIMARY KEY,
    patient_id TEXT REFERENCES users(id) NOT NULL,
    source TEXT,                        -- "apple_health" | "google_fit" | "fitbit"
    file_name TEXT, file_size INTEGER,
    stats_json TEXT,
    narrative TEXT,
    created_at TIMESTAMP
);

-- Audit trail (patient chat access)
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
WEARABLE_MAX_FILE_SIZE_MB=50

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

### Supported Languages (`config.SUPPORTED_LANGUAGES`)

```python
{
    "en": "English",
    "hi": "Hindi (हिंदी)",
    "gu": "Gujarati (ગુજરાતી)",
    "bn": "Bengali (বাংলা)",
    "ta": "Tamil (தமிழ்)",
    "te": "Telugu (తెలుగు)",
    "mr": "Marathi (मराठी)",
    "kn": "Kannada (ಕನ್ನಡ)",
    "ml": "Malayalam (മലയാളം)",
    "pa": "Punjabi (ਪੰਜਾਬੀ)",
    "ur": "Urdu (اردو)",
}
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

### Optional — bundle Unicode fonts for non-English PDFs
```bash
# Drop NotoSans-Regular.ttf and NotoSans-Bold.ttf into backend/fonts/
# (On Windows the system Nirmala.ttc is auto-detected — no action needed for dev.)
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
interface User {
  id: string;
  email: string;
  full_name: string;
  role: 'doctor' | 'patient';
  preferred_language: string;
  specialty?: string | null;
  has_profile_picture?: boolean;
}

// types/medication.types.ts
interface Medication {
  id: string; name: string; dosage?: string;
  frequency?: string; route?: string; notes?: string;
  started_at?: string; source?: 'ai_extracted' | 'manual';
  is_active: boolean;
}
interface InteractionAlert {
  id: string; drug_a: string; drug_b: string;
  severity: 'low' | 'moderate' | 'high';
  description: string; is_dismissed: boolean;
  created_at: string;
}

// types/patient.types.ts
interface BiomarkerTrendResponse {
  patient_id: string;
  biomarkers: Record<string, BiomarkerSeries>;
}
interface WearableDataRecord {
  id: string; source: string; file_name: string;
  stats: Record<string, unknown>; narrative: string;
  created_at: string;
}

// types/consultation.types.ts — Google integration + intake form only
type GoogleInviteStatus = 'sent' | 'skipped' | 'failed';
interface GoogleConnectionStatus { connected: boolean; email: string | null; }
interface GoogleAuthUrlResponse { auth_url: string; state: string; }
interface IntakeSummary {
  intake_summary: string | null;
  intake_data?: { patient_name?: string; questions: string[]; answers: Record<string, string> };
  submitted_at?: string | null;
}

// api/meetApi.ts — scheduling lives here
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
  doctor_name: string; patient_name: string;
  patient_email?: string | null; doctor_email?: string | null;
  scheduled_at: string; duration_minutes: number; reason: string;
  status: string; created_at: string;
  organizer_role?: 'doctor' | 'patient' | null;
  meet_link?: string | null;
  google_event_id?: string | null;
  google_event_link?: string | null;
  google_invite_status?: GoogleInviteStatus;
  google_invite_error?: string | null;
  intake_url?: string | null;
}
```

### PatientChat.tsx Key Components
- `BotAvatar` — Unified AI avatar (gradient circle + icon) used in sidebar, header, and message bubbles
- `MessageBubble` — Chat message with file chips and timestamp
- `ThinkingIndicator` — Animated loading (pulsing 🧠 + shimmer text + bouncing dots)
- `AttachmentPreview` — Pending file preview with remove button
- `FileChip` — Inline file reference display in messages
- `LanguageSelector` — Header dropdown that calls `PATCH /auth/language`
- Available Specialists picker — per-card "Connecting…" loader on click

### DoctorDashboard.tsx Key Sections
- `AudioFileUpload` + `TranscriptView` — single-shot upload + alternating-speaker transcript
- `SoapNoteEditor` — editable SOAP fields + PDF export
- `SoapAuditPanel` — re-graded findings overlaid on the SOAP
- `FollowUpCard` — extracted plan with download / send-to-patient actions
- "Process Google Meet Consultation" — unprocessed sessions list + per-row optimistic loader
- `IntakePreviewPanel` — collapsible intake summary above the SOAP for Meet sessions
- Specialty onboarding card (shown when the doctor hasn't set a specialty yet)

---

## 14. Demo Scenarios

### Scenario 1 — Doctor (Audio Upload → SOAP + audit + follow-up)
`pip install gTTS && python demo/generate_sample_audio.py` → register as doctor → set specialty → Dashboard → **Upload Consultation Audio** → pick `demo/sample_audio/doctor_patient_demo.mp3` → **Transcribe Audio** → review transcript → **Generate SOAP Note** → review the editor + audit panel + follow-up card → **Download PDF** → click **Upload Another Audio File** to start over.

### Scenario 2 — Patient (Report Analysis with multilingual PDF)
Register as patient (pick a preferred language) → Upload Report → upload `demo/sample_reports/diabetes_blood_report.pdf` → watch the **Upload › Analysis › Ready** loader → cycle through 7 tabs (Summary / Specialist / Diet / Precautions / Medications / Trends / Wearables) → switch language in profile → Download PDF in the new language (Devanagari/Tamil/Bengali render correctly via Nirmala UI).

### Scenario 3 — Patient (AI Chatbot with doctor takeover)
Login as patient → Chat with Medisense AI → pick a specialty / specific doctor → ask about symptoms → upload lab image → see medication interaction alerts surface → start a new chat — the AI remembers your history. Meanwhile, login as that doctor in another window → **Doctor Chat** → toggle AI off → reply yourself.

### Scenario 4 — Google Meet Consultation (with intake)
Doctor or patient logs in → `/consultation/schedule` → fills the form → backend creates a Google Calendar event with a Meet link **and** a tokenized intake URL → both parties receive the invite, patient opens the intake URL and submits answers → join Google Meet at the scheduled time → after the call, doctor opens **Doctor Dashboard → "Process Google Meet Consultation"** → click **Process** → the transcript runs through diarization → NER → SOAP → audit → follow-up; the SOAP appears in the editor with the intake summary above it, and a patient-friendly explanation is stored on the session.

> Google Meet transcripts require a Google Workspace plan (Business Standard or higher). Free `@gmail.com` accounts can host the call but won't produce a transcript.

### Scenario 5 — Wearable Ingestion
Login as patient → Upload Report → switch to the **Wearables** tab → drop an Apple Health export ZIP / Google Fit JSON / Fitbit JSON → watch the parser surface the narrative + stats; the chatbot can now reference your activity data.

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
7. Multilingual outputs must respect the same guardrails — `language_instruction.txt` is *additive*, not a replacement
8. Drug-drug interaction alerts are advisory; the patient is always told to confirm with their doctor

---

*MediSense AI — AI-Powered Health Intelligence Platform*
*Always consult a qualified healthcare professional for medical decisions.*
