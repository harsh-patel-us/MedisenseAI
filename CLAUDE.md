# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MediSense AI is a full-stack AI-powered medical intelligence platform. The product surfaces three end-user workflows backed by a much larger feature catalog:

- **Doctor side**: Audio file upload → STT → diarization → medical NER → AI SOAP note generation → audit/follow-up extraction → PDF export. Doctors also get a real-time chat console (`DoctorChat`) for live patient sessions.
- **Patient side**: Lab report upload → text extraction → AI analysis → health guide (diet/exercise/precautions) → PDF export, plus medication tracking, biomarker trend charts, wearable data ingestion, emergency screening, and a pre-visit intake form.
- **Patient chatbot ("Medisense AI")**: Persistent, session-based AI medical assistant that remembers patient history, uploaded reports, and past conversations — with file attachment support (images + PDFs), voice input/output, and per-doctor routing.

Additional features:
- **Multilingual support**: Patients pick a preferred language (English + 10 Indic languages: Hindi, Gujarati, Bengali, Tamil, Telugu, Marathi, Kannada, Malayalam, Punjabi, Urdu). All AI calls receive a per-call language instruction; PDFs render Devanagari/Tamil/Bengali/etc. via a bundled Unicode font family (`Nirmala.ttc` on Windows, NotoSans/DejaVu fallback elsewhere).
- **Medication tracking & interaction checks**: After analysis, the LLM extracts the patient's current medications and runs an interaction check against existing prescriptions; alerts surface in `MedicationTracker` and the patient chatbot.
- **Biomarker trends**: `LabBiomarker` rows are persisted from each report and visualized as a trend chart.
- **Wearable & health-app ingestion**: Apple Health XML / Google Fit / Fitbit JSON or ZIP exports are parsed, normalized, and turned into a narrative summary.
- **Pre-visit intake form**: Each scheduled consultation generates a tokenized intake link; patient answers feed an AI-generated clinical summary the doctor sees on the dashboard before the call.
- **Follow-up plans**: SOAP notes are mined for follow-up tasks; the patient receives a downloadable PDF plan and an in-app reminder feed.
- **SOAP audit panel**: Every generated SOAP note is re-graded by an "audit" LLM pass that flags missing context, hallucinations, or unsafe recommendations.
- **Emergency screening**: Both the patient chat and report analysis path run a lightweight emergency-screen prompt that surfaces red-flag symptoms via `EmergencyAlert`.
- **Google Meet consultations**: The only video-call surface. Doctors and patients schedule a meeting through `/consultation/schedule`, the backend creates a Google Calendar event with an auto-generated Meet link, and both parties join via the standard Google Meet client (no in-app WebRTC room).
- **Google Meet transcript processing**: Once a meeting ends, doctors process the Meet transcript through the full diarization → NER → SOAP pipeline directly from the doctor dashboard. The conference id is auto-derived from the Meet link at scheduling time.
- **Google Calendar integration**: OAuth-based calendar event creation with auto-generated Meet links. Supports a platform-level Google account (single shared calendar) or per-user OAuth.
- **Sarvam AI STT/TTS**: Indic multilingual speech-to-text (saaras:v3) and text-to-speech (bulbul:v3) for voice input/output in the patient chatbot, with graceful fallback to Gemini Flash.
- **Website chatbot widget**: Visitor-facing support chatbot for platform questions and general health queries.
- **Authentication & profile**: JWT-based login/register with role-based access (doctor / patient), profile editing, profile picture upload, doctor specialty selection, and per-user preferred language.

> **Removed (Apr–May 2026):** the in-app WebRTC video room. `routers/consultation.py`, `frontend/src/pages/ConsultationRoom.tsx`, `frontend/src/pages/JoinConsultation.tsx`, the `frontend/src/components/consultation/` directory and `frontend/src/api/consultationApi.ts` no longer exist. All scheduling and listing endpoints now live in `routers/meet.py`.

**All AI/ML runs via cloud APIs** (OpenRouter, Sarvam AI, Google). No models are downloaded or executed locally.

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

### Google Calendar Setup (one-time)
```bash
cd backend
python scripts/setup_google_calendar.py
# Paste the output GOOGLE_REFRESH_TOKEN + GOOGLE_CALENDAR_EMAIL into .env
```

### Demo Data
```bash
# From project root — generates 3 sample PDF lab reports in demo/sample_reports/
pip install reportlab
python demo/generate_sample_reports.py

# Generates a ~15-20 sec doctor/patient dialog MP3 in demo/sample_audio/
# for testing the Doctor Dashboard "Upload Consultation Audio" flow
pip install gTTS
python demo/generate_sample_audio.py
```

## Architecture

### Backend (`/backend`)

**FastAPI async application** — entry point `main.py`.

- **`config.py`**: Pydantic settings loaded from `.env` (all configuration variables). Also exports `SUPPORTED_LANGUAGES` and `normalize_language()` for the multilingual flow. Prompts live separately in `prompts/`.

- **`prompts/`**: All AI system prompts stored as plain-text `.txt` files, loaded at import time by `prompts/__init__.py`. Edit them without touching Python code.
  - `soap_note.txt` — SOAP note generation from labeled transcript
  - `soap_audit.txt` — Re-grade a generated SOAP note for missing/hallucinated content
  - `report_analysis.txt` — Extract findings from any medical report type
  - `summary_specialist.txt` — Plain-language summary + specialist routing
  - `lifestyle_guide.txt` — Diet, exercise, precautions tailored to conditions
  - `patient_explanation.txt` — Post-call patient-friendly explanation
  - `patient_chatbot_system.txt` — Medisense AI system prompt with patient context slots
  - `patient_chatbot_summary.txt` — Auto-summarize chat sessions for memory
  - `chatbot_system.txt` — Website visitor chatbot personality
  - `safety_system.txt` — Medical safety guardrails prepended to every LLM call
  - `language_instruction.txt` — Per-call language directive injected into every LLM prompt based on the patient's `preferred_language`
  - `medication_extraction.txt` — Pull current medications out of free-text reports
  - `medication_interaction.txt` — Score drug-drug interactions for the patient's active medications
  - `adherence_reminder.txt` — Friendly adherence reminder copy for medication tracker
  - `biomarker_extraction.txt` — Normalize lab findings into typed biomarker rows for trend charting
  - `wearable_narrative.txt` — Turn parsed wearable data into a clinician-friendly narrative
  - `intake_summary.txt` — Convert pre-visit intake answers into a clinical summary
  - `followup_extraction.txt` — Extract follow-up tasks and timelines from a SOAP note
  - `emergency_screening.txt` — Flag red-flag symptoms for the emergency-alert UI

- **`routers/`**: Eight route groups (all mounted under `/api`)
  - `auth.py` — JWT register/login/me, language listing/update (`GET /auth/languages`, `PATCH /auth/language`), profile update + profile-pic upload, specialty registry + per-user specialty update
  - `doctor.py` — `POST /doctor/upload-audio` accepts an audio file, transcribes via Gemini Flash, returns alternating DOCTOR/PATIENT segments. Endpoints for SOAP generation, audit panel, follow-up extraction/PDF/send-to-patient, PDF export, sessions list, and the doctor↔patient chat console (`/active-chats`, `/chat-sessions`, `/chat/{id}`, `/chat/{id}/toggle-ai`, `/chat/{id}/message`). The legacy `WebSocket /doctor/stream-audio` route is still present but no longer used by the dashboard.
  - `patient.py` — Upload, analyze, export-pdf, history (list/detail/file/pdf), biomarker trends (`GET /patient/{id}/biomarker-trends`), wearable upload + records (`POST /patient/wearable/upload`, `GET /patient/{id}/wearable-records`, `GET /patient/wearable/{record_id}`)
  - `medications.py` — Medication CRUD + interaction alerts (`GET /medications/{patient_id}`, `POST /medications/{patient_id}/add`, `DELETE /medications/{patient_id}/{med_id}`, `GET /medications/{patient_id}/interactions`, `POST /medications/{patient_id}/interactions/{alert_id}/dismiss`, `GET /medications/{patient_id}/reminder-feed`)
  - `chatbot.py` — Website support chatbot widget (visitor-facing, stateless or session-based)
  - `patient_chatbot.py` — Medisense AI persistent patient chatbot (`/message`, `/history/{patient_id}`, `/session/{session_id}`, `/session/end`, `/voice-message`, `/tts`, `/attachment/{attachment_id}`, plus specialty/doctor pickers and a `/ws/{session_id}` WebSocket for live doctor takeover)
  - `meet.py` — Single home for everything Google Meet related plus the pre-visit intake form:
    - `POST /meet/schedule` — create a Google Calendar event + Meet link, persist a `ConsultationSession` row in `status="scheduled"`, auto-extract the conference id from the Meet URL, generate the patient intake token + URL.
    - `GET  /meet/scheduled` — list the current user's scheduled meetings (ordered by `scheduled_at`).
    - `GET  /meet/sessions/unprocessed` — list sessions that have a Meet conference id but no SOAP yet.
    - `POST /meet/link-conference` — defensive fallback to bind a conference id to a session if scheduling didn't auto-derive it.
    - `POST /meet/process-transcript` — kick off the diarization → NER → SOAP background task.
    - `GET  /meet/process-status/{task_id}` — poll the background task and pick up the resulting SOAP / patient explanation.
    - `POST /meet/webhook` — HMAC-SHA256 signed Google "meeting ended" webhook.
    - `GET  /meet/intake/{token}` — public intake-form fetch by token.
    - `POST /meet/intake/{token}/submit` — submit answers (also returns the AI summary if generated).
    - `GET  /meet/sessions/{session_id}/intake-summary` — doctor-side summary fetch.
  - `google_oauth.py` — Google OAuth flow for Calendar integration (`/integrations/google/status`, `/auth-url`, `/callback`, `/disconnect`)

- **`services/`**: Core business logic (all cloud-based, no local models)
  - `claude_service.py` — All LLM calls via OpenRouter (uses the OpenAI SDK against an OpenRouter base URL); includes vision-based OCR, plus `analyze_report`, `generate_summary_and_specialists`, `generate_lifestyle_guide`, `analyze_wearable_data`, `generate_followup_extraction`, etc. Every helper accepts a `language=` parameter and prepends `language_instruction.txt`.
  - `transcription.py` — STT via Gemini Flash on OpenRouter (default: `google/gemini-2.5-flash`)
  - `sarvam_stt_service.py` — Sarvam AI streaming + batch STT (saaras:v3 for doctor flows, saarika:v2.5 codemix for patient chatbot); falls back to Gemini Flash when `SARVAM_API_KEY` is not set
  - `sarvam_tts_service.py` — Sarvam AI text-to-speech (bulbul:v3) with REST and WebSocket modes; returns empty payload when not configured
  - `diarization.py` — Speaker labeling (Doctor/Patient) using pause-based heuristic (pure Python, no local models)
  - `ner.py` — Medical NER using regex keyword matching (pure Python, no local models)
  - `report_parser.py` — PDF text extraction via PyMuPDF; scanned/image pages use OpenRouter vision OCR (no local Tesseract)
  - `pdf_export.py` — PDF generation via ReportLab. Registers a Unicode-capable font family (regular + bold, with `addMapping` for `<b>` tags) when the patient's language is non-English. Candidate order: bundled `backend/fonts/NotoSans*` → Linux Noto/DejaVu → Windows `Nirmala.ttc` (pan-Indic) → Segoe UI / Arial Unicode / Microsoft Sans Serif → macOS Arial Unicode. All paragraph styles AND table cells use the registered family in non-English mode so translated values don't render as empty strings.
  - `auth_service.py` — Password hashing (bcrypt) + JWT token creation/verification + role guards
  - `chatbot_agent.py` — OpenAI Agents SDK multi-agent system for the website chatbot widget (Triage → Platform Support / Health Info agents)
  - `patient_chatbot.py` — Medisense AI agent: session management, memory injection (reports + past summaries + medications), vision-capable file analysis, auto-summarization, multilingual.
  - `chat_ws.py` — WebSocket connection manager + broadcast bus for the doctor↔patient live chat console
  - `medication_service.py` — Medication CRUD, AI extraction from reports, interaction-check pipeline, dismissal, reminder feed
  - `biomarker_service.py` — Biomarker extraction from analysis output + trend aggregation for the chart
  - `intake_service.py` — Pre-visit intake token issuance, answer storage, and AI clinical summary
  - `followup_service.py` — Extract follow-up tasks from a SOAP note, generate a follow-up PDF, mark "sent to patient"
  - `wearable_parser_service.py` — Parses Apple Health (.xml inside .zip), Fitbit / Google Fit JSON exports; normalizes into stat buckets fed to `analyze_wearable_data`
  - `emergency_screening_service.py` — Run the emergency-screen prompt on patient chat messages and report findings
  - `soap_audit_service.py` — Re-grade SOAP notes; surface results in `SoapAuditPanel`
  - `specialties.py` — Static specialty registry + helper for routing patient chats to the right doctor
  - `google_calendar.py` — Google Calendar event creation with Meet links using platform-level or per-user OAuth

- **`models/`**: Pydantic schemas for request/response validation
  - `auth_models.py` — Register/login request, user response, language list/update, profile/specialty update
  - `doctor_models.py` — SOAP note structures, transcript segments, medical entities, follow-up plans, audit findings, doctor-chat session DTOs
  - `patient_models.py` — Patient analysis, upload response, history, biomarker trend, wearable record + narrative shapes
  - `chatbot_models.py` — Chatbot message request/response
  - `patient_chatbot_models.py` — Patient chat session, message, history, send-message, voice-message, TTS, attachment, doctor/specialty pickers

  > **Note**: medication and intake DTOs are defined inside `routers/medications.py` and `routers/meet.py` respectively (Pydantic models declared next to the endpoints) rather than in a standalone module.

- **`database.py`**: SQLAlchemy async ORM (SQLite by default, PostgreSQL via `asyncpg` in prod). Idempotent `ALTER TABLE ADD COLUMN` migrations in `init_db()` keep both backends in sync. Tables:
  - `User` — Auth users (email, password_hash, full_name, role, **`preferred_language`**, profile picture path/mime, doctor specialty, Google OAuth fields).
  - `ConsultationSession` — Doctor-side **and** scheduling rows. Beyond the original transcript/SOAP fields, this table now persists:
    - Meet linkage: `meet_conference_id`, `processing_status`, `processing_task_id`.
    - Scheduling: `scheduled_at` (TIMESTAMP, **stored UTC-naive** — see warning below), `duration_minutes`, `reason`, `patient_email`, `doctor_email`, `organizer_id` (FK → users), `organizer_role` ("doctor" | "patient").
    - Google artifacts: `meet_link`, `google_event_id`, `google_event_link`, `google_invite_status` ("sent" | "skipped" | "failed"), `google_invite_error`.
    - Intake: `intake_token`, `intake_data` (JSON), `intake_summary`, `intake_submitted_at`.
  - `ChatbotSession` — Website chatbot widget sessions (messages JSON).
  - `PatientAnalysisRecord` — Patient-side report analyses (findings, diet/exercise/precautions, PDF path, language at analysis time).
  - `PatientChatSession` — Medisense AI chat sessions (title, summary, message count, doctor routing fields, AI-on/AI-off flag for live doctor takeover).
  - `PatientChatMessage` — Individual messages in patient chat sessions (role, content, file_references).
  - `PatientChatAttachment` — Persisted chat attachments (image/pdf bytes via storage util).
  - `DoctorChatSession` — Doctor's view of an active patient chat (mirrors PatientChatSession with doctor permissions).
  - `PatientMedication` — Patient's active/inactive medications (`is_active` is `Mapped[bool]` on an Integer column — compare with `== 1`/`== 0`, not `True`/`False`, for Postgres compatibility).
  - `MedicationInteractionAlert` — Drug-drug interaction alerts, severity, dismissed flag (same Integer-as-bool pattern via `is_dismissed`).
  - `LabBiomarker` — Per-finding biomarker row (test name, value, unit, status, taken_at) for trend chart.
  - `FollowUpPlan` — Extracted follow-up plan + send-to-patient state.
  - `WearableDataRecord` — Parsed wearable upload (stats blob, narrative, source).
  - `PatientChatAudit` — Append-only audit trail for patient chat API access.

  > **Datetime gotcha**: `scheduled_at` is a naive `DateTime` column → maps to `TIMESTAMP WITHOUT TIME ZONE` in Postgres. The frontend sends ISO 8601 with a `Z`/offset, so `meet.py` parses it as tz-aware and then strips to UTC before storing. asyncpg refuses to bind tz-aware datetimes against naive columns — keep this conversion in any new code that writes to the column.
  >
  > **Bool/Int gotcha**: Several flags (`PatientMedication.is_active`, `MedicationInteractionAlert.is_dismissed`, `ConsultationSession.doctor_joined`, `FollowUpPlan.is_sent_to_patient`) are declared `Mapped[bool] = mapped_column(Integer, ...)` for cross-DB compatibility. Compare with `== 0` / `== 1` (and assign `0` / `1`), never `== False` / `== True` — Postgres rejects `integer = boolean`.

- **`fonts/`** *(optional, not committed)*: Drop `NotoSans-Regular.ttf` + `NotoSans-Bold.ttf` here for production. `pdf_export.py` picks them up first when registering the Unicode font family.

- **`scripts/`**:
  - `setup_google_calendar.py` — One-time script to obtain Google refresh token for platform-level Calendar/Meet integration

- **`utils/`**:
  - `helpers.py` — ID generation, file validation, JSON extraction from LLM responses
  - `storage.py` — File storage utilities (uploads, profile pics, generated PDFs)

### Frontend (`/frontend/src`)

**React 19 + TypeScript + Vite** — entry point `main.tsx`.

- **`App.tsx`** — Landing page (hero, stats, feature cards, interactive demo, FAQ, footer) + Navbar + route setup. `PublicOnly` and `VisitorOnlyChatbot` wrappers gate auth-only and visitor-only surfaces. The "Join Call" navbar/footer entries and the `/consultation/join` and `/consultation/room/:roomId` routes have been removed; the only consultation entry point is `/consultation/schedule`.
- **`pages/`** (18 pages, no in-app video room)
  - `Login.tsx` / `Register.tsx` — Auth pages
  - `ProfilePage.tsx` — Edit name/email/password, profile picture, doctor specialty, preferred language
  - `DoctorDashboard.tsx` — Audio **file upload**, transcript view, SOAP note editor + audit panel + follow-up card, PDF export, plus a "Process Google Meet Consultation" section that lists unprocessed Meet sessions, triggers processing, polls `/meet/process-status/{task_id}`, renders the result in `SoapNoteEditor`, and shows the patient's intake summary above the SOAP. Specialty onboarding card appears when the doctor hasn't picked one yet.
  - `DoctorChat.tsx` — Doctor-side live chat console wrapped by `DoctorLayout`. Lists active chats, opens a `DoctorChatView`, and supports AI-on/AI-off takeover.
  - `PatientDashboard.tsx` — Landing summary for patients (recent reports, upcoming meetings, medication alerts) wrapped by `PatientLayout` + `PatientSidebar`.
  - `PatientReportUpload.tsx` — Report uploader with continuous Upload→Analyze loader, 7-tab results interface (Summary, Specialist, Diet & Exercise, Precautions, Medications, Trends, Wearables), past-reports list with View / File / PDF actions.
  - `PatientChat.tsx` — Medisense AI persistent chatbot (sidebar with session history, message bubbles, file attachments, animated thinking indicator, microphone for STT, TTS toggle, Available Specialists picker with per-card "Connecting…" state).
  - `IntakeForm.tsx` — Public, token-gated pre-visit intake form for patients.
  - `SchedulePage.tsx` — **Both doctors and patients** can schedule. Form posts to `/api/meet/schedule`; the success panel shows the Meet link with copy + "Open Google Meet Now" CTA, plus the patient intake URL. The upcoming-meetings card has a "Join Google Meet" button + "Calendar" link, and (doctors only) a deep-link to the Meet processing section on the dashboard.
  - `AboutPage.tsx` / `ContactPage.tsx` / `FeaturesPage.tsx` / `UseCasesPage.tsx` / `PricingPage.tsx` / `SecurityPage.tsx` / `IntegrationsPage.tsx` / `ResourcesPage.tsx` — Marketing pages
- **`components/`**
  - `ChatbotWidget.tsx` — Floating chatbot widget for visitors
  - `ProtectedRoute.tsx` — Role-based route guard
  - `ScrollToTop.tsx` — Scroll restoration on navigation
  - `LanguageSelector.tsx` — Dropdown of `SUPPORTED_LANGUAGES` wired to `PATCH /auth/language`
  - `doctor/` — `AudioFileUpload`, `TranscriptView`, `SoapNoteEditor`, `SoapAuditPanel`, `FollowUpCard`, `DoctorLayout`, `DoctorSidebar`, `DoctorChatView`, `DoctorChatOverlay` (the older `AudioRecorder` + `LiveTranscript` files are still on disk but no longer imported)
  - `patient/` — `ReportUploader`, `ReportSummary`, `SpecialistGuide`, `DietExercisePlan`, `PrecautionsList`, `MedicationTracker`, `LabTrendChart`, `WearableUploader`, `EmergencyAlert`, `PatientLayout`, `PatientSidebar`
- **`api/`** (9 modules)
  - `authApi.ts` — Login, register, token management, current user, language list/update, profile/specialty update
  - `doctorApi.ts` — Audio upload, SOAP generate/export, sessions list, audit fetch, follow-up endpoints
  - `doctorChatApi.ts` — Doctor-side live chat (active chats, chat list, fetch session messages, toggle AI, send message)
  - `patientApi.ts` — File upload, analysis trigger, PDF export, history endpoints, biomarker trends, wearable upload + records
  - `medicationApi.ts` — Medication CRUD, interaction list/dismiss, reminder feed
  - `chatbotApi.ts` — Website chatbot API
  - `patientChatbotApi.ts` — Medisense AI chat API (sessions, messages, history, file upload, voice transcription, TTS synthesis, specialty/doctor lookup, intake summary fetch)
  - `meetApi.ts` — Owns scheduling + Meet processing types and calls (`scheduleMeeting`, `listScheduledMeetings`, `linkConference`, `processTranscript`, `getProcessStatus`, `listUnprocessedSessions`, `getIntakeSummary`, plus the `ScheduleMeetingRequest` / `ScheduledMeeting` / `IntakeSummary` interfaces).
  - `googleIntegrationApi.ts` — Google OAuth integration API
- **`contexts/`**
  - `AuthContext.tsx` — React context for auth state (user, token, login/logout/register, `setUser` for inline updates)
- **`hooks/`**
  - `useAudioRecorder.ts` — Browser audio capture via Web Audio API (used by patient voice input + legacy doctor recorder)
  - `useWebSocket.ts` — Real-time transcript / chat streaming
- **`types/`** — `auth.types.ts`, `doctor.types.ts`, `patient.types.ts`, `medication.types.ts`, `chatbot.types.ts`, `patientChatbot.types.ts`, and a trimmed `consultation.types.ts` that only re-exports the Google integration shapes (`GoogleInviteStatus`, `GoogleConnectionStatus`, `GoogleAuthUrlResponse`) plus the shared `IntakeSummary`.

**API proxy**: Vite dev server proxies `/api/*` to `http://localhost:8000`, so no CORS issues in development.

**Styling**: Vanilla CSS with glassmorphism design via custom CSS variables (`index.css`). No Tailwind.

## Key Technical Notes

- **All AI/ML is cloud-based** — no models are downloaded or run locally. All LLM, STT, TTS, and vision OCR calls go through cloud APIs (OpenRouter, Sarvam AI).
- **AI calls** route through OpenRouter using the OpenAI SDK. The default model is `openai/gpt-4o-mini`, configurable via `.env`. Vision model also defaults to `gpt-4o-mini`.
- **Multilingual** — every AI call accepts a `language=` argument that selects the right block from `prompts/language_instruction.txt`. The patient's `preferred_language` (set via `LanguageSelector` → `PATCH /auth/language`) flows into report analysis, lifestyle guide, summary/specialists, patient explanation, follow-up extraction, wearable narrative, and the chatbot. PDFs render non-English text via a registered Unicode font family (Nirmala UI on Windows / NotoSans bundle elsewhere); table cells, bold labels, and headings all use the same family in non-English mode so translated values render correctly.
- **Prompt templates** live in `prompts/*.txt` files (20 prompts). Import them via `from prompts import SOAP_NOTE_PROMPT`.
- **Configuration** is managed via `config.py` (pydantic-settings) loading all variables from `.env`. Prompts are separate in the `prompts/` package.
- **Authentication** is JWT-based (HS256, 7-day expiry). Users register as `doctor` or `patient`. Protected routes on the frontend use `ProtectedRoute` with role filtering. Profile pictures are stored on disk and served via `GET /auth/me/profile-pic`.
- **Speaker diarization** uses a pause-based heuristic (>1.5s gap = speaker switch). Pure Python regex, no local models.
- **Medical NER** uses regex keyword matching for symptoms, medications, diagnoses, and vitals. Pure Python, no local models.
- **OCR for scanned documents** uses OpenRouter vision models (no local Tesseract binary needed).
- **Medisense AI chatbot** maintains persistent memory across sessions via auto-generated session summaries + patient report history + active medications injection into the system prompt. Sessions can be routed to a specific doctor specialty/doctor; doctors can take over via `DoctorChatView` (toggling AI off).
- **Patient chat file attachments** (images/PDFs) are persisted (`PatientChatAttachment`) and re-served from `/patient/chat/attachment/{attachment_id}`; vision-capable models analyze images inline.
- **Patient chat voice input** records audio via `MediaRecorder`, sends base64 to `/patient/chat/voice-message` (Sarvam codemix STT with Gemini fallback), and populates the text input for user confirmation before sending.
- **Patient chat TTS** is toggled in the chat header. When enabled, each assistant reply is sent to `/patient/chat/tts` (Sarvam bulbul:v3), and the returned base64 WAV is played via Web Audio API.
- **Medication tracking** runs after every report analysis. The LLM extracts medications, the interaction-check prompt scores them against the patient's existing list, and alerts surface in `MedicationTracker` + the chatbot context. Bool flags on `PatientMedication`/`MedicationInteractionAlert` are Integer-backed — see Bool/Int gotcha above.
- **Biomarker trends** persist `LabBiomarker` rows from each analysis; `LabTrendChart` queries `GET /patient/{id}/biomarker-trends` and renders sparkline-style charts.
- **Wearable ingestion** parses `.zip` (Apple Health export), `.xml`, or JSON (Google Fit / Fitbit) up to `WEARABLE_MAX_FILE_SIZE_MB` and feeds normalized stats into `analyze_wearable_data`.
- **Pre-visit intake** is part of the `/meet/schedule` flow — a token + URL are returned in the success panel; patients hit `/intake/{token}` (public route), submit answers, and the doctor sees the AI summary above the Meet SOAP note.
- **Follow-up plans** are extracted post-SOAP via `followup_service`. Doctors can download a PDF (`/doctor/sessions/{id}/followup/pdf`) or send it to the patient (`/doctor/sessions/{id}/followup/send-to-patient`).
- **SOAP audit** runs the audit prompt against the freshly-generated note and exposes findings in `SoapAuditPanel`.
- **Emergency screening** runs in two places: patient chat messages (red-flag detection mid-conversation) and report analysis (post-process pass for critical alerts surfaced via `EmergencyAlert`).
- **Google Calendar + Meet integration** is the only video-call surface. Scheduling a consultation creates a Calendar event with an auto-generated Meet link; the conference id is parsed out of the Meet URL and stored on the same `ConsultationSession` row in `processing_status="pending"`. Setup via `python scripts/setup_google_calendar.py` (platform-level), or per-user via the OAuth flow in `routers/google_oauth.py`.
- **Google Meet processing**: doctors see unprocessed sessions on their dashboard, click "Process", and the backend runs the diarization → NER → SOAP pipeline via FastAPI `BackgroundTasks`. The dashboard polls `/meet/process-status/{task_id}` and renders the result in `SoapNoteEditor`.
- **Scheduling endpoints** all live in `routers/meet.py` — there is no `routers/consultation.py` anymore. Scheduling is permitted for both `doctor` and `patient` roles; the `organizer_role` column records which one created the row.
- **Doctor consultation audio** is now a single-shot upload through `POST /doctor/upload-audio`. The backend reads the whole file, transcribes it via Gemini Flash, splits the multi-line transcript into alternating DOCTOR/PATIENT segments, and returns them with a fresh `session_id` for `POST /doctor/generate-note`. The legacy `WebSocket /doctor/stream-audio` route still exists but the dashboard does not call it.
- **Doctor live-chat console** (`DoctorChat.tsx`) connects to `/api/patient/chat/ws/{session_id}` to receive patient messages in real time, with a toggle that swaps the AI assistant for a human reply.
- **Database migrations** are handled via idempotent `ALTER TABLE ADD COLUMN` statements in `init_db()` so the same code works against SQLite (dev) and PostgreSQL (prod via asyncpg).
- **Loaders** — every long-running action surfaces an in-place loader: report upload→analyze runs as a continuous loader inside `ReportUploader` (Upload › Analysis › Ready phase strip); scheduling, SOAP generation, follow-up send, medication delete/dismiss, history actions, doctor specialty save, and Meet processing all use optimistic state writes so the button text/spinner updates before the awaited API call returns.

## Environment Configuration

Backend requires `/backend/.env` with all variables loaded by `config.py`:

```env
# ── OpenRouter / LLM ─────────────────────────
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
AI_MODEL=openai/gpt-4o-mini

# ── Chatbot widget model ─────────────────────
CHATBOT_MODEL=openai/gpt-4o-mini

# ── Patient persistent chatbot (Medisense AI)
PATIENT_CHATBOT_MODEL=openai/gpt-4o-mini
PATIENT_CHATBOT_SUMMARY_EVERY=10
VISION_MODEL=openai/gpt-4o-mini

# ── App settings ─────────────────────────────
APP_HOST=127.0.0.1
APP_PORT=8000
ENVIRONMENT=development

# ── File upload ──────────────────────────────
UPLOAD_DIR=./tmp/medisense_uploads
MAX_FILE_SIZE_MB=20
ALLOWED_FILE_TYPES=application/pdf,image/jpeg,image/png
WEARABLE_MAX_FILE_SIZE_MB=50

# ── Speech / NLP ─────────────────────────────
WHISPER_MODEL=google/gemini-2.5-flash

# ── Database ─────────────────────────────────
DATABASE_URL=sqlite+aiosqlite:///./medisense.db

# ── CORS ─────────────────────────────────────
FRONTEND_URL=http://localhost:5173

# ── Consultation / Medical LLM ───────────────
MEDICAL_MODEL=openai/gpt-4o-mini

# ── Auth / JWT ───────────────────────────────
JWT_SECRET=<256-bit-hex-secret>
JWT_ALGORITHM=HS256
JWT_EXPIRES_MINUTES=10080

# ── Google Calendar OAuth ────────────────────
GOOGLE_CLIENT_ID=<from-google-cloud-console>
GOOGLE_CLIENT_SECRET=<from-google-cloud-console>
GOOGLE_REDIRECT_URI=http://localhost:8000/integrations/google/callback
GOOGLE_POST_AUTH_REDIRECT=http://localhost:5173/consultation/schedule

# ── Platform-level Google account ────────────
GOOGLE_REFRESH_TOKEN=<from-setup-script>
GOOGLE_CALENDAR_EMAIL=<email>

# ── Google Meet transcript webhook ───────────
GOOGLE_MEET_WEBHOOK_SECRET=<256-bit-hex-secret>

# ── Sarvam AI (Indic STT/TTS) ────────────────
SARVAM_API_KEY=<sarvam-key-or-empty>
SARVAM_STT_MODEL=saaras:v3
SARVAM_TTS_MODEL=bulbul:v3
SARVAM_BASE_URL=https://api.sarvam.ai
SARVAM_WS_BASE_URL=wss://api.sarvam.ai
SARVAM_TTS_SPEAKER=anushka
SARVAM_TTS_LANGUAGE=en-IN
```
