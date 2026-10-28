# MeetTrack AI — Client Meeting-to-Action Tracker

Turns client meeting notes into reviewed, trackable action items. A person approves everything; the AI only drafts.

**Start here: [RUN_GUIDE.md](RUN_GUIDE.md)** (step-by-step Windows setup and a UI check list).

## Stack and supported versions
| Part | Version |
|---|---|
| Python | 3.11 – 3.13 |
| Django / DRF | 5.1 / 3.15 |
| MySQL | 8.0 or 8.4 LTS (MySQL Workbench compatible) |
| Node.js | 20 LTS or 22 |
| React / Vite / React Router | 18.3 / 5.4 / 6.28 |

## What it does
Create a meeting (paste notes or upload TXT/DOCX/text-PDF) → AI extracts summary, decisions, tasks, owners, deadlines, risks and open questions →
you edit, approve or reject each item (bulk approval asks for confirmation) → approved tasks are tracked → search, filter, export CSV, download a PDF/Word meeting report, edit a client follow-up draft.

## Accuracy and safety rules built in
- Unknown owners and deadlines stay empty ("Unassigned" / "Not specified"). Missing deadlines are never "overdue".
- Owners, deadlines and source excerpts that cannot be found in the notes are removed or flagged "Needs Confirmation".
- Nothing is approved automatically. Re-analysis never overwrites approved or edited items.
- Notes are saved before analysis; AI failures keep the meeting and allow a retry.
- Users only ever see their own data. API key stays on the server. Users confirm before notes go to the AI provider.
- No sample or seed data. A new database is empty.

## Project documents
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/API.md](docs/API.md) · [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

## Tests
```
cd backend
python manage.py test tests --settings=core.settings.test     # fast, in-memory SQLite, AI mocked
python manage.py test tests                                    # same tests on MySQL (needs the test-database grant in RUN_GUIDE)
cd ../frontend
npm test
```
Results when this was handed over (built in a sandbox): backend 87 passed (SQLite), frontend 8 passed, production build OK.
**Not verified in the sandbox:** the MySQL run, a real LLM provider call, real SMTP email, and any live deployment.
Please run the checks in RUN_GUIDE.md on your machine.

## Testing status of the AI step (please read)
- The AI step is fully built. It is covered by automated tests that use a mocked AI, and it was also run end to end in a browser against a fake local AI server.
- On the developer's machine, MySQL, the backend and the frontend ran, and meetings were saved correctly.
- The AI step was **not completed against a live AI provider**. The Google Gemini project used for testing returned "free tier is not available for this project" (HTTP 403), so no real analysis finished there. The app shows this as "The AI provider rejected the API key" and keeps the meeting and notes safe.
- To run it yourself, put a valid key in `backend/.env` (`AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL`; examples are in RUN_GUIDE.md, Step 4). Model names change over time, so check the provider's current list.
- A free local model (for example Ollama through its OpenAI-compatible address) should also work, but it was not tested.

## Known limits
- PDF reports use built-in fonts, so non-Latin text (for example Hindi or Gujarati) shows as "?" in PDF. Word reports handle all languages.
- Scanned (image-only) PDFs are not supported; there is no OCR.
- Analysis runs while the page waits (up to about 90 seconds). A background job queue is not included.
- Login tokens are kept in the browser's local storage (expire after 7 days). For higher security consider httpOnly cookies.
- `npm audit` still lists 2 moderate React Router 6 advisories (open redirect with backslash paths; SSR hydration). The app navigates only to its own fixed paths and does no server-side rendering. Fixing it means upgrading to React Router 7, a breaking change that was not attempted. Re-check `npm audit` before going live.
