# MediSense AI 🩺

> **AI-Powered Health Intelligence Platform**  
> *From consultation to care — audio to SOAP notes for doctors, lab reports to health guides for patients, and an AI medical companion that remembers everything.*

---

## 🚀 Quick Start

### Prerequisites

| Tool | Version | Required |
|------|---------|----------|
| Python | 3.11+ | ✅ |
| Node.js | 18+ | ✅ |
| OpenRouter API key | — | ✅ (for AI features) |
| Tesseract OCR | 5.x | Optional (for scanned image OCR) |

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
# Copy .env.example to .env and fill in your API key:
#   OPENROUTER_API_KEY=sk-or-...

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

### 3. Generate Demo Reports (Optional)

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
│   ├── config.py             # Settings + all 6 AI prompt templates
│   ├── database.py           # SQLite async ORM (7 tables)
│   ├── requirements.txt
│   │
│   ├── routers/
│   │   ├── auth.py           # JWT register/login/me
│   │   ├── doctor.py         # WebSocket audio + SOAP endpoints
│   │   ├── patient.py        # Report upload, analysis, PDF export
│   │   ├── consultation.py   # Video call rooms, WebRTC, post-call summaries
│   │   ├── chatbot.py        # Website support chatbot widget
│   │   └── patient_chatbot.py # Dr. MediSense persistent patient chatbot
│   │
│   ├── services/
│   │   ├── claude_service.py     # All LLM calls via OpenRouter
│   │   ├── transcription.py     # STT (Gemini Flash)
│   │   ├── diarization.py       # Speaker labeling (pyannote.audio)
│   │   ├── ner.py               # Medical NER (scispaCy + regex)
│   │   ├── report_parser.py     # PDF/OCR text extraction
│   │   ├── pdf_export.py        # PDF generation (ReportLab)
│   │   ├── auth_service.py      # Password hashing + JWT
│   │   ├── chatbot_agent.py     # Website chatbot agent
│   │   └── patient_chatbot.py   # Dr. MediSense agent + memory
│   │
│   ├── models/
│   │   ├── auth_models.py
│   │   ├── doctor_models.py
│   │   ├── patient_models.py
│   │   ├── chatbot_models.py
│   │   └── patient_chatbot_models.py
│   │
│   └── utils/
│       ├── helpers.py        # ID generation, file validation
│       └── storage.py        # File storage utilities
│
├── frontend/                 # React 19 + TypeScript + Vite
│   └── src/
│       ├── App.tsx           # Landing page + Navbar + routing
│       ├── index.css         # Glassmorphism design system (vanilla CSS)
│       ├── main.tsx          # React entry point
│       │
│       ├── pages/
│       │   ├── Login.tsx / Register.tsx        # Auth
│       │   ├── DoctorDashboard.tsx             # Audio → SOAP workflow
│       │   ├── PatientDashboard.tsx            # Report → health guide
│       │   ├── PatientChat.tsx                 # Dr. MediSense chatbot
│       │   ├── ConsultationRoom.tsx            # WebRTC video call
│       │   ├── JoinConsultation.tsx            # Join with room code
│       │   ├── SchedulePage.tsx                # Doctor scheduling
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
│       │                     # consultationApi, chatbotApi, patientChatbotApi
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
| Speaker diarization (Doctor/Patient) | ✅ |
| Medical NER (symptoms, drugs, diagnoses) | ✅ |
| AI SOAP note generation | ✅ |
| Editable note editor with 4 sections | ✅ |
| Copy to clipboard | ✅ |
| PDF export | ✅ |
| Session history | ✅ |

### Patient Side
| Feature | Status |
|---------|--------|
| Drag-and-drop file upload (PDF/JPG/PNG) | ✅ |
| PyMuPDF text extraction | ✅ |
| Tesseract OCR fallback | ✅ |
| AI report analysis (findings table) | ✅ |
| Plain-language summary | ✅ |
| Specialist recommendations + urgency | ✅ |
| Personalized diet plan | ✅ |
| Safe exercise plan | ✅ |
| Daily precautions + emergency signs | ✅ |
| PDF health guide export | ✅ |

### Patient AI Chatbot (Dr. MediSense)
| Feature | Status |
|---------|--------|
| Persistent chat sessions with full history | ✅ |
| Session sidebar with grouped history (Today, Yesterday, etc.) | ✅ |
| Auto-generated session titles from first message | ✅ |
| Auto-generated session summaries (every N messages + on close) | ✅ |
| Memory injection (past sessions + uploaded reports) | ✅ |
| File attachments (images + PDFs) with vision AI analysis | ✅ |
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

### Platform
| Feature | Status |
|---------|--------|
| JWT authentication (doctor/patient roles) | ✅ |
| Protected routes with role-based access | ✅ |
| Responsive glassmorphism UI | ✅ |
| Marketing landing page with interactive demo | ✅ |
| Floating chatbot widget for visitors | ✅ |
| 8 marketing pages (Features, Pricing, Security, etc.) | ✅ |

---

## 🔐 Environment Variables

Create `backend/.env`:

```env
# OpenRouter API
OPENROUTER_API_KEY=your_key_here
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
AI_MODEL=openai/gpt-4o-mini
MEDICAL_MODEL=openai/gpt-4o-mini

# App settings
APP_HOST=127.0.0.1
APP_PORT=8000
ENVIRONMENT=development

# File upload
UPLOAD_DIR=./tmp/medisense_uploads
MAX_FILE_SIZE_MB=20
ALLOWED_FILE_TYPES=application/pdf,image/jpeg,image/png

# Speech-to-text model
WHISPER_MODEL=google/gemini-2.5-flash

# Database
DATABASE_URL=sqlite+aiosqlite:///./medisense.db

# CORS
FRONTEND_URL=http://localhost:5173

# Optional
# HF_TOKEN=hf_...              # For pyannote speaker diarization
# TESSERACT_CMD=C:/...          # Path to tesseract.exe on Windows
# JWT_SECRET=change-me-in-prod  # Override for production
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
2. Click **Chat with Dr. MediSense** from the patient dashboard
3. Ask about symptoms, medications, or upload a lab report image
4. Start a new chat — the AI remembers your history from previous sessions

### Scenario 4 — Video Consultation
1. Login as a **doctor** → go to **Schedule** → create a consultation
2. Share the 6-character room code with the patient
3. Patient logs in → **Join Call** → enters the code
4. After the call, the doctor gets an auto-generated SOAP note and the patient gets a plain-language explanation

---

## ⚠️ Medical Disclaimer

All AI-generated outputs are for **educational and demonstration purposes only**.  
They are NOT a substitute for professional medical advice, diagnosis, or treatment.  
Always consult a qualified healthcare provider before making any health decisions.

---

*MediSense AI — AI-Powered Health Intelligence Platform | Powered by OpenRouter + GPT-4o-mini*
