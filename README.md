# MediSense AI 🩺

> **AI-Powered Health Intelligence Platform**  
> *From consultation to care — audio to SOAP notes for doctors, lab reports to health guides for patients, and an AI medical companion that remembers everything.*

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

### 4. Generate Demo Reports (Optional)

```bash
# From the project root
pip install reportlab
python demo/generate_sample_reports.py
```

This creates 3 realistic PDF lab reports in `demo/sample_reports/` for testing:
- `diabetes_blood_report.pdf` — Elevated glucose, HbA1c, low haemoglobin
- `low_haemoglobin_cbc.pdf` — Iron deficiency anaemia
- `liver_function_test.pdf` — Hepatic stress markers

---

## 🏗️ Architecture

```
MediSenseAI/
├── backend/                  # FastAPI Python backend
│   ├── main.py               # App entry point (lifespan, CORS, routers)
│   ├── config.py             # Settings loaded from .env (no prompts)
│   ├── database.py           # SQLite async ORM (7 tables)
│   ├── requirements.txt
│   │
│   ├── prompts/              # AI prompt templates (plain-text files)
│   │   ├── __init__.py       # Loader — reads .txt files, exports constants
│   │   ├── soap_note.txt
│   │   ├── report_analysis.txt
│   │   ├── summary_specialist.txt
│   │   ├── lifestyle_guide.txt
│   │   ├── patient_explanation.txt
│   │   ├── patient_chatbot_system.txt
│   │   ├── patient_chatbot_summary.txt
│   │   ├── chatbot_system.txt
│   │   └── safety_system.txt
│   │
│   ├── routers/
│   │   ├── auth.py           # JWT register/login/me
│   │   ├── doctor.py         # WebSocket audio + SOAP endpoints
│   │   ├── patient.py        # Report upload, analysis, PDF export
│   │   ├── consultation.py   # Video call rooms, WebRTC, post-call summaries
│   │   ├── chatbot.py        # Website support chatbot widget
│   │   ├── patient_chatbot.py # Medisense AI persistent patient chatbot
│   │   ├── meet.py           # Google Meet transcript processing
│   │   └── google_oauth.py   # Google Calendar OAuth flow
│   │
│   ├── services/
│   │   ├── claude_service.py     # All LLM calls via OpenRouter + vision OCR
│   │   ├── transcription.py     # STT (Gemini Flash via OpenRouter)
│   │   ├── diarization.py       # Speaker labeling (pause-based heuristic)
│   │   ├── ner.py               # Medical NER (regex keyword matching)
│   │   ├── report_parser.py     # PDF text extraction (PyMuPDF + vision OCR)
│   │   ├── pdf_export.py        # PDF generation (ReportLab)
│   │   ├── auth_service.py      # Password hashing + JWT
│   │   ├── chatbot_agent.py     # Website chatbot multi-agent system
│   │   ├── patient_chatbot.py   # Medisense AI agent + memory
│   │   ├── google_calendar.py   # Google Calendar + Meet link creation
│   │   ├── sarvam_stt_service.py # Sarvam AI speech-to-text
│   │   └── sarvam_tts_service.py # Sarvam AI text-to-speech
│   │
│   ├── models/
│   │   ├── auth_models.py
│   │   ├── doctor_models.py
│   │   ├── patient_models.py
│   │   ├── chatbot_models.py
│   │   └── patient_chatbot_models.py
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
│       ├── pages/
│       │   ├── Login.tsx / Register.tsx        # Auth
│       │   ├── DoctorDashboard.tsx             # Audio → SOAP workflow
│       │   ├── PatientDashboard.tsx            # Report → health guide
│       │   ├── PatientChat.tsx                 # Medisense AI chatbot
│       │   ├── ConsultationRoom.tsx            # WebRTC video call
│       │   ├── JoinConsultation.tsx            # Join with room code
│       │   ├── SchedulePage.tsx                # Doctor scheduling + Google Calendar
│       │   └── AboutPage, ContactPage, FeaturesPage, UseCasesPage,
│       │       PricingPage, SecurityPage, IntegrationsPage, ResourcesPage
│       │
│       ├── components/
│       │   ├── ChatbotWidget.tsx               # Floating visitor chatbot
│       │   ├── ProtectedRoute.tsx              # Role-based route guard
│       │   ├── ScrollToTop.tsx
│       │   ├── doctor/       # AudioRecorder, LiveTranscript, SoapNoteEditor
│       │   ├── patient/      # ReportUploader, ReportSummary, SpecialistGuide,
│       │   │                 # DietExercisePlan, PrecautionsList
│       │   └── consultation/ # VideoGrid, CallControls,
│       │                     # ConsultationTranscript, PostCallSummary
│       │
│       ├── api/              # authApi, doctorApi, patientApi,
│       │                     # consultationApi, chatbotApi, patientChatbotApi,
│       │                     # meetApi, googleIntegrationApi
│       ├── contexts/         # AuthContext (user, token, login/logout)
│       ├── hooks/            # useAudioRecorder, useWebSocket
│       └── types/            # auth, doctor, patient, consultation,
│                             # chatbot, patientChatbot
│
└── demo/
    ├── sample_reports/       # PDF lab reports for testing
    ├── sample_transcripts/   # Consultation scripts
    └── generate_sample_reports.py
```

---

## 🤖 Features

### Doctor Side
| Feature | Status |
|---------|--------|
| Browser microphone recording | ✅ |
| Real-time WebSocket audio streaming | ✅ |
| Speech-to-text (Gemini Flash via OpenRouter) | ✅ |
| Speaker diarization (Doctor/Patient) — pause-based heuristic | ✅ |
| Medical NER (symptoms, drugs, diagnoses) — regex extraction | ✅ |
| AI SOAP note generation | ✅ |
| Editable note editor with 4 sections | ✅ |
| Copy to clipboard | ✅ |
| PDF export | ✅ |
| Session history | ✅ |
| Google Meet transcript processing | ✅ |

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
| PDF health guide export | ✅ |

### Patient AI Chatbot (Medisense AI)
| Feature | Status |
|---------|--------|
| Persistent chat sessions with full history | ✅ |
| Session sidebar with grouped history (Today, Yesterday, etc.) | ✅ |
| Auto-generated session titles from first message | ✅ |
| Auto-generated session summaries (every N messages + on close) | ✅ |
| Memory injection (past sessions + uploaded reports) | ✅ |
| File attachments (images + PDFs) with vision AI analysis | ✅ |
| Voice input via Sarvam AI STT (with Gemini Flash fallback) | ✅ |
| Voice output via Sarvam AI TTS (bulbul:v3) | ✅ |
| Animated "thinking" indicator (shimmer + bouncing dots) | ✅ |
| Medical safety guardrails | ✅ |

### Video Consultations
| Feature | Status |
|---------|--------|
| WebRTC browser-native video calls | ✅ |
| 6-character room code for patient join | ✅ |
| Real-time transcript during call | ✅ |
| Auto SOAP note generation post-call | ✅ |
| Patient-friendly post-call explanation | ✅ |
| Doctor scheduling interface | ✅ |
| Google Calendar + Meet link integration | ✅ |

### Platform
| Feature | Status |
|---------|--------|
| JWT authentication (doctor/patient roles) | ✅ |
| Protected routes with role-based access | ✅ |
| Responsive glassmorphism UI | ✅ |
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

### Scenario 1 — Doctor Side (Chest Pain)
1. Register/login as a **doctor**
2. Go to **Doctor Dashboard** → click **Start Recording**
3. Read the `demo/sample_transcripts/chest_pain_consultation.txt` script aloud
4. Click **Stop Recording** → **Generate SOAP Note**
5. Review the AI-generated SOAP note → **Download PDF**

### Scenario 2 — Patient Side (Diabetes Report)
1. Register/login as a **patient**
2. Go to **Patient Dashboard**
3. Upload `demo/sample_reports/diabetes_blood_report.pdf`
4. View all 4 tabs: Summary, Specialists, Diet & Exercise, Precautions
5. Click **Download PDF** to get the health guide

### Scenario 3 — Patient AI Chatbot
1. Login as a **patient**
2. Click **Chat with Medisense AI** from the patient dashboard
3. Ask about symptoms, medications, or upload a lab report image
4. Use the microphone button for voice input (Sarvam AI STT)
5. Toggle TTS in the header for voice replies
6. Start a new chat — the AI remembers your history from previous sessions

### Scenario 4 — Video Consultation
1. Login as a **doctor** → go to **Schedule** → create a consultation
2. Share the 6-character room code with the patient
3. Patient logs in → **Join Call** → enters the code
4. After the call, the doctor gets an auto-generated SOAP note and the patient gets a plain-language explanation

### Scenario 5 — Google Meet Consultation
1. Login as a **doctor** → go to **Schedule** → create a consultation with Google Calendar
2. A Google Calendar event with Meet link is auto-created
3. After the Meet call, go to **Doctor Dashboard** → find the unprocessed session
4. Click **Process** → the Meet transcript is processed through diarization → NER → SOAP pipeline

---

## ⚠️ Medical Disclaimer

All AI-generated outputs are for **educational and demonstration purposes only**.  
They are NOT a substitute for professional medical advice, diagnosis, or treatment.  
Always consult a qualified healthcare provider before making any health decisions.

---

*MediSense AI — AI-Powered Health Intelligence Platform | Powered by OpenRouter + GPT-4o-mini*
