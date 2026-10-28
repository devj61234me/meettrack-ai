# MeetTrack AI — Architecture

## Overview
```
Browser (React + Vite)  --HTTPS/JSON, Token auth-->  Django REST API  --SQL-->  MySQL
                                                         |
                                                         +--HTTPS--> External LLM (key stays on the server)
```
- Frontend: React 18, React Router, plain CSS with design tokens, Lucide icons, Recharts (one donut chart).
- Backend: Django 5.1 + Django REST Framework, token authentication (tokens expire after 7 days).
- Database: MySQL 8 (PyMySQL driver). Automated tests use an in-memory SQLite database.

## Folder structure
```
meettrack-ai/
  README.md  RUN_GUIDE.md  .gitignore
  docs/            ARCHITECTURE.md  API.md  DEPLOYMENT.md
  backend/
    core/          settings (base/development/production/test), urls, errors, auth, throttles
    accounts/      register, login, logout, password reset/change, account deletion
    meetings/      Meeting, MeetingAnalysis, Decision, Risk, Question, ActivityLog + API + analysis flow
    tasks/         Task model, filters, API, CSV export
    reports/       dashboard stats, meeting report (PDF/DOCX), CSV helpers
    services/      ai_provider, ai_prompt, ai_schema (validation), file_extraction, followup
    tests/         87 automated tests
  frontend/src/
    pages/ components/ layouts/ services/ hooks/ styles/ utils/ test/
```

## Database relationships
```
User 1──* Meeting 1──* MeetingAnalysis (one row per attempt, raw AI output kept)
                  1──* Decision   (review_status, certainty, evidence)
                  1──* Task       (also owned by User; meeting optional for manual tasks; optional link to Decision)
                  1──* Risk
                  1──* Question
User 1──* ActivityLog (ids and short labels only, never meeting text)
```
Unknown owner and unknown due date are stored as NULL. Database CHECK constraints limit task status, priority and review status values.

## Review workflow
1. Meeting saved (notes stored first). 2. User confirms external AI processing. 3. Backend calls the LLM.
4. Response parsed and validated against the schema (`services/ai_schema.py`). 5. Drafts saved as `draft` or `needs_confirmation`.
6. User edits / approves / rejects. 7. Only `approved` tasks appear in the normal task list, reports and exports.

Validation rules applied to every AI answer: owner must appear in the notes or participants (else NULL); a deadline needs
its wording to appear in the notes and must be a plausible date (else NULL); source excerpts must exist in the notes (else removed
and the item is marked Needs Confirmation); tentative decisions and inferred risks are always Needs Confirmation.

Re-analysis never deletes approved, edited or rejected records; only untouched AI drafts are replaced.

## Screens
Login / Register / Forgot / Reset · Dashboard · Meetings · New/Edit meeting · Review (two-column) · Tasks · Reports · Settings.
