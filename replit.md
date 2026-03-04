# QA Testing Platform

## Overview
A full-stack AI-powered QA Testing Platform built with React/Vite (frontend) and Express.js (backend). It manages test cases, bug tracking, SDLC pipelines, and AI-driven QA analysis.

## Architecture

### Frontend (Vite + React + TypeScript)
- Runs on port **5000** via `vite`
- 3 main pages: `Index` (dashboard), `QATesting` (test management), `AutomatedQA` (AI analysis)
- Auth is handled via Supabase Auth with a centralized `AuthContext`
- All pages are protected via `ProtectedRoute` — unauthenticated users see the sign-in page
- API calls to AI features go through the Express backend at `/api/*` (proxied by Vite)
- Direct Supabase client calls (for DB reads/writes) use the anon key from environment

### Backend (Express.js + TypeScript)
- Runs on port **3001** via `tsx server/index.ts`
- Proxied from Vite under `/api/*`
- 10 API routes replacing the original Supabase Edge Functions

### Authentication
- Supabase Auth (email/password) — user's existing Supabase project is preserved
- Frontend auth state managed by `src/contexts/AuthContext.tsx`
- Protected routes via `src/components/auth/ProtectedRoute.tsx`
- Server routes that require auth (syncJira, syncGithub, generateTasks) validate the JWT Bearer token from the request header

### Database
- Supabase PostgreSQL (user's existing project: `fqxvnkzajsginyzgpafg`)
- Tables: `projects`, `test_cases`, `test_runs`, `bugs`, `integrations`
- Custom RPCs: `get_project_stats`, `get_phase_stats`

## Environment Variables
| Variable | Where | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | `.env` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `.env` | Supabase anon key |
| `OPENAI_API_KEY` | Replit Secrets | AI features (test case gen, QA analysis, fuzz testing, translation) |
| `SUPABASE_SERVICE_ROLE_KEY` | Replit Secrets | Screenshot upload & test report generation |

## Server Routes (`server/routes/`)
| Route | Method | Purpose |
|---|---|---|
| `/api/health` | GET | Health check |
| `/api/translate-to-hebrew` | POST | Translate QA report text to Hebrew |
| `/api/generate-test-cases` | POST | AI-generated test cases from feature description |
| `/api/generate-tasks` | POST | AI-generated SDLC tasks (requires auth) |
| `/api/analyze-project-qa` | POST | AI QA analysis of files/URL (SSE streaming) |
| `/api/fuzz-testing` | POST | AI-generated fuzz tests from source files |
| `/api/load-testing` | POST | HTTP load testing against a URL |
| `/api/generate-test-report` | POST | Generate STR report for a test run |
| `/api/sync-jira` | POST | Sync bug to Jira (requires auth) |
| `/api/sync-github` | POST | Sync bug to GitHub Issues (requires auth) |
| `/api/capture-screenshot` | POST | Upload bug screenshot to Supabase Storage |

## Running the App
```
npm run dev
```
This starts both the Express server (port 3001) and Vite dev server (port 5000) concurrently.

## Key Design Decisions
- **Kept Supabase** for auth and database — user's existing data and schema are preserved
- **Replaced Supabase Edge Functions** with Express.js routes — avoids Lovable's AI gateway dependency
- **Centralized auth context** — single source of truth for session state across all components
- **Rate limiting** on all `/api` routes (100 req / 15 min window)
- **React Query** configured with `retry: 1` and `staleTime: 30s` to avoid hammering the DB on errors
