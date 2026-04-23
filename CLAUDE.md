# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MediSense AI is a full-stack AI-powered medical intelligence platform with two distinct workflows:
- **Doctor side**: Audio recording → STT → diarization → medical NER → AI SOAP note generation → PDF export
- **Patient side**: Lab report upload → text extraction → AI analysis → health guide (diet/exercise/precautions) → PDF export

## Development Commands

### Backend (`/backend`)
```bash
# Setup
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt

# Run
uvicorn main:app --reload --host 0.0.0.0 --port 8000
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

- **`routers/`**: Two route groups
  - `doctor.py` — WebSocket `/doctor/stream-audio` for real-time audio streaming + POST endpoints for SOAP generation and PDF export
  - `patient.py` — POST endpoints for file upload, analysis, and PDF export

- **`services/`**: Core business logic
  - `claude_service.py` — All LLM calls via OpenRouter (uses the OpenAI SDK against an OpenRouter base URL)
  - `transcription.py` — STT via `google/gemini-2.5-flash-preview`
  - `diarization.py` — Speaker labeling (Doctor/Patient) using pyannote.audio
  - `ner.py` — Medical NER using scispaCy with regex fallback
  - `report_parser.py` — PDF text extraction via PyMuPDF, with Tesseract OCR fallback for scanned images
  - `pdf_export.py` — PDF generation via ReportLab

- **`models/`**: Pydantic schemas for request/response validation
  - `doctor_models.py` — SOAP note structures, transcript segments, medical entities
  - `patient_models.py` — Patient analysis and upload response shapes

- **`database.py`**: SQLAlchemy async ORM with SQLite
  - `ConsultationSession` — Doctor-side sessions (transcript, entities, SOAP note as JSON columns)
  - `PatientAnalysisRecord` — Patient-side analyses (findings, diet/exercise/precautions as JSON columns)

- **`config.py`**: Pydantic settings loaded from `.env` **plus** all four medical AI prompt templates. When modifying AI behavior, this is the primary place to edit prompts.

- **`utils/helpers.py`**: ID generation, file validation, JSON extraction from LLM responses.

### Frontend (`/frontend/src`)

**React 19 + TypeScript + Vite** — entry point `main.tsx`.

- **`App.tsx`** — Landing page with Doctor/Patient role selection and route setup
- **`pages/`**
  - `DoctorDashboard.tsx` — Audio recorder, live transcript panel, SOAP note editor, PDF export
  - `PatientDashboard.tsx` — Report uploader, 4-tab results interface
- **`components/`** — Split into `doctor/` and `patient/` subdirectories matching each workflow
- **`api/`**
  - `doctorApi.ts` — WebSocket connection + SOAP generation calls
  - `patientApi.ts` — File upload, analysis trigger, PDF export
- **`hooks/`**
  - `useAudioRecorder.ts` — Browser audio capture via Web Audio API
  - `useWebSocket.ts` — Real-time transcript streaming
- **`types/`** — TypeScript interfaces (`doctor.types.ts`, `patient.types.ts`)

**API proxy**: Vite dev server proxies `/api/*` to `http://localhost:8000`, so no CORS issues in development.

**Styling**: Tailwind CSS with glass-morphism design via custom CSS variables.

## Key Technical Notes

- **AI calls** all route through `services/claude_service.py` using the OpenAI SDK pointed at OpenRouter. The model is `openai/gpt-4o-mini` for analysis and `google/gemini-2.5-flash-preview` for transcription, configured via `.env`.
- **All four AI prompts** live in `config.py` — SOAP generation, report analysis, summary/specialists, and lifestyle guide. Each includes a medical safety system message.
- **Upload cache** is in-memory in the patient router (noted in code as needing DB/S3 in production). Session IDs from `/patient/upload` must be passed to `/patient/analyze` before the server restarts.
- **WebSocket** on the doctor side sends audio chunks from the browser; the backend transcribes each chunk and streams labeled transcript segments back.
- **NER** uses scispaCy (`en_core_sci_sm`) when available, with a regex-based fallback so the app works without the optional model download.

## Environment Configuration

Backend requires `/backend/.env`:
```
OPENROUTER_API_KEY=sk-or-...
AI_MODEL=openai/gpt-4o-mini
DATABASE_URL=sqlite+aiosqlite:///./medisense.db
UPLOAD_DIR=uploads/
MAX_FILE_SIZE_MB=10
```

Optional: `HUGGINGFACE_TOKEN` for pyannote.audio diarization.
