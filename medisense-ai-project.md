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

**Type:** Full-stack web application (Doctor side + Patient side + Video Consultations + Patient AI Chatbot)

**Core AI:** OpenRouter API (default model: `openai/gpt-4o-mini`) for all intelligence tasks

**Key Differentiators:**
- Three distinct AI workflows in one platform
- Persistent patient chatbot ("Dr. MediSense") with cross-session memory
- Browser-native WebRTC video consultations — no app install
- JWT auth with role-based access (doctor / patient)

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

### Patient Side — Dr. MediSense Chatbot
- Persistent AI medical companion that remembers patient history
- Injects uploaded report summaries + past session summaries into context
- Supports file attachments (images + PDFs) with vision AI analysis
- Auto-generates session titles and summaries for easy reference
- Full chat history with grouped sessions (Today, Yesterday, etc.)

### Video Consultations
- WebRTC browser-native video calls (doctor ↔ patient)
- Patient joins with a 6-character room code — no downloads
- Real-time transcription during the call
- Auto SOAP note + patient-friendly explanation post-call

---

## 4. System Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                       FRONTEND (React 19 + Vite)                  │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │   Doctor      │  │   Patient    │  │   Patient Chatbot    │   │
│  │   Dashboard   │  │   Dashboard  │  │   (Dr. MediSense)    │   │
│  │  - Record     │  │  - Upload    │  │  - Persistent chat   │   │
│  │  - Transcript │  │  - 4-tab UI  │  │  - File attachments  │   │
│  │  - SOAP edit  │  │  - PDF guide │  │  - Session history   │   │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘   │
│         │                 │                      │               │
│  ┌──────┴─────────────────┴──────────────────────┴───────────┐   │
│  │              Video Consultation Room (WebRTC)              │   │
│  └────────────────────────────┬───────────────────────────────┘   │
└───────────────────────────────┼───────────────────────────────────┘
                                │ HTTP / WebSocket
                                ▼
┌───────────────────────────────────────────────────────────────────┐
│                      BACKEND (FastAPI)                             │
│                                                                   │
│  Auth (JWT) ─── Doctor ─── Patient ─── Consultation               │
│  Chatbot Widget ─── Patient Chatbot (Dr. MediSense)               │
│                                                                   │
│  Services: claude_service, transcription, diarization, ner,       │
│           report_parser, pdf_export, auth_service,                │
│           chatbot_agent, patient_chatbot                          │
│                                                                   │
│  Database: SQLite + SQLAlchemy async (7 tables)                   │
└───────────────────────────────┬───────────────────────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │    OpenRouter API     │
                    │  (openai/gpt-4o-mini) │
                    └──────────────────────┘
```

---

## 5. Tech Stack

### Backend
| Tool | Purpose |
|------|---------|
| Python 3.11+ | Primary language |
| FastAPI | REST API + WebSockets |
| Uvicorn | ASGI server |
| OpenAI SDK | LLM calls via OpenRouter |
| pyannote.audio | Speaker diarization |
| scispaCy | Medical NER |
| PyMuPDF (fitz) | PDF text extraction |
| pytesseract | OCR for scanned images |
| ReportLab | PDF generation |
| SQLAlchemy (async) | ORM with SQLite |
| bcrypt + PyJWT | Authentication |
| pydantic-settings | Configuration |

### Frontend
| Tool | Purpose |
|------|---------|
| React 19 | UI framework |
| TypeScript 5+ | Type safety |
| Vite | Build tool + dev server |
| Vanilla CSS | Glassmorphism styling (no Tailwind) |
| WebSocket API | Real-time streaming |
| WebRTC API | Video consultations |

---

## 6. Project Structure

```
MediSenseAI/
├── backend/
│   ├── main.py                        # FastAPI app + lifespan + CORS
│   ├── config.py                      # Settings + 6 AI prompts + safety message
│   ├── database.py                    # 7 ORM models + init_db with migrations
│   ├── requirements.txt
│   ├── .env
│   ├── routers/
│   │   ├── auth.py                    # POST /auth/register, /auth/login, GET /auth/me
│   │   ├── doctor.py                  # WS /doctor/stream-audio, POST /doctor/generate-note, /doctor/export-pdf
│   │   ├── patient.py                 # POST /patient/upload, /patient/analyze, /patient/export-pdf
│   │   ├── consultation.py            # Consultation rooms, WebRTC, post-call
│   │   ├── chatbot.py                 # POST /chatbot/message
│   │   └── patient_chatbot.py         # Full CRUD for Dr. MediSense sessions + messages
│   ├── services/
│   │   ├── claude_service.py          # All LLM calls via OpenRouter
│   │   ├── transcription.py           # STT (Gemini Flash)
│   │   ├── diarization.py             # pyannote.audio speaker labeling
│   │   ├── ner.py                     # scispaCy NER + regex fallback
│   │   ├── report_parser.py           # PyMuPDF + Tesseract OCR
│   │   ├── pdf_export.py              # ReportLab PDF generation
│   │   ├── auth_service.py            # bcrypt hashing + JWT
│   │   ├── chatbot_agent.py           # Website chatbot agent
│   │   └── patient_chatbot.py         # Dr. MediSense memory + agent
│   ├── models/
│   │   ├── auth_models.py
│   │   ├── doctor_models.py
│   │   ├── patient_models.py
│   │   ├── chatbot_models.py
│   │   └── patient_chatbot_models.py
│   └── utils/
│       ├── helpers.py
│       └── storage.py
│
├── frontend/src/
│   ├── App.tsx                        # Landing page + Navbar + Routes
│   ├── index.css                      # Design system (glassmorphism, CSS vars)
│   ├── main.tsx
│   ├── pages/
│   │   ├── Login.tsx, Register.tsx
│   │   ├── DoctorDashboard.tsx
│   │   ├── PatientDashboard.tsx
│   │   ├── PatientChat.tsx            # Dr. MediSense chatbot UI
│   │   ├── ConsultationRoom.tsx
│   │   ├── JoinConsultation.tsx
│   │   ├── SchedulePage.tsx
│   │   └── [8 marketing pages]
│   ├── components/
│   │   ├── ChatbotWidget.tsx, ProtectedRoute.tsx, ScrollToTop.tsx
│   │   ├── doctor/     (AudioRecorder, LiveTranscript, SoapNoteEditor)
│   │   ├── patient/    (ReportUploader, ReportSummary, SpecialistGuide, DietExercisePlan, PrecautionsList)
│   │   └── consultation/ (VideoGrid, CallControls, ConsultationTranscript, PostCallSummary)
│   ├── api/            (authApi, doctorApi, patientApi, consultationApi, chatbotApi, patientChatbotApi)
│   ├── contexts/       (AuthContext)
│   ├── hooks/          (useAudioRecorder, useWebSocket)
│   └── types/          (auth, doctor, patient, consultation, chatbot, patientChatbot)
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
                                      pyannote.audio Diarization
                                                    ↓
                                      Labeled Transcript (DOCTOR/PATIENT)
                                                    ↓
                                      scispaCy Medical NER
                                                    ↓
                                      AI (Prompt 1) → SOAP Note JSON
                                                    ↓
                                      Frontend Editor → PDF Export
```

### 7.2 Patient Side — Report Upload to Health Guide

```
File Upload (PDF/Image)
        ↓
PyMuPDF (text PDF) or Tesseract OCR (scanned/image)
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

### 7.3 Patient Chatbot — Dr. MediSense

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

### 7.4 Video Consultation

```
Doctor creates room → 6-char code generated
        ↓
Patient joins with code → WebRTC peer connection
        ↓
Live video + audio streaming (browser-native)
        ↓
Real-time transcription during call
        ↓
Call ends → Auto SOAP note generation (Prompt 1)
        ↓
Patient explanation generated (Prompt 5)
        ↓
Both parties see post-call summary
```

---

## 8. API Endpoints

### Auth
```
POST  /auth/register    { email, password, full_name, role }  →  { user, token }
POST  /auth/login       { email, password }                   →  { user, token }
GET   /auth/me          (Bearer token)                        →  { user }
```

### Doctor
```
WS    /doctor/stream-audio       Streams audio chunks, returns transcript segments
POST  /doctor/generate-note      { transcript, session_id }  →  { soap_note, entities }
POST  /doctor/export-pdf         { soap_note }               →  PDF file
GET   /doctor/sessions           List past consultation sessions
```

### Patient
```
POST  /patient/upload            multipart { file }           →  { file_id, raw_text }
POST  /patient/analyze           { file_id, raw_text }        →  { findings, summary, diet, ... }
POST  /patient/export-pdf        { analysis_result }          →  PDF file
```

### Consultation
```
POST  /consultation/create       { patient_name? }            →  { room_id, join_code }
POST  /consultation/join         { join_code }                →  { room_id }
POST  /consultation/end          { room_id }                  →  { soap_note, patient_explanation }
WS    /consultation/ws/{room_id} WebRTC signaling + live transcript
```

### Patient Chatbot (Dr. MediSense)
```
GET   /patient-chat/{patient_id}/history         →  { sessions[] }
GET   /patient-chat/session/{session_id}         →  { messages[] }
POST  /patient-chat/{patient_id}/send            { session_id?, text?, attachments[] }  →  { reply, session_id }
POST  /patient-chat/{patient_id}/end/{session_id}  →  { summary }
```

### Website Chatbot
```
POST  /chatbot/message    { message, session_id? }  →  { reply, session_id }
```

### System
```
GET   /health    →  { status, version, model, environment }
GET   /          →  { message, docs, health }
```

---

## 9. AI Prompts

All prompts live in `config.py`. Summary:

| # | Name | Used By | Purpose |
|---|------|---------|---------|
| 1 | `SOAP_NOTE_PROMPT` | Doctor/Consultation | Generate structured SOAP note from transcript + entities |
| 2 | `REPORT_ANALYSIS_PROMPT` | Patient | Extract findings from any medical report type |
| 3 | `SUMMARY_SPECIALIST_PROMPT` | Patient | Plain-language summary + specialist routing |
| 4 | `LIFESTYLE_GUIDE_PROMPT` | Patient | Diet, exercise, precautions tailored to conditions |
| 5 | `PATIENT_EXPLANATION_PROMPT` | Consultation | Post-call patient-friendly explanation of SOAP note |
| 6 | `PATIENT_CHATBOT_SYSTEM_PROMPT` | Dr. MediSense | System prompt with patient profile + memory injection |
| — | `PATIENT_CHATBOT_SUMMARY_PROMPT` | Dr. MediSense | Auto-summarize chat sessions for future memory |
| — | `CHATBOT_SYSTEM_PROMPT` | Website widget | Visitor-facing support chatbot personality |
| — | `SAFETY_SYSTEM_MESSAGE` | All AI calls | Medical safety guardrails prepended to every call |

---

## 10. Database Schema

7 tables managed by SQLAlchemy async ORM (SQLite):

```sql
-- Auth
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    created_at TIMESTAMP,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL  -- "doctor" | "patient"
);

-- Doctor consultations
CREATE TABLE consultation_sessions (
    id TEXT PRIMARY KEY,
    created_at TIMESTAMP,
    doctor_id TEXT REFERENCES users(id),
    doctor_name TEXT,
    patient_identifier TEXT,
    patient_name TEXT,
    raw_transcript TEXT,
    labeled_transcript TEXT,   -- JSON
    extracted_entities TEXT,    -- JSON
    soap_note TEXT,            -- JSON
    soap_pdf_path TEXT,
    soap_pdf_size INTEGER,
    status TEXT DEFAULT 'in_progress'
);

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

-- Dr. MediSense chat sessions
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

-- Dr. MediSense chat messages
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
# OpenRouter API
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
AI_MODEL=openai/gpt-4o-mini
MEDICAL_MODEL=openai/gpt-4o-mini

# App
APP_HOST=127.0.0.1
APP_PORT=8000
ENVIRONMENT=development

# File upload
UPLOAD_DIR=./tmp/medisense_uploads
MAX_FILE_SIZE_MB=20

# STT model
WHISPER_MODEL=google/gemini-2.5-flash

# Database
DATABASE_URL=sqlite+aiosqlite:///./medisense.db

# CORS
FRONTEND_URL=http://localhost:5173

# Optional
# HF_TOKEN=hf_...          # pyannote.audio diarization
# TESSERACT_CMD=...         # Windows tesseract path
# JWT_SECRET=...            # Override for production
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

// types/consultation.types.ts
interface ConsultationRoom {
  id: string; join_code: string; doctor_id: string;
  patient_name?: string; status: string;
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
Login as patient → Chat with Dr. MediSense → Ask about symptoms → Upload lab image → Start new chat → AI remembers history

### Scenario 4 — Video Consultation
Doctor creates room → Shares code → Patient joins → Video call → Call ends → Auto SOAP + patient explanation

---

## 15. Safety & Disclaimers

Every AI-generated output includes this disclaimer:

```
⚠️ IMPORTANT: This information is AI-generated and is for educational purposes only.
It is NOT a substitute for professional medical advice, diagnosis, or treatment.
Always consult a qualified healthcare provider before making any health decisions.
```

### Safety Rules (enforced via SAFETY_SYSTEM_MESSAGE in config.py)
1. Never make definitive diagnoses — use "suggests", "may indicate"
2. Never recommend specific drug doses
3. Never contradict existing prescriptions
4. Always include emergency warning signs
5. Doctor review is mandatory — SOAP notes are drafts
6. Never invent/hallucinate medical information

---

*MediSense AI — AI-Powered Health Intelligence Platform*
*Always consult a qualified healthcare professional for medical decisions.*
