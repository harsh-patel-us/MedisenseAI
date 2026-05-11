# MediSense AI 🩺

> **AI-Powered Health Intelligence Platform**  
> *From consultation to care — audio to SOAP notes for doctors, lab reports to health guides for patients, an AI medical companion that remembers everything, and a multilingual experience for English plus 10 Indian languages.*

**All AI/ML runs via cloud APIs** (OpenRouter, Sarvam AI, Google) — no models are downloaded or executed locally.

---

## 🚀 Quick Start

### Prerequisites

| Tool | Version | Required |
|------|---------|----------|
| Python | 3.11+ | ✅ |
| Node.js | 18+ | ✅ |
| OpenRouter API key | — | ✅ (for AI features) |

No local model downloads, no GPU, no Tesseract — all ML runs via cloud APIs.

---

### 1. Backend Setup

```bash
cd backend

# Create and activate virtual environment
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
# Copy .env.example to .env and fill in your API keys
# (at minimum: OPENROUTER_API_KEY)

# Start the backend server
python main.py
# OR
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Backend API docs: http://localhost:8000/docs  
Health check: http://localhost:8000/health

---

### 2. Frontend Setup

```bash
cd frontend

npm install
npm run dev
```

Frontend: http://localhost:5173

---

### 3. Google Calendar Setup (Optional, one-time)

```bash
cd backend
python scripts/setup_google_calendar.py
# Follow the browser prompts, then paste the output into .env:
#   GOOGLE_REFRESH_TOKEN=...
#   GOOGLE_CALENDAR_EMAIL=...
```

---

### 4. Bundle a Unicode font for non-English PDFs (Optional, recommended for production)

Drop `NotoSans-Regular.ttf` and `NotoSans-Bold.ttf` into `backend/fonts/`. The PDF
exporter picks them up first when registering the Unicode font family. On Windows
the system-installed `Nirmala.ttc` (pan-Indic) is auto-detected as a fallback —
no action needed for local development.

---

### 5. Generate Demo Reports (Optional)

```bash
# From the project root
pip install reportlab
python demo/generate_sample_reports.py
```

This creates 3 realistic PDF lab reports in `demo/sample_reports/` for testing:
- `diabetes_blood_report.pdf` — Elevated glucose, HbA1c, low haemoglobin
- `low_haemoglobin_cbc.pdf` — Iron deficiency anaemia
- `liver_function_test.pdf` — Hepatic stress markers

### 6. Generate Demo Doctor/Patient Audio (Optional)

```bash
# From the project root
pip install gTTS
python demo/generate_sample_audio.py
```

Writes `demo/sample_audio/doctor_patient_demo.mp3` (~15-20 sec dialog about a
cough + low-grade fever) and `doctor_patient_demo.txt` (the spoken script).
Upload the MP3 in the Doctor Dashboard → **Upload Consultation Audio** card to
test the end-to-end transcription → SOAP-note flow.

---

## 🏗️ Architecture

```
MediSenseAI/
├── backend/                  # FastAPI Python backend
│   ├── main.py               # App entry point (lifespan, CORS, routers)
│   ├── config.py             # Settings + SUPPORTED_LANGUAGES + normalize_language()
│   ├── database.py           # Async ORM (15 tables, SQLite or Postgres)
│   ├── requirements.txt
│   │
│   ├── prompts/              # 20 AI prompt templates (plain-text files)
│   │   ├── __init__.py       # Loader — reads .txt files, exports constants
│   │   ├── soap_note.txt
│   │   ├── soap_audit.txt
│   │   ├── report_analysis.txt
│   │   ├── summary_specialist.txt
│   │   ├── lifestyle_guide.txt
│   │   ├── patient_explanation.txt
│   │   ├── patient_chatbot_system.txt
│   │   ├── patient_chatbot_summary.txt
│   │   ├── chatbot_system.txt
│   │   ├── safety_system.txt
│   │   ├── language_instruction.txt          # multilingual directive
│   │   ├── medication_extraction.txt
│   │   ├── medication_interaction.txt
│   │   ├── adherence_reminder.txt
│   │   ├── biomarker_extraction.txt
│   │   ├── wearable_narrative.txt
│   │   ├── intake_summary.txt
│   │   ├── followup_extraction.txt
│   │   └── emergency_screening.txt
│   │
│   ├── routers/              # 8 routers, all mounted under /api
│   │   ├── auth.py           # JWT auth + language + profile + specialty
│   │   ├── doctor.py         # Audio upload, SOAP, audit, follow-up, sessions, doctor↔patient chat
│   │   ├── patient.py        # Report upload/analyze/PDF/history, biomarker trends, wearables
│   │   ├── medications.py    # Medication CRUD + interaction alerts + reminder feed
│   │   ├── chatbot.py        # Website support chatbot widget
│   │   ├── patient_chatbot.py # Medisense AI persistent chat + WebSocket takeover
│   │   ├── meet.py           # Google Meet schedule + process + intake form
│   │   └── google_oauth.py   # Google Calendar OAuth flow
│   │
│   ├── services/             # 22 service modules
│   │   ├── claude_service.py        # All LLM calls via OpenRouter + vision OCR
│   │   ├── transcription.py         # STT (Gemini Flash via OpenRouter)
│   │   ├── diarization.py           # Speaker labeling (pause-based heuristic)
│   │   ├── ner.py                   # Medical NER (regex keyword matching)
│   │   ├── report_parser.py         # PDF text extraction (PyMuPDF + vision OCR)
│   │   ├── pdf_export.py            # PDF generation with Unicode font family
│   │   ├── auth_service.py          # Password hashing + JWT + role guards
│   │   ├── chatbot_agent.py         # Website chatbot multi-agent system
│   │   ├── patient_chatbot.py       # Medisense AI agent + memory
│   │   ├── chat_ws.py               # Doctor↔patient WebSocket bus
│   │   ├── medication_service.py    # Medication tracking + interaction checks
│   │   ├── biomarker_service.py     # Biomarker extraction + trends
│   │   ├── intake_service.py        # Pre-visit intake form + AI summary
│   │   ├── followup_service.py      # Follow-up extraction + PDF
│   │   ├── wearable_parser_service.py  # Apple/Fitbit/Google Fit ingestion
│   │   ├── emergency_screening_service.py  # Red-flag screening
│   │   ├── soap_audit_service.py    # SOAP note re-grading
│   │   ├── specialties.py           # Doctor specialty registry + routing
│   │   ├── google_calendar.py       # Google Calendar + Meet link creation
│   │   ├── sarvam_stt_service.py    # Sarvam AI speech-to-text
│   │   └── sarvam_tts_service.py    # Sarvam AI text-to-speech
│   │
│   ├── models/               # Pydantic request/response schemas
│   │   ├── auth_models.py
│   │   ├── doctor_models.py
│   │   ├── patient_models.py
│   │   ├── chatbot_models.py
│   │   └── patient_chatbot_models.py
│   │
│   ├── fonts/                # Optional: drop NotoSans-Regular/Bold.ttf for prod
│   │
│   ├── scripts/
│   │   └── setup_google_calendar.py  # One-time Google OAuth setup
│   │
│   └── utils/
│       ├── helpers.py        # ID generation, file validation
│       └── storage.py        # File storage utilities
│
├── frontend/                 # React 19 + TypeScript + Vite
│   ├── index.html            # Entry HTML with medical favicon
│   └── src/
│       ├── App.tsx           # Landing page + Navbar + routing
│       ├── index.css         # Glassmorphism design system (vanilla CSS)
│       ├── main.tsx          # React entry point
│       │
│       ├── pages/            # 18 pages (no in-app video room)
│       │   ├── Login.tsx / Register.tsx          # Auth
│       │   ├── ProfilePage.tsx                   # Profile + language + specialty
│       │   ├── DoctorDashboard.tsx               # Audio → SOAP + audit + follow-up + Meet processing
│       │   ├── DoctorChat.tsx                    # Live doctor↔patient chat console
│       │   ├── PatientDashboard.tsx              # Patient landing (recent reports, alerts)
│       │   ├── PatientReportUpload.tsx           # 7-tab report results
│       │   ├── PatientChat.tsx                   # Medisense AI chatbot + specialist picker
│       │   ├── IntakeForm.tsx                    # Public pre-visit intake form
│       │   ├── SchedulePage.tsx                  # Doctor + patient scheduling
│       │   └── 8 marketing pages (About, Contact, Features, UseCases,
│       │                          Pricing, Security, Integrations, Resources)
│       │
│       ├── components/
│       │   ├── ChatbotWidget.tsx                 # Floating visitor chatbot
│       │   ├── ProtectedRoute.tsx                # Role-based route guard
│       │   ├── ScrollToTop.tsx
│       │   ├── LanguageSelector.tsx              # Pickable in profile + chat header
│       │   ├── doctor/      # AudioFileUpload, TranscriptView, SoapNoteEditor,
│       │   │                # SoapAuditPanel, FollowUpCard, DoctorLayout,
│       │   │                # DoctorSidebar, DoctorChatView, DoctorChatOverlay
│       │   └── patient/     # ReportUploader, ReportSummary, SpecialistGuide,
│       │                    # DietExercisePlan, PrecautionsList, MedicationTracker,
│       │                    # LabTrendChart, WearableUploader, EmergencyAlert,
│       │                    # PatientLayout, PatientSidebar
│       │
│       ├── api/             # 9 modules: authApi, doctorApi, doctorChatApi,
│       │                    # patientApi, medicationApi, chatbotApi,
│       │                    # patientChatbotApi, meetApi, googleIntegrationApi
│       ├── contexts/        # AuthContext (user, token, login/logout, setUser)
│       ├── hooks/           # useAudioRecorder, useWebSocket
│       └── types/           # auth, doctor, patient, medication,
│                            # consultation (Google + intake), chatbot, patientChatbot
│
└── demo/
    ├── sample_reports/      # PDF lab reports for testing
    ├── sample_transcripts/  # Consultation scripts
    ├── sample_audio/        # Doctor/patient demo MP3 + ground-truth script
    ├── generate_sample_reports.py
    └── generate_sample_audio.py
```

---

## 🤖 Features

### Doctor Side
| Feature | Status |
|---------|--------|
| Audio file upload (mp3, wav, webm, ogg, flac, m4a) | ✅ |
| Speech-to-text (Gemini Flash via OpenRouter) | ✅ |
| Speaker diarization (Doctor/Patient) — pause-based heuristic | ✅ |
| Medical NER (symptoms, drugs, diagnoses) — regex extraction | ✅ |
| AI SOAP note generation | ✅ |
| Editable note editor with 4 sections | ✅ |
| **SOAP audit panel** (LLM re-grades the generated note) | ✅ |
| **Follow-up card** (AI-extracted tasks + downloadable plan + send-to-patient) | ✅ |
| Copy to clipboard | ✅ |
| PDF export | ✅ |
| Session history | ✅ |
| **Live doctor↔patient chat** with AI takeover toggle | ✅ |
| **Pre-visit intake summary** shown above the SOAP note | ✅ |
| Google Meet transcript processing | ✅ |
| ~~Browser microphone recording with live WebSocket streaming~~ | ❌ Removed — replaced by upload flow |

### Patient Side
| Feature | Status |
|---------|--------|
| Drag-and-drop file upload (PDF/JPG/PNG) | ✅ |
| PyMuPDF text extraction | ✅ |
| Vision OCR fallback (via OpenRouter, no local Tesseract) | ✅ |
| AI report analysis (findings table) | ✅ |
| Plain-language summary | ✅ |
| Specialist recommendations + urgency | ✅ |
| Personalized diet plan | ✅ |
| Safe exercise plan | ✅ |
| Daily precautions + emergency signs | ✅ |
| **Medication tracker + drug interaction alerts** | ✅ |
| **Biomarker trend charts** | ✅ |
| **Wearable / health-app data ingestion** (Apple Health, Fitbit, Google Fit) | ✅ |
| **Emergency screening** (red-flag detection) | ✅ |
| **Pre-visit intake form** (token-gated public link) | ✅ |
| PDF health guide export (Unicode-safe across all 11 supported languages) | ✅ |
| Past reports list with View / File / PDF actions | ✅ |

### Patient AI Chatbot (Medisense AI)
| Feature | Status |
|---------|--------|
| Persistent chat sessions with full history | ✅ |
| Session sidebar with grouped history (Today, Yesterday, etc.) | ✅ |
| Auto-generated session titles from first message | ✅ |
| Auto-generated session summaries (every N messages + on close) | ✅ |
| Memory injection (past sessions + uploaded reports + active medications) | ✅ |
| File attachments (images + PDFs) with vision AI analysis | ✅ |
| Voice input via Sarvam AI STT (with Gemini Flash fallback) | ✅ |
| Voice output via Sarvam AI TTS (bulbul:v3) | ✅ |
| Animated "thinking" indicator (shimmer + bouncing dots) | ✅ |
| **Doctor specialty / specific-doctor picker** | ✅ |
| **Live doctor takeover** via WebSocket (AI-off toggle) | ✅ |
| Medical safety guardrails | ✅ |

### Multilingual
| Feature | Status |
|---------|--------|
| English + 10 Indic languages (Hindi, Gujarati, Bengali, Tamil, Telugu, Marathi, Kannada, Malayalam, Punjabi, Urdu) | ✅ |
| Per-user `preferred_language` setting | ✅ |
| Per-call language directive injected into every LLM prompt | ✅ |
| Unicode-safe PDF generation (Nirmala UI on Windows / NotoSans bundle elsewhere) | ✅ |
| Language picker in patient chat header + profile page | ✅ |

### Video Consultations (Google Meet)
| Feature | Status |
|---------|--------|
| Schedule a consultation (doctor **or** patient) | ✅ |
| Google Calendar event with auto-generated Meet link | ✅ |
| Email invite to the other party (when calendar invite is configured) | ✅ |
| **Pre-visit intake URL generated automatically** | ✅ |
| Upcoming-meetings list with one-click "Join Google Meet" / "Open in Calendar" | ✅ |
| Auto-link the Meet conference id to the consultation session | ✅ |
| Doctor-side Meet transcript processing (diarization → NER → SOAP → audit → follow-up) | ✅ |
| Patient-friendly post-call explanation generated from the transcript | ✅ |
| Webhook (`POST /meet/webhook`, HMAC-SHA256) for "meeting ended" auto-processing | ✅ |
| ~~In-app WebRTC video room with 6-character join code~~ | ❌ Removed — Google Meet only |

### Platform
| Feature | Status |
|---------|--------|
| JWT authentication (doctor/patient roles) | ✅ |
| Profile editing + profile-pic upload + doctor specialty | ✅ |
| Protected routes with role-based access | ✅ |
| Responsive glassmorphism UI | ✅ |
| Dedicated patient + doctor sidebars / layouts | ✅ |
| Marketing landing page with interactive demo | ✅ |
| Floating chatbot widget for visitors | ✅ |
| 8 marketing pages (Features, Pricing, Security, etc.) | ✅ |
| Custom medical favicon | ✅ |

---

## 🔐 Environment Variables

Create `backend/.env` — all variables are loaded by `config.py` via pydantic-settings:

```env
# ── OpenRouter / LLM ─────────────────────────
OPENROUTER_API_KEY=your_key_here
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

# ── Speech-to-text model ─────────────────────
WHISPER_MODEL=google/gemini-2.5-flash

# ── Database ─────────────────────────────────
DATABASE_URL=sqlite+aiosqlite:///./medisense.db

# ── CORS ─────────────────────────────────────
FRONTEND_URL=http://localhost:5173

# ── Consultation / Medical LLM ───────────────
MEDICAL_MODEL=openai/gpt-4o-mini

# ── Auth / JWT ───────────────────────────────
JWT_SECRET=<generate-with-python-secrets-token-hex-32>
JWT_ALGORITHM=HS256
JWT_EXPIRES_MINUTES=10080

# ── Google Calendar OAuth ────────────────────
GOOGLE_CLIENT_ID=<from-google-cloud-console>
GOOGLE_CLIENT_SECRET=<from-google-cloud-console>
GOOGLE_REDIRECT_URI=http://localhost:8000/integrations/google/callback
GOOGLE_POST_AUTH_REDIRECT=http://localhost:5173/consultation/schedule

# ── Platform-level Google account ────────────
# Run: python scripts/setup_google_calendar.py
GOOGLE_REFRESH_TOKEN=<from-setup-script>
GOOGLE_CALENDAR_EMAIL=<email>

# ── Google Meet transcript webhook ───────────
GOOGLE_MEET_WEBHOOK_SECRET=<generate-with-python-secrets-token-hex-32>

# ── Sarvam AI (Indic STT/TTS) ────────────────
# Leave SARVAM_API_KEY empty to fall back to Gemini Flash
SARVAM_API_KEY=
SARVAM_STT_MODEL=saaras:v3
SARVAM_TTS_MODEL=bulbul:v3
SARVAM_BASE_URL=https://api.sarvam.ai
SARVAM_WS_BASE_URL=wss://api.sarvam.ai
SARVAM_TTS_SPEAKER=anushka
SARVAM_TTS_LANGUAGE=en-IN
```

---

## 📋 Demo Scenarios

### Scenario 1 — Doctor Side (Audio Upload)
1. Register/login as a **doctor** (set your specialty during onboarding)
2. Generate the demo audio: `pip install gTTS && python demo/generate_sample_audio.py`
3. Go to **Doctor Dashboard** → **Upload Consultation Audio** card
4. Select `demo/sample_audio/doctor_patient_demo.mp3` (or any consultation recording up to 20 MB)
5. Click **Transcribe Audio** → wait for the transcript to appear
6. Click **Generate SOAP Note** → review and edit → check the **SOAP audit** panel and **Follow-up** card → **Download PDF**
7. Click **Upload Another Audio File** to start a new session

### Scenario 2 — Patient Side (Diabetes Report)
1. Register/login as a **patient** (pick a preferred language during signup or in Profile)
2. Go to **Patient Dashboard** → click "Upload Report"
3. Upload `demo/sample_reports/diabetes_blood_report.pdf`
4. Watch the continuous **Upload › Analysis › Ready** loader; the 7 tabs (Summary, Specialist, Diet, Precautions, Medications, Trends, Wearables) appear when ready
5. Switch the language in the chat header (or Profile) and re-export the PDF — the health guide renders in your chosen language

### Scenario 3 — Patient AI Chatbot
1. Login as a **patient**
2. Click **Chat with Medisense AI** from the sidebar
3. Pick a specialty / specific doctor from "Available Specialists"
4. Ask about symptoms, medications, or upload a lab report image (the chatbot already knows your active medications + interaction alerts)
5. Use the microphone button for voice input (Sarvam AI STT)
6. Toggle TTS in the header for voice replies
7. Start a new chat — the AI remembers your history from previous sessions

### Scenario 4 — Schedule + Run a Google Meet Consultation
1. Login as a **doctor** or **patient** → go to **Schedule**
2. Fill in the form (other party's name + email, date/time, duration, reason) → submit
3. The success panel shows the Meet link **and** a tokenized pre-visit intake URL — copy and send to the patient
4. The patient opens the intake URL, answers the questions, and submits — the doctor sees an AI clinical summary on their dashboard
5. At meeting time, click **Join Google Meet** from the Upcoming card (or open the link from the calendar invite)
6. After the call, login as the **doctor** → **Doctor Dashboard** → "Process Google Meet Consultation" section
7. Click **Process** on the unprocessed session → the Meet transcript is run through diarization → NER → SOAP, the SOAP note appears in the editor (with the intake summary right above it), the audit + follow-up panels populate, and the patient gets a plain-language post-call explanation

> Google Meet transcripts require a Google Workspace plan (Business Standard or higher). Free `@gmail.com` accounts can host the call but won't produce a transcript for processing.

### Scenario 5 — Doctor Live Chat with a Patient
1. Login as a **doctor** → **Doctor Chat** from the sidebar
2. Pick an active patient session from the list
3. Read the conversation so far; toggle **AI off** to take over and reply yourself, or leave it on so the AI keeps drafting answers
4. Messages flow through `/api/patient/chat/ws/{session_id}` in real time

---

## ⚠️ Medical Disclaimer

All AI-generated outputs are for **educational and demonstration purposes only**.  
They are NOT a substitute for professional medical advice, diagnosis, or treatment.  
Always consult a qualified healthcare provider before making any health decisions.

---

*MediSense AI — AI-Powered Health Intelligence Platform | Powered by OpenRouter + GPT-4o-mini + Sarvam AI + Google Calendar/Meet*
