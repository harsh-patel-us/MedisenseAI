# MediSense AI 🩺

> **AI-Powered Health Intelligence Platform**  
> *From consultation to care — audio to SOAP notes for doctors, lab reports to health guides for patients.*

---

## 🚀 Quick Start

### Prerequisites

| Tool | Version | Required |
|------|---------|----------|
| Python | 3.11+ | ✅ |
| Node.js | 18+ | ✅ |
| OpenRouter API key | — | ✅ (for AI features) |
| Tesseract OCR | 5.x | Optional (for image OCR) |

---

### 1. Backend Setup

```bash
# Navigate to backend
cd backend

# Create and activate virtual environment
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
# Edit .env and fill in your OpenRouter API key:
#   OPENROUTER_API_KEY=sk-or-...
#   AI_MODEL=openai/gpt-4o-mini

# Start the backend server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Backend API docs: http://localhost:8000/docs  
Health check: http://localhost:8000/health

---

### 2. Frontend Setup

```bash
# Navigate to frontend
cd frontend

# Install dependencies
npm install

# Start development server
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
├── backend/          # FastAPI Python backend
│   ├── main.py       # App entry point
│   ├── config.py     # Settings + AI prompts
│   ├── database.py   # SQLite async ORM
│   ├── routers/      # doctor.py + patient.py
│   ├── services/     # AI, STT, OCR, PDF services
│   ├── models/       # Pydantic schemas
│   └── utils/        # Shared helpers
│
├── frontend/         # React + TypeScript + Vite
│   └── src/
│       ├── pages/    # DoctorDashboard, PatientDashboard
│       ├── components/
│       ├── hooks/    # useAudioRecorder, useWebSocket
│       ├── api/      # doctorApi, patientApi
│       └── types/    # TypeScript interfaces
│
└── demo/             # Sample data for hackathon demo
    ├── sample_reports/       # PDF lab reports
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
| Whisper speech-to-text | ✅ |
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

---

## 🔐 Environment Variables

Create `backend/.env`:

```env
OPENROUTER_API_KEY=your_key_here
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
AI_MODEL=openai/gpt-4o-mini

APP_HOST=0.0.0.0
APP_PORT=8000
ENVIRONMENT=development

UPLOAD_DIR=./tmp/medisense_uploads
MAX_FILE_SIZE_MB=20

WHISPER_MODEL=base
# HF_TOKEN=hf_...    # Optional: for pyannote speaker diarization

DATABASE_URL=sqlite+aiosqlite:///./medisense.db
FRONTEND_URL=http://localhost:5173
```

---

## 📋 Demo Scenarios

### Scenario 1 — Doctor Side (Chest Pain)
1. Go to **Doctor Dashboard** → click **Start Recording**
2. Read the `demo/sample_transcripts/chest_pain_consultation.txt` script aloud
3. Click **Stop Recording** → **Generate SOAP Note**
4. Review the AI-generated SOAP note → **Download PDF**

### Scenario 2 — Patient Side (Diabetes Report)
1. Go to **Patient Dashboard**
2. Upload `demo/sample_reports/diabetes_blood_report.pdf`
3. View all 4 tabs: Summary, Specialists, Diet & Exercise, Precautions
4. Click **Download PDF** to get the health guide

---

## ⚠️ Medical Disclaimer

All AI-generated outputs are for **educational and demonstration purposes only**.  
They are NOT a substitute for professional medical advice, diagnosis, or treatment.  
Always consult a qualified healthcare provider before making any health decisions.

---

*MediSense AI — Built for Hackathon | Powered by OpenRouter + GPT-4o-mini*
