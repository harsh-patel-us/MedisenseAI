# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MediSense AI is a full-stack AI-powered medical intelligence platform with **three** core workflows:

- **Doctor side**: Audio recording → STT → diarization → medical NER → AI SOAP note generation → PDF export
- **Patient side**: Lab report upload → text extraction → AI analysis → health guide (diet/exercise/precautions) → PDF export
- **Patient chatbot ("Dr. MediSense")**: Persistent, session-based AI medical assistant that remembers patient history, uploaded reports, and past conversations — with file attachment support (images + PDFs) and voice input/output

Additional features:
- **Video consultations**: WebRTC-based doctor-patient video calls with real-time transcription, automatic SOAP note generation, and patient-friendly post-call summaries
- **Google Meet transcript processing**: Link Google Meet conferences to consultation sessions, then process Meet transcripts through the full diarization → NER → SOAP pipeline automatically
- **Sarvam AI STT/TTS**: Indic multilingual speech-to-text (saaras:v3) and text-to-speech (bulbul:v3) for voice input/output in the patient chatbot, with graceful fallback to Gemini Flash
- **Website chatbot widget**: Visitor-facing support chatbot for platform questions and general health queries
- **Authentication**: JWT-based login/register with role-based access (doctor / patient)

## Development Commands

### Backend (`/backend`)
```bash
# Setup
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt

# Run
python main.py
# OR
uvicorn main:app --reload --host 127.0.0.1 --port 8000

# API docs: http://localhost:8000/docs
```

### Frontend (`/frontend`)
```bash
npm install
npm run dev        # Dev server on http://localhost:5173
npm run build      # TypeScript compile + Vite bundle
npm run lint       # ESLint
npm run preview    # Preview production build
```

### Demo Data
```bash
# From project root — generates 3 sample PDF lab reports in demo/sample_reports/
pip install reportlab
python demo/generate_sample_reports.py
```

## Architecture

### Backend (`/backend`)

**FastAPI async application** — entry point `main.py`.

- **`routers/`**: Eight route groups
  - `auth.py` — JWT-based register/login/me endpoints
  - `doctor.py` — WebSocket `/doctor/stream-audio` for real-time audio streaming + POST endpoints for SOAP generation and PDF export
  - `patient.py` — POST endpoints for file upload, analysis, and PDF export
  - `consultation.py` — Video consultation room management (create/join/end), WebRTC signaling, real-time transcript, post-call SOAP + patient explanation
  - `chatbot.py` — Website support chatbot widget (visitor-facing, stateless or session-based)
  - `patient_chatbot.py` — Dr. MediSense persistent patient chatbot (session CRUD, message send with file attachments, history, session end + auto-summarize, **voice-message transcription, TTS synthesis**)
  - `meet.py` — Google Meet integration (link-conference, process-transcript with BackgroundTasks, process-status polling, webhook for auto-processing)
  - `google_oauth.py` — Google OAuth flow for Calendar integration

- **`services/`**: Core business logic
  - `claude_service.py` — All LLM calls via OpenRouter (uses the OpenAI SDK against an OpenRouter base URL)
  - `transcription.py` — STT via configurable model (default: `google/gemini-2.5-flash`)
  - `sarvam_stt_service.py` — Sarvam AI streaming + batch STT (saaras:v3 translate for doctor flows, saarika:v2.5 codemix for patient chatbot); falls back to Gemini Flash when `SARVAM_API_KEY` is not set
  - `sarvam_tts_service.py` — Sarvam AI text-to-speech (bulbul:v3) with REST and WebSocket modes; returns empty payload when not configured so the frontend silently skips playback
  - `diarization.py` — Speaker labeling (Doctor/Patient) using pyannote.audio
  - `ner.py` — Medical NER using scispaCy with regex fallback
  - `report_parser.py` — PDF text extraction via PyMuPDF, with Tesseract OCR fallback for scanned images
  - `pdf_export.py` — PDF generation via ReportLab (SOAP notes, patient health guides, consultation summaries)
  - `auth_service.py` — Password hashing (bcrypt) + JWT token creation/verification
  - `chatbot_agent.py` — OpenAI Agents SDK integration for the website chatbot widget
  - `patient_chatbot.py` — Dr. MediSense agent: session management, memory injection (reports + past summaries), vision-capable file analysis, auto-summarization
  - `google_calendar.py` — Google Calendar event creation with Meet links using platform-level or per-user OAuth

- **`models/`**: Pydantic schemas for request/response validation
  - `auth_models.py` — Register/login request, user response, token response
  - `doctor_models.py` — SOAP note structures, transcript segments, medical entities
  - `patient_models.py` — Patient analysis and upload response shapes
  - `chatbot_models.py` — Chatbot message request/response
  - `patient_chatbot_models.py` — Patient chat session, message, history, send-message, **voice-message request/response, TTS request/response**

- **`database.py`**: SQLAlchemy async ORM with SQLite
  - `User` — Auth users (email, password_hash, full_name, role, Google OAuth fields)
  - `ConsultationSession` — Doctor-side sessions (transcript, entities, SOAP note, PDF path, **meet_conference_id, processing_status, processing_task_id**)
  - `ChatbotSession` — Website chatbot widget sessions (messages JSON)
  - `PatientAnalysisRecord` — Patient-side report analyses (findings, diet/exercise/precautions, PDF path)
  - `PatientChatSession` — Dr. MediSense chat sessions (title, summary, message count)
  - `PatientChatMessage` — Individual messages in patient chat sessions (role, content, file_references)
  - `PatientChatAudit` — Append-only audit trail for patient chat API access

- **`config.py`**: Pydantic settings loaded from `.env` **plus** all AI prompt templates (6 prompts + safety system message). When modifying AI behavior, this is the primary place to edit prompts. Also includes **Sarvam AI settings** (api key, STT/TTS model, speaker, language) and **Google Meet webhook secret**.

- **`utils/`**:
  - `helpers.py` — ID generation, file validation, JSON extraction from LLM responses
  - `storage.py` — File storage utilities

### Frontend (`/frontend/src`)

**React 19 + TypeScript + Vite** — entry point `main.tsx`.

- **`App.tsx`** — Landing page (hero, stats, feature cards, interactive demo, FAQ, footer) + Navbar + route setup. Contains `PublicOnly` and `VisitorOnlyChatbot` wrappers.
- **`pages/`**
  - `Login.tsx` / `Register.tsx` — Auth pages
  - `DoctorDashboard.tsx` — Audio recorder, live transcript panel, SOAP note editor, PDF export, **"Process Google Meet Consultation" section** (lists unprocessed Meet sessions, triggers processing, polls status, shows result in SoapNoteEditor)
  - `PatientDashboard.tsx` — Report uploader, 4-tab results interface
  - `PatientChat.tsx` — Dr. MediSense persistent chatbot (sidebar with session history, message bubbles, file attachments, animated thinking indicator, **microphone button for voice input with STT transcription, TTS toggle for voice replies**)
  - `ConsultationRoom.tsx` — WebRTC video call room with live transcript
  - `JoinConsultation.tsx` — Enter room code to join a video call
  - `SchedulePage.tsx` — Doctor-only consultation scheduling (**auto-links Meet conference ID after Calendar event creation**)
  - `AboutPage.tsx` / `ContactPage.tsx` / `FeaturesPage.tsx` / `UseCasesPage.tsx` / `PricingPage.tsx` / `SecurityPage.tsx` / `IntegrationsPage.tsx` / `ResourcesPage.tsx` — Marketing pages
- **`components/`**
  - `ChatbotWidget.tsx` — Floating chatbot widget for visitors
  - `ProtectedRoute.tsx` — Role-based route guard
  - `ScrollToTop.tsx` — Scroll restoration on navigation
  - `doctor/` — AudioRecorder, LiveTranscript, SoapNoteEditor
  - `patient/` — ReportUploader, ReportSummary, SpecialistGuide, DietExercisePlan, PrecautionsList
  - `consultation/` — VideoGrid, CallControls, ConsultationTranscript, PostCallSummary
- **`api/`**
  - `authApi.ts` — Login, register, token management, current user
  - `doctorApi.ts` — WebSocket connection + SOAP generation calls
  - `patientApi.ts` — File upload, analysis trigger, PDF export
  - `consultationApi.ts` — Consultation room CRUD + transcript/SOAP endpoints
  - `chatbotApi.ts` — Website chatbot API
  - `patientChatbotApi.ts` — Dr. MediSense chat API (sessions, messages, history, file upload, **voice transcription, TTS synthesis**)
  - `meetApi.ts` — Google Meet integration API (link-conference, process-transcript, process-status polling, list unprocessed sessions)
- **`contexts/`**
  - `AuthContext.tsx` — React context for auth state (user, token, login/logout/register)
- **`hooks/`**
  - `useAudioRecorder.ts` — Browser audio capture via Web Audio API
  - `useWebSocket.ts` — Real-time transcript streaming
- **`types/`** — TypeScript interfaces: `auth.types.ts`, `doctor.types.ts`, `patient.types.ts`, `consultation.types.ts`, `chatbot.types.ts`, `patientChatbot.types.ts`

**API proxy**: Vite dev server proxies `/api/*` to `http://localhost:8000`, so no CORS issues in development.

**Styling**: Vanilla CSS with glassmorphism design via custom CSS variables (`index.css`). No Tailwind.

## Key Technical Notes

- **AI calls** all route through OpenRouter using the OpenAI SDK. The default model is `openai/gpt-4o-mini`, configurable via `.env`. Vision model also defaults to `gpt-4o-mini`.
- **Six AI prompt templates** live in `config.py` — SOAP generation, report analysis, summary/specialists, lifestyle guide, patient-friendly consultation explanation, and chatbot system prompt. Each includes a medical safety system message.
- **Authentication** is JWT-based (HS256, 7-day expiry). Users register as `doctor` or `patient`. Protected routes on the frontend use `ProtectedRoute` with role filtering.
- **Dr. MediSense chatbot** maintains persistent memory across sessions via auto-generated session summaries + patient report history injection into the system prompt.
- **Patient chat file attachments** (images/PDFs) are converted to base64 client-side and sent inline to a vision-capable model for analysis.
- **Patient chat voice input** records audio via `MediaRecorder`, sends base64 to `/patient/chat/voice-message` (Sarvam codemix STT with Gemini fallback), and populates the text input for user confirmation before sending.
- **Patient chat TTS** is toggled in the chat header. When enabled, each assistant reply is sent to `/patient/chat/tts` (Sarvam bulbul:v3), and the returned base64 WAV is played via Web Audio API.
- **Google Meet processing** links a Meet conference ID to a `ConsultationSession`, then processes the transcript through the existing diarization → NER → SOAP pipeline via `BackgroundTasks`. The doctor dashboard polls `/meet/process-status/{task_id}` and displays results in `SoapNoteEditor`.
- **Video consultations** use WebRTC (browser-native) with a 6-character room code for patients to join.
- **WebSocket** on the doctor side sends audio chunks from the browser; the backend transcribes each chunk and streams labeled transcript segments back.
- **NER** uses scispaCy (`en_core_sci_sm`) when available, with a regex-based fallback so the app works without the optional model download.
- **Database migrations** are handled via idempotent `ALTER TABLE ADD COLUMN` statements in `init_db()` for SQLite compatibility.

## Environment Configuration

Backend requires `/backend/.env`:
```env
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
AI_MODEL=openai/gpt-4o-mini
MEDICAL_MODEL=openai/gpt-4o-mini

APP_HOST=127.0.0.1
APP_PORT=8000
ENVIRONMENT=development

UPLOAD_DIR=./tmp/medisense_uploads
MAX_FILE_SIZE_MB=20
ALLOWED_FILE_TYPES=application/pdf,image/jpeg,image/png

WHISPER_MODEL=google/gemini-2.5-flash

DATABASE_URL=sqlite+aiosqlite:///./medisense.db
FRONTEND_URL=http://localhost:5173

# Sarvam AI (Indic STT/TTS) — leave SARVAM_API_KEY empty to fall back to Gemini Flash
SARVAM_API_KEY=
SARVAM_STT_MODEL=saaras:v3
SARVAM_TTS_MODEL=bulbul:v3

# Google Meet transcript webhook (HMAC-SHA256). Empty disables signature check.
GOOGLE_MEET_WEBHOOK_SECRET=
```

Optional:
- `HF_TOKEN` — HuggingFace token for pyannote.audio diarization
- `TESSERACT_CMD` — Path to tesseract.exe on Windows
- `JWT_SECRET` — Override the default dev JWT secret for production
- `SARVAM_API_KEY` — Sarvam AI subscription key for Indic STT/TTS
- `GOOGLE_MEET_WEBHOOK_SECRET` — HMAC-SHA256 shared secret for Meet webhook signature validation
