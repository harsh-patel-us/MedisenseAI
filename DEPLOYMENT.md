# MediSense AI — Vercel Deployment Guide

Deploy both the **FastAPI backend** and **React frontend** to Vercel as two separate projects, connected via environment variables.

---

## Architecture Overview

```
┌──────────────────────────┐      ┌──────────────────────────┐
│   Frontend (Vercel)      │      │   Backend (Vercel)       │
│   React + Vite           │ ───► │   FastAPI Serverless     │
│   medisense-ai.vercel.app│      │   medisense-api.vercel.app│
│                          │      │                          │
│   Static site + SPA      │      │   Serverless Functions   │
│   fallback routing       │      │   /api/* routes           │
└──────────────────────────┘      └──────────────────────────┘
                                           │
                                           ▼
                                  ┌──────────────────┐
                                  │  Cloud Database   │
                                  │  (Neon / Turso /  │
                                  │   Supabase)       │
                                  └──────────────────┘
```

> [!IMPORTANT]
> Vercel is a **serverless** platform. SQLite (file-based) **will not persist** between
> function invocations. You **must** migrate to a cloud-hosted database before deploying.
> See [Step 0](#step-0-database-migration) below.

---

## Prerequisites

- [Node.js](https://nodejs.org/) 18+ installed locally
- [Vercel CLI](https://vercel.com/docs/cli) installed: `npm i -g vercel`
- A [Vercel account](https://vercel.com/signup) (free tier works)
- A GitHub/GitLab repo with your MediSense AI code pushed
- A cloud database (see Step 0)

---

## Step 0: Database Migration (Required)

Vercel serverless functions are **stateless** — the filesystem is read-only and ephemeral.
SQLite will not work. Choose one of these cloud databases:

### Option A: Neon (Recommended — Free Tier)

1. Sign up at [neon.tech](https://neon.tech)
2. Create a new project → copy the connection string
3. Install the async PostgreSQL driver:
   ```bash
   cd backend
   pip install asyncpg
   pip freeze > requirements.txt
   ```
4. Update your `.env`:
   ```env
   DATABASE_URL=postgresql+asyncpg://user:pass@ep-xxx.us-east-2.aws.neon.tech/medisense?sslmode=require
   ```

### Option B: Turso (SQLite-Compatible, Edge)

1. Sign up at [turso.tech](https://turso.tech)
2. Create a database, get the URL + auth token
3. Install the libsql driver:
   ```bash
   pip install libsql-client
   ```
4. Update `DATABASE_URL` accordingly

### Option C: Supabase (PostgreSQL)

1. Sign up at [supabase.com](https://supabase.com)
2. Create a project → Settings → Database → Connection string
3. Same driver setup as Option A

> [!NOTE]
> After switching databases, test locally:
> ```bash
> cd backend
> python main.py
> ```
> Verify all endpoints work at `http://localhost:8000/docs` before deploying.

---

## Step 1: Deploy the Backend

### 1.1 Project Structure

Create the required Vercel configuration in the `backend/` directory:

```bash
cd backend
```

**Create `backend/vercel.json`:**

```json
{
  "version": 2,
  "builds": [
    {
      "src": "main.py",
      "use": "@vercel/python",
      "config": {
        "maxLambdaSize": "50mb",
        "runtime": "python3.11"
      }
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "main.py"
    }
  ]
}
```

**Create `backend/api/index.py`** (Vercel serverless entry point):

```python
"""
Vercel serverless adapter — exposes the FastAPI `app` object for Vercel's
Python runtime. Vercel automatically looks for an ASGI/WSGI app export.
"""
import sys
import os

# Ensure the backend root is on the path so `from config import ...` works.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app  # noqa: E402 — re-export the FastAPI app
```

### 1.2 Environment Variables

Set these in the Vercel dashboard (Project → Settings → Environment Variables):

| Variable | Value | Notes |
|----------|-------|-------|
| `OPENROUTER_API_KEY` | `sk-or-...` | Your OpenRouter key |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | |
| `AI_MODEL` | `openai/gpt-4o-mini` | Or your preferred model |
| `DATABASE_URL` | `postgresql+asyncpg://...` | Cloud DB connection string |
| `JWT_SECRET` | *(generate a strong random string)* | **Change from dev default!** |
| `FRONTEND_URL` | `https://your-frontend.vercel.app` | For CORS |
| `ENVIRONMENT` | `production` | |
| `SARVAM_API_KEY` | *(your key or leave empty)* | Optional |
| `GOOGLE_MEET_WEBHOOK_SECRET` | *(your secret or leave empty)* | Optional |

> [!CAUTION]
> **Never commit API keys to your repository.** Use Vercel's environment variables dashboard.
> Generate a strong `JWT_SECRET` for production:
> ```bash
> python -c "import secrets; print(secrets.token_urlsafe(64))"
> ```

### 1.3 Update CORS for Production

In `backend/config.py`, ensure the `frontend_url` setting is used. In `backend/main.py`,
the CORS middleware already reads `settings.frontend_url`. Just set the `FRONTEND_URL`
env var in Vercel to your frontend's deployed URL.

### 1.4 Deploy

```bash
cd backend

# Login to Vercel (first time)
vercel login

# Deploy (creates a new project)
vercel

# Follow prompts:
#   - Set up and deploy? → Yes
#   - Which scope? → Your account
#   - Link to existing project? → No (first time)
#   - Project name? → medisense-api
#   - Directory? → (just press Enter to accept the default)
#   - Override settings? → No

# Deploy to production
vercel --prod
```

After deployment, note the URL: `https://medisense-api.vercel.app`

### 1.5 Verify Backend

```bash
curl https://medisense-api.vercel.app/health
# Should return: {"status":"ok","version":"1.0.0",...}

curl https://medisense-api.vercel.app/api/auth/login
# Should return 405 (Method Not Allowed) — means the route exists
```

---

## Step 2: Deploy the Frontend

### 2.1 Configure for Production

**Create `frontend/vercel.json`:**

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

This ensures all SPA routes (`/doctor`, `/patient`, `/login`, etc.) serve `index.html`
instead of returning 404.

**Create `frontend/.env.production`:**

```env
VITE_API_URL=https://medisense-api.vercel.app/api
VITE_WS_URL=wss://medisense-api.vercel.app
```

> [!WARNING]
> **WebSocket limitations on Vercel:** Vercel serverless functions do **not** support
> persistent WebSocket connections. The real-time audio streaming (`/api/doctor/stream-audio`)
> and consultation WebSocket (`/api/consultation/ws/...`) will **not work** on Vercel.
>
> **Workarounds:**
> - Use a separate WebSocket server on [Railway](https://railway.app), [Render](https://render.com),
>   or [Fly.io](https://fly.io) for WebSocket endpoints
> - Or deploy the full backend on Railway/Render instead (see [Alternative](#alternative-deploy-backend-on-railway))

### 2.2 Deploy

```bash
cd frontend

# Login (if not already)
vercel login

# Deploy
vercel

# Follow prompts:
#   - Project name? → medisense-ai
#   - Framework? → Vite (auto-detected)
#   - Build command? → npm run build
#   - Output directory? → dist
#   - Override? → No

# Deploy to production
vercel --prod
```

### 2.3 Set Environment Variables

In the Vercel dashboard for the **frontend** project:

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://medisense-api.vercel.app/api` |
| `VITE_WS_URL` | `wss://medisense-api.vercel.app` |

> [!NOTE]
> After adding env vars in the Vercel dashboard, **redeploy** the frontend:
> ```bash
> cd frontend && vercel --prod
> ```

### 2.4 Update Backend CORS

Go to the **backend** project in Vercel → Settings → Environment Variables.
Update `FRONTEND_URL` to match your frontend URL:

```
FRONTEND_URL=https://medisense-ai.vercel.app
```

Then redeploy the backend:
```bash
cd backend && vercel --prod
```

---

## Step 3: Verify the Full Stack

1. Open `https://medisense-ai.vercel.app` — you should see the landing page
2. Register a new account (Doctor or Patient)
3. Upload a lab report (Patient) or test SOAP generation (Doctor)
4. Check the browser console for any errors

---

## Alternative: Deploy Backend on Railway (Recommended for WebSockets)

Since Vercel doesn't support WebSockets, deploying the backend on **Railway** is a
better option if you need real-time audio streaming or video consultation features.

### Railway Setup

1. Sign up at [railway.app](https://railway.app)
2. Create a new project → "Deploy from GitHub repo"
3. Set the root directory to `backend/`
4. Add environment variables (same as the table in Step 1.2)
5. Add a `Procfile` in `backend/`:

```
web: uvicorn main:app --host 0.0.0.0 --port $PORT
```

6. Add a PostgreSQL database via Railway's plugin (or use Neon)
7. Deploy — Railway gives you a URL like `https://medisense-api.up.railway.app`
8. Update the frontend's `VITE_API_URL` and `VITE_WS_URL` accordingly

> [!TIP]
> Railway supports WebSockets natively, persistent processes, and attached
> PostgreSQL databases — making it ideal for the MediSense backend.

---

## Monorepo Deployment (Single Vercel Project)

If you prefer deploying both from a single repo, you can use Vercel's monorepo support:

### Configure Root `vercel.json`

```json
{
  "buildCommand": "cd frontend && npm install && npm run build",
  "outputDirectory": "frontend/dist",
  "installCommand": "cd frontend && npm install",
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "https://medisense-api.vercel.app/api/$1"
    },
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

This deploys the frontend from the root repo and proxies `/api/*` requests to
your separately-deployed backend.

---

## Production Checklist

Before going live, ensure you've addressed these items:

### Security
- [ ] `JWT_SECRET` is a strong, unique random string (not the dev default)
- [ ] `ENVIRONMENT` is set to `production`
- [ ] All API keys are in Vercel env vars, not in code
- [ ] CORS `FRONTEND_URL` matches your actual frontend domain
- [ ] `GOOGLE_MEET_WEBHOOK_SECRET` is set if using Meet integration

### Database
- [ ] Migrated from SQLite to a cloud database (Neon/Supabase/Turso)
- [ ] Database connection string uses SSL (`?sslmode=require`)
- [ ] Tested all CRUD operations against the cloud database locally

### Frontend
- [ ] `VITE_API_URL` points to the production backend
- [ ] Tested login, register, and all core workflows in production
- [ ] No `localhost` references in production build

### Performance
- [ ] Backend cold-start time is acceptable (< 5s)
- [ ] Large dependencies are minimized (pyannote, scispaCy are heavy)
- [ ] Consider removing optional heavy dependencies for serverless

### Monitoring
- [ ] Vercel analytics enabled for the frontend
- [ ] Backend error logging configured (consider [Sentry](https://sentry.io))

---

## Troubleshooting

### "Function size exceeds limit"
Vercel has a 50 MB limit for serverless functions. If your backend exceeds this:
- Remove heavy optional dependencies (`pyannote.audio`, `en_core_sci_sm`)
- Use lighter alternatives or make them optional imports
- Consider Railway/Render for the backend instead

### "CORS error in browser"
- Verify `FRONTEND_URL` env var matches your frontend domain exactly
- Check that the backend CORS middleware allows the correct origin
- Ensure no trailing slash in the URL

### "Database connection refused"
- Verify `DATABASE_URL` is correct in Vercel env vars
- Ensure the cloud database allows connections from Vercel's IP ranges
- Check SSL mode is set correctly

### "API returns 404"
- Verify the backend is deployed and `/health` endpoint works
- Check that `VITE_API_URL` includes the `/api` prefix
- Ensure Vercel routes are configured correctly

### "WebSocket won't connect"
- Vercel serverless **does not support WebSockets**
- Deploy the backend on Railway, Render, or Fly.io instead
- Or use a separate WebSocket service

---

## Quick Reference

| Item | URL Pattern |
|------|-------------|
| Frontend | `https://medisense-ai.vercel.app` |
| Backend API | `https://medisense-api.vercel.app/api/*` |
| Backend Health | `https://medisense-api.vercel.app/health` |
| Backend Docs | `https://medisense-api.vercel.app/docs` |
| Vercel Dashboard | `https://vercel.com/dashboard` |

---

*Last updated: May 2026*
