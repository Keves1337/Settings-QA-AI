# QA Testing Platform

## Overview
A full-stack AI-powered QA Testing Platform built with React/Vite (frontend) and Express.js (backend). It manages test cases, bug tracking, SDLC pipelines, and AI-driven QA analysis.

## Architecture

### Frontend (Vite + React + TypeScript)
- Runs on port **5000** via `vite`
- Main pages: `Index` (dashboard), `QATesting` (test management), `AutomatedQA` (AI analysis)
- Auth context (`AuthContext`) exists but all routes are publicly accessible — no login gate
- API calls go through the Express backend at `/api/*` (proxied by Vite at `0.0.0.0:5000`)
- Direct Supabase client calls for DB reads/writes use the anon key from `.env`

### Backend (Express.js + TypeScript)
- Runs on port **3001** via `tsx server/index.ts`
- Proxied from Vite under `/api/*`
- Manually loads `.env` file at startup (Supabase keys available server-side)
- Rate limiter configured with `trust proxy: 1` and `validate.xForwardedForHeader: false` for Replit

### Authentication
- **No login gate** — all routes are publicly accessible by design (user preference)
- Supabase Auth is still available via `AuthContext` / `useAuth()` hook for optional sign-in
- Server routes do not validate JWT tokens; Supabase service role key used where needed

### Database
- Supabase PostgreSQL (project: `fqxvnkzajsginyzgpafg`)
- Tables: `projects`, `test_cases`, `test_runs`, `bugs`, `integrations`
- Custom RPCs: `get_project_stats`, `get_phase_stats`
- Stats/phases load via `/api/stats` and `/api/phase-stats` backend routes (bypasses frontend RLS)

## Environment Variables
| Variable | Where | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | `.env` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `.env` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Replit Secrets (optional) | Bypass Supabase RLS for stats/data |
| `OPENAI_API_KEY` | Replit Secrets (optional) | Enables real AI responses; without it, smart template responses are returned |

## AI Features Without API Key
All AI routes return high-quality template responses when no `OPENAI_API_KEY` is set:
- **Generate Tasks** — returns phase-specific SDLC task templates
- **Generate Test Cases** — returns 5 structured test cases (happy path, negative, boundary, performance, security)
- **Analyze URL / Files** — returns a comprehensive QA report via SSE streaming (security, performance, accessibility checks)
- **Fuzz Testing** — returns 10 categorized fuzz test scenarios
- **Translation** — returns original text with a notice

## Server Routes (`server/routes/`)
| Route | Method | Purpose |
|---|---|---|
| `/api/health` | GET | Health check |
| `/api/stats` | GET | Project stats (via service role key) |
| `/api/phase-stats` | GET | Pipeline phase stats |
| `/api/translate-to-hebrew` | POST | Translate text to Hebrew |
| `/api/generate-test-cases` | POST | Generate test cases (AI or template) |
| `/api/generate-tasks` | POST | Generate SDLC tasks (AI or template) |
| `/api/analyze-project-qa` | POST | QA analysis via SSE streaming (AI or template) |
| `/api/fuzz-testing` | POST | Fuzz test generation (AI or template) |
| `/api/load-testing` | POST | Real HTTP load testing against a URL |
| `/api/generate-test-report` | POST | Generate STR report; uploads to Supabase Storage if available |
| `/api/sync-jira` | POST | Sync bug to Jira |
| `/api/sync-github` | POST | Sync bug to GitHub Issues |
| `/api/capture-screenshot` | POST | Upload bug screenshot to Supabase Storage |

## Running the App
```
npm run dev
```
Starts both Express (port 3001) and Vite (port 5000) concurrently.
