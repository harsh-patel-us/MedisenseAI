# CLAUDE.md

This file is a working guide for the MediSense AI repository. It should stay aligned with the current code, routes, and workflow.

## Project Overview

MediSense AI is a full-stack medical intelligence platform with a FastAPI backend and a React/Vite frontend.

The current product has four main user experiences:

- Doctor workflow: upload consultation audio -> transcribe -> diarize -> extract entities -> generate SOAP note -> audit -> follow-up PDF/export.
- Google Meet workflow: schedule a consultation, create a Calendar event with Meet link, persist the session, then process the meeting transcript after the call.
- Patient workflow: upload lab reports or wearable exports, generate findings/summaries/plan PDFs, and track medications and biomarker trends.
- Patient chatbot workflow: persistent Medisense AI chat with session memory, attachments, voice input/output, doctor routing, and live doctor takeover.

Additional features currently in the codebase:

- Multilingual patient-side AI output for English plus 10 Indic languages.
- Medication extraction and interaction checks after report analysis.
- Biomarker extraction and trend charts from report data.
- Wearable / health-app ingestion for Apple Health, Fitbit, and Google Fit exports.
- Pre-visit intake forms linked to scheduled meetings.
- SOAP audit pass for generated doctor notes.
- Emergency screening in patient chat and report analysis.
- Visitor-facing website chatbot for product questions and general health info.
- Google OAuth / Google Calendar integration for Meet scheduling.
- Sarvam STT/TTS for patient chat voice features, with Gemini fallback when Sarvam is not configured.

Important product note:

- There is no in-app WebRTC consultation room anymore. The active consultation surface is Google Meet only.

## Development Commands

Backend:

```powershell
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
npm run build
npm run lint
npm run preview
```

Useful scripts:

```powershell
python demo/generate_sample_reports.py
python demo/generate_sample_audio.py
python backend/scripts/setup_google_calendar.py
python backend/force_migration.py
```

## Backend Architecture

### App entry

- `backend/main.py` creates the FastAPI app, configures CORS, runs `init_db()` on startup, and mounts all routers under `/api`.
- Health endpoints exist at both `/health` and `/api/health`.

### Configuration

- `backend/config.py` centralizes all environment settings via `pydantic-settings`.
- All AI and STT/TTS calls are cloud-based. Nothing is downloaded locally.
- Current default STT model is `google/gemini-3-flash-preview`.
- Current default OpenRouter model for most LLM calls is `openai/gpt-4o-mini`.
- `SUPPORTED_LANGUAGES` and `normalize_language()` live here.

### Prompts

- `backend/prompts/` stores plain-text prompt templates.
- Prompt loading is handled by `backend/prompts/__init__.py`.
- There are 19 prompt files currently in the repo.

### Routers

- `backend/routers/auth.py`
  - Register, login, me, language list/update, profile update, profile picture upload, specialty list/update.
- `backend/routers/doctor.py`
  - `WS /doctor/stream-audio`
  - `POST /doctor/upload-audio`
  - `POST /doctor/generate-note`
  - `GET /doctor/sessions/{session_id}/audit`
  - `GET /doctor/sessions/{session_id}/followup/pdf`
  - `POST /doctor/sessions/{session_id}/followup/send-to-patient`
  - `POST /doctor/export-pdf`
  - `GET /doctor/sessions`
  - `GET /doctor/active-chats`
  - `GET /doctor/chat-sessions`
  - `GET /doctor/chat/{session_id}`
  - `POST /doctor/chat/{session_id}/toggle-ai`
  - `POST /doctor/chat/{session_id}/message`
- `backend/routers/patient.py`
  - Upload/analyze/export-pdf/history/file/pdf
  - Biomarker trends
  - Wearable upload and wearable record retrieval
- `backend/routers/medications.py`
  - Medication list/add/delete
  - Interaction checks
  - Dismiss alert
  - Adherence reminder
- `backend/routers/chatbot.py`
  - Public website chatbot message/session endpoints.
  - Uses the multi-agent chatbot pipeline.
- `backend/routers/patient_chatbot.py`
  - `POST /patient/chat/message`
  - `PUT /patient/chat/message/{message_id}`
  - `GET /patient/chat/history/{patient_id}`
  - `GET /patient/chat/session/{session_id}`
  - `POST /patient/chat/session/end`
  - `POST /patient/chat/voice-message`
  - `POST /patient/chat/tts`
  - `GET /patient/chat/attachment/{attachment_id}`
  - `GET /patient/chat/specialties`
  - `GET /patient/chat/doctors`
  - `WS /patient/chat/ws/{session_id}`
  - Recent responses normalize timestamps to UTC-aware values before returning them to the frontend.
- `backend/routers/meet.py`
  - `POST /meet/schedule`
  - `GET /meet/scheduled`
  - `GET /meet/sessions/unprocessed`
  - `POST /meet/link-conference`
  - `POST /meet/process-transcript`
  - `GET /meet/process-status/{task_id}`
  - `POST /meet/webhook`
  - `GET /meet/intake/{token}`
  - `POST /meet/intake/{token}/submit`
  - `GET /meet/sessions/{session_id}/intake-summary`
- `backend/routers/google_oauth.py`
  - Google OAuth status, auth-url, callback, disconnect.

### Services

- `backend/services/claude_service.py`
  - All report, summary, lifestyle, patient-explanation, wearable, intake, follow-up, biomarker, and emergency-screening LLM calls through OpenRouter.
  - Uses `language=` for multilingual patient-side output.
- `backend/services/transcription.py`
  - Audio transcription via Gemini Flash on OpenRouter.
- `backend/services/sarvam_stt_service.py`
  - Sarvam STT for patient voice input and doctor flows where enabled.
  - Falls back to Gemini Flash when Sarvam is unavailable.
- `backend/services/sarvam_tts_service.py`
  - Sarvam TTS for patient chatbot playback.
- `backend/services/diarization.py`
  - Pause-based speaker labeling, pure Python.
- `backend/services/ner.py`
  - Regex-based medical entity extraction, pure Python.
- `backend/services/report_parser.py`
  - PDF text extraction via PyMuPDF plus vision OCR fallback.
- `backend/services/pdf_export.py`
  - ReportLab PDF generation with Unicode font handling for non-English text.
- `backend/services/auth_service.py`
  - Password hashing, JWT, role guards.
- `backend/services/chatbot_agent.py`
  - OpenAI Agents SDK multi-agent router for the public chatbot widget.
- `backend/services/patient_chatbot.py`
  - Persistent patient chatbot agent, session memory, attachment analysis, multilingual responses, and session summarization.
- `backend/services/chat_ws.py`
  - WebSocket bus for doctor/patient live chat takeover.
- `backend/services/medication_service.py`
  - Medication CRUD, extraction, interaction checks, reminders.
- `backend/services/biomarker_service.py`
  - Biomarker extraction and trends.
- `backend/services/intake_service.py`
  - Intake token generation, answer storage, clinical summary generation.
- `backend/services/followup_service.py`
  - Follow-up extraction, PDF generation, send-to-patient tracking.
- `backend/services/wearable_parser_service.py`
  - Apple Health XML, Fitbit JSON, Google Fit JSON/ZIP parsing.
- `backend/services/emergency_screening_service.py`
  - Emergency red-flag screening.
- `backend/services/soap_audit_service.py`
  - SOAP audit generation and parsing.
- `backend/services/specialties.py`
  - Specialty registry and routing helpers.
- `backend/services/google_calendar.py`
  - Google Calendar event creation and Meet link handling.

### Models

- `backend/models/` contains Pydantic schemas for auth, doctor, patient, chatbot, and patient-chatbot flows.
- Medication and intake DTOs live next to their routers instead of in standalone model modules.

### Database

- `backend/database.py` defines the async SQLAlchemy engine and models.
- Database supports SQLite locally and PostgreSQL in production.
- Important tables:
  - `User`
  - `ConsultationSession`
  - `ChatbotSession`
  - `ChatbotMessage`
  - `PatientAnalysisRecord`
  - `PatientChatSession`
  - `PatientChatMessage`
  - `PatientChatAttachment`
  - `DoctorChatSession`
  - `PatientMedication`
  - `MedicationInteractionAlert`
  - `LabBiomarker`
  - `FollowUpPlan`
  - `WearableDataRecord`
  - `PatientChatAudit`

Key gotchas:

- `ConsultationSession.scheduled_at` is stored as a naive `DateTime` in Postgres. Convert incoming ISO datetimes to UTC and strip tzinfo before saving.
- Several boolean-like columns are actually Integer-backed for cross-DB compatibility. Compare and assign with `0` and `1`, not Python `False` and `True`.

## Frontend Architecture

### App entry

- `frontend/src/main.tsx` renders `App`.
- `frontend/src/App.tsx` owns global routing, the navbar, footer, public chatbot widget, and layout wrappers.
- The Vite dev server proxies `/api` to the backend in development.

### Routes

Public routes:

- `/`
- `/about`
- `/contact`
- `/features`
- `/use-cases`
- `/pricing`
- `/security`
- `/integrations`
- `/resources`
- `/login`
- `/register`

Shared/public utility route:

- `/intake/:token`

Doctor routes:

- `/doctor`
- `/doctor/profile`
- `/doctor/chat`

Patient routes:

- `/patient`
- `/patient/profile`
- `/patient/chat`
- `/patient/upload`

Shared authenticated route:

- `/consultation/schedule`

Current frontend page count is 18.

### Components and contexts

- `frontend/src/contexts/AuthContext.tsx` manages auth state.
- `frontend/src/contexts/DoctorChatContext.tsx` manages the doctor chat sidebar/session selection and polls the chat list.
- `frontend/src/components/doctor/DoctorLayout.tsx` wraps doctor pages in the doctor sidebar and chat context provider.
- `frontend/src/components/patient/PatientLayout.tsx` wraps patient pages in the patient sidebar layout.
- `frontend/src/components/ProtectedRoute.tsx` enforces role access.
- `frontend/src/components/LanguageSelector.tsx` updates the patient language via `PATCH /auth/language`.
- `frontend/src/components/ChatbotWidget.tsx` is the floating public chatbot.

### API modules

- `authApi.ts`
- `doctorApi.ts`
- `doctorChatApi.ts`
- `patientApi.ts`
- `medicationApi.ts`
- `chatbotApi.ts`
- `patientChatbotApi.ts`
- `meetApi.ts`
- `googleIntegrationApi.ts`

### Patient and doctor workflows in the UI

- `DoctorDashboard.tsx` handles audio upload, transcript display, SOAP generation, audit, follow-up, export, and Meet transcript processing.
- `DoctorChat.tsx` renders the patient chat console for doctors.
- `PatientDashboard.tsx` is the patient landing page.
- `PatientReportUpload.tsx` handles upload/analyze/history/PDF workflows.
- `PatientChat.tsx` is the persistent Medisense AI chatbot.
- `SchedulePage.tsx` is used by both doctors and patients to create Meet sessions and intake links.
- `IntakeForm.tsx` is the public intake submission screen.

## Key Technical Notes

- All AI, STT, TTS, and vision/OCR runs are cloud-based. Do not introduce local model downloads.
- Prompt text belongs in `backend/prompts/*.txt`, not inline in services.
- The patient language setting flows from `LanguageSelector` -> `PATCH /auth/language` -> `preferred_language` -> all patient-side AI output and PDFs.
- Patient chatbot memory comes from session summaries, prior report history, and current medications. Attachments are stored and re-used across turns.
- Patient chatbot voice input records audio in the browser, sends base64 to `/patient/chat/voice-message`, and uses Sarvam with Gemini fallback.
- Patient chatbot TTS uses `/patient/chat/tts` and plays the returned WAV in the browser.
- Medication tracking and interaction alerts are surfaced after report analysis and in patient chat context.
- Biomarker trends are persisted from report analysis and displayed on the patient dashboard.
- Wearable uploads are parsed server-side and summarized through the wearable narrative prompt.
- The Meet flow is the only consultation video path. Scheduling creates a calendar event and Meet link, stores a consultation row, and generates an intake token.
- Doctors process unprocessed Meet sessions from the dashboard and poll `/meet/process-status/{task_id}` for the result.
- SOAP audit runs as a follow-up pass over generated doctor notes.
- Emergency screening runs both in patient chat and report analysis.

## Verification

When making changes, use the relevant checks:

- Backend: start `python main.py`, verify `/health`, then check `/docs`.
- Frontend: run `npm run lint` and `npm run build`.
- For UI changes, test the affected routes in the browser.

## Git / Workflow Notes

- Do not revert user changes you did not make.
- The repository may be dirty while you work. Check `git status` before editing sensitive files.
- Prefer small, targeted edits and keep prompt changes in `backend/prompts/`.
