# MeetTrack AI — Run Guide (Windows 11)

Follow the steps in order. At the end there is a checklist to confirm the app works and looks good.
Time needed: about 30 minutes the first time.

---

## Step 1 — Install the software (once)

| Software | Version | Notes |
|---|---|---|
| Python | 3.12 (3.11–3.13 work) | Tick **"Add python.exe to PATH"** in the installer |
| Node.js | 22 LTS (20 LTS works) | Includes npm |
| MySQL Server + MySQL Workbench | 8.0 or 8.4 | Remember the **root** password you choose |
| VS Code | latest | Optional but recommended |

Check in PowerShell:
```powershell
python --version
node --version
npm --version
```

## Step 2 — Create the database (MySQL Workbench)

1. Open MySQL Workbench and connect as **root**.
2. Open a new SQL tab, paste this, change the password, and click the lightning bolt to run it:

```sql
CREATE DATABASE meettrack CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'meettrack_user'@'localhost' IDENTIFIED BY 'ChangeThisPassword123!';
GRANT ALL PRIVILEGES ON meettrack.* TO 'meettrack_user'@'localhost';
-- needed only for running the automated tests on MySQL:
GRANT ALL PRIVILEGES ON `test_meettrack`.* TO 'meettrack_user'@'localhost';
FLUSH PRIVILEGES;
```

## Step 3 — Backend (Django)

Open PowerShell in VS Code (**Terminal → New Terminal**).

```powershell
cd meettrack-ai\backend
python -m venv venv
.\venv\Scripts\Activate.ps1
```
If PowerShell says scripts are disabled, run `Set-ExecutionPolicy -Scope Process Bypass` and activate again.

```powershell
pip install -r requirements.txt
copy .env.example .env
```

Generate a secret key and copy the printed text:
```powershell
python -c "import secrets; print(secrets.token_urlsafe(50))"
```

Open `backend\.env` in VS Code and set:
- `DJANGO_SECRET_KEY=` the key you just generated
- `DB_PASSWORD=` the password from Step 2
- the three AI lines (see Step 4)

Create the tables and start the server:
```powershell
python manage.py migrate
python manage.py runserver
```
Leave this window open. Check http://127.0.0.1:8000/api/health/ — it should show `{"status":"ok"}`.

(Optional) admin login: `python manage.py createsuperuser`, then open http://127.0.0.1:8000/admin/

## Step 4 — Get an AI key

The app works without a key, but **analysis needs one**. Without it you will see a clear "AI is not configured" message — the app never fakes results.

Pick one provider and put its values in `backend\.env`, then restart the backend (Ctrl+C, then `python manage.py runserver`):

**Option A — Google Gemini (has a free tier)**
```
AI_PROVIDER=openai
AI_API_KEY=<key from https://aistudio.google.com/apikey>
AI_MODEL=gemini-2.5-flash
AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
```
**Option B — OpenAI**
```
AI_PROVIDER=openai
AI_API_KEY=<your key>
AI_MODEL=gpt-4o-mini
AI_BASE_URL=https://api.openai.com/v1
```
**Option C — Anthropic Claude**
```
AI_PROVIDER=anthropic
AI_API_KEY=<your key>
AI_MODEL=<a current Claude model name from the Anthropic docs>
```
Model names change over time. If you get "model not found", check the provider's current model list.

## Step 5 — Frontend (React)

Open a **second** terminal:
```powershell
cd meettrack-ai\frontend
npm install
npm run dev
```
Open **http://localhost:5173** in your browser.

---

## Step 6 — Check that it works and looks good

Use this sample text for the first test (paste it into "Meeting notes"):

```
Weekly sync with Acme. Priya will send the revised proposal by 2026-11-05.
Rahul agreed to migrate the database; no date was given.
We decided to launch on the staging server first.
Budget approval from the client is still unclear.
Risk: vendor delay could block the launch.
Sam from Acme might know the contract terms.
```
Participants: `Priya, Rahul, Sam`

### Checklist
Tick each item as you go.

**Accounts**
- [ ] Login page opens with empty fields (no prefilled data). Eye icon shows/hides the password.
- [ ] Create an account. You land on the Dashboard.
- [ ] Dashboard of the new account shows **"Create your first meeting"** and no numbers (no fake data).
- [ ] Sign out (avatar menu, top right), sign in again.
- [ ] "Forgot password": the reset link is printed in the **backend terminal**. Open it and set a new password.

**New meeting**
- [ ] Click **New Meeting**, fill the form, paste the sample text.
- [ ] Try saving with an empty title: a red message appears.
- [ ] (Optional) Upload a small .txt/.docx/.pdf: a preview of the extracted text appears first; click "Use as meeting notes".
- [ ] Click **Save & analyze**, tick the confirmation box, **Start analysis**. A progress bar shows while it runs.

**Review page (the main screen)**
- [ ] Left: meeting details and source notes. Right: summary, decisions, action items, risks, questions, follow-up draft.
- [ ] Every item has a status label (AI Draft / Needs Confirmation). Items the AI was unsure about show a yellow reason.
- [ ] "Send revised proposal" → owner Priya, due 05 Nov 2026. "Migrate the database" → owner Rahul, due **Not specified**.
- [ ] Open "Details & source" on an item, click **Show in source notes**: the sentence is highlighted on the left.
- [ ] Approve one task with the tick button. Reject another with the X. Edit one with the pencil.
- [ ] Select several items and click **Approve selected**: a confirmation dialog appears first.
- [ ] Follow-up draft: click **Rebuild from approved items**, edit the text, **Save draft**, **Copy**.
- [ ] **Export → PDF / Word** downloads a report that contains only approved items.

**Tasks, Meetings, Reports, Dashboard**
- [ ] **Tasks** shows only approved tasks. Tab "Awaiting review" shows the rest. Change a status, use search and filters, click **Export CSV** and open it in Excel.
- [ ] Add a task with no owner and no date: it shows "Unassigned" and "Not specified" and is **never overdue**.
- [ ] Add a task with a date in the past: it turns red with "overdue".
- [ ] **Meetings** page: search, filter by status, open / edit / analyze / export / delete (delete asks for confirmation).
- [ ] **Reports**: download a meeting report; open Approved, Outstanding, Overdue tasks and Unanswered questions tabs.
- [ ] **Dashboard** numbers match what you created.
- [ ] **Settings**: change your name, change your password.

**Look and feel**
- [ ] Dark navy sidebar, indigo buttons, clean white cards, readable text, visible focus ring when you press Tab.
- [ ] Make the browser window narrow (or press F12 and pick a phone size): the sidebar becomes a menu button and tables turn into cards.

**Data safety**
- [ ] Register a second account in a private window: it sees none of the first account's meetings.
- [ ] Open MySQL Workbench → schema `meettrack` → tables `meetings_meeting`, `tasks_task`: your real records are there.

---

## Run the automated tests (optional)
```powershell
cd meettrack-ai\backend
.\venv\Scripts\Activate.ps1
python manage.py test tests            # runs on MySQL (creates and removes test_meettrack)
cd ..\frontend
npm test
```
The AI is mocked in tests, so they cost nothing. Test records live only in a temporary test database.

## Troubleshooting
| Problem | Fix |
|---|---|
| `Access denied for user 'meettrack_user'` | Re-check `DB_USER` / `DB_PASSWORD` in `.env` and Step 2. |
| `Can't connect to MySQL server` | Start the MySQL service (Windows **Services** → MySQL80 → Start). Check `DB_HOST` and `DB_PORT`. |
| `Environment variable DJANGO_SECRET_KEY is required` | You did not create `backend\.env`, or the key line is empty. |
| `ModuleNotFoundError` | Activate the venv (`.\venv\Scripts\Activate.ps1`) and run `pip install -r requirements.txt`. |
| Test run says "permission denied to create database" | Run the extra `GRANT ... test_meettrack` line from Step 2. |
| Browser shows "Cannot reach the server" | The backend is not running. Start it in terminal 1. |
| Port 8000 or 5173 busy | Close the old terminal, or run `python manage.py runserver 8001` and start the frontend with `$env:VITE_PROXY_TARGET="http://127.0.0.1:8001"; npm run dev`. |
| "AI provider is not configured" | Fill the AI lines in `.env` and restart the backend. |
| "AI provider rejected the API key" / "model not found" | Check `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL`. |
| Analysis takes long or times out | Retry. Very long notes are slower. `AI_TIMEOUT_SECONDS` can be raised. |
| Too many requests (429) | Limits protect your AI bill: 10 analyses per hour by default (`AI_ANALYSIS_RATE`). |
| PDF upload says "No readable text" | The PDF is a scan/image. Use a text-based PDF or paste the text. |
| PDF report shows `?` for Hindi/Gujarati text | Known limit of PDF fonts. Use the Word report instead. |

## What still needs you
- Your own AI key and a check that analysis works with your chosen provider.
- Running the MySQL setup and the test commands on your machine (they were run here on SQLite, not MySQL).
- Real email settings if you want password-reset emails outside development.
- Everything in `docs/DEPLOYMENT.md` before going live.
