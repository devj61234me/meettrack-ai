# Deployment guide

> The project has been **built and tested locally only**. It has not been deployed. Treat everything below as a plan
> to verify in your real hosting environment. Do not call it "production secure" until you have tested it there.

## Suggested architecture
```
Users --HTTPS--> Static host (React build: Netlify / Vercel / Cloudflare Pages / Nginx)
Users --HTTPS--> Django API (gunicorn on Render / Railway / Fly.io / a VPS behind Nginx or the host's proxy)
Django --private network--> Managed MySQL 8 (e.g. AWS RDS, DigitalOcean, Aiven, Railway)
Django --HTTPS--> LLM provider
```
Use your own domain: `app.yourdomain.com` (React) and `api.yourdomain.com` (Django).

## Backend
Working directory: `backend/`
```
pip install -r requirements.txt
set DJANGO_SETTINGS_MODULE=core.settings.production     (Linux: export ...)
python manage.py migrate
python manage.py collectstatic --noinput
gunicorn core.wsgi:application --bind 0.0.0.0:$PORT --workers 3 --timeout 120
```
`--timeout 120` matters: an AI analysis can take up to ~90 seconds.
Never run `manage.py runserver` in production.

### Environment variables to set in the hosting dashboard (never in Git)
`DJANGO_SECRET_KEY`, `ALLOWED_HOSTS` (api.yourdomain.com), `CORS_ALLOWED_ORIGINS` (https://app.yourdomain.com),
`CSRF_TRUSTED_ORIGINS`, `FRONTEND_URL`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`,
`AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL`, `EMAIL_BACKEND` + SMTP settings, `TIME_ZONE`,
optional `ADMIN_URL`, `SECURE_HSTS_SECONDS`.
Production settings refuse to start without `ALLOWED_HOSTS` and `CORS_ALLOWED_ORIGINS`, and reject SQLite.

### Things to know
- HTTPS redirect, secure cookies, HSTS (1 hour at first; raise to a year after you confirm HTTPS works) and clickjacking protection are on in `core/settings/production.py`.
- The hosting proxy must send `X-Forwarded-Proto: https` (most do).
- Rate limits use Django's cache. The default per-process cache is fine for one worker; with several workers or servers configure a shared cache (Redis or the database cache) so limits are enforced globally.
- Health check URL: `/api/health/` (returns 200 and checks the database).
- Logs go to stdout. Meeting text is never logged.
- Uploaded files are processed in memory and never stored.

## Frontend
Working directory: `frontend/`
```
set VITE_API_BASE_URL=https://api.yourdomain.com/api
npm ci
npm run build          # output in frontend/dist
```
Upload `dist/` to the static host. Add a rewrite rule so every path serves `index.html` (single-page app), e.g. Netlify `_redirects`: `/*  /index.html  200`.

## Database backup and restore
```
mysqldump --single-transaction --routines -u meettrack_user -p meettrack > backup-YYYY-MM-DD.sql
mysql -u meettrack_user -p meettrack < backup-YYYY-MM-DD.sql
```
Backups contain private client meetings: store them encrypted, outside Git. Prefer your provider's automated backups plus point-in-time recovery, and test a restore before go-live.

## Deployment checklist
- [ ] New random `DJANGO_SECRET_KEY` (not the local one)
- [ ] Managed MySQL created, dedicated user with rights on one database only
- [ ] `migrate` ran successfully
- [ ] `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS` set to real https URLs
- [ ] AI key set as a secret; spending limit set at the AI provider
- [ ] SMTP configured and a password reset email received
- [ ] Django admin: strong superuser password, custom `ADMIN_URL` (or restrict by IP)
- [ ] HTTPS works on both domains; cookies/redirects verified
- [ ] Register, analyze, approve, export tested on the live site with a test account
- [ ] Backup and restore tested
- [ ] A privacy notice / client agreement covers sending notes to the AI provider
- [ ] `pip audit` / `npm audit` reviewed
