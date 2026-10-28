# API reference

Base URL: `/api`. Send `Authorization: Token <token>` on every request except those marked public.
Errors always look like `{"error": {"code": "...", "message": "...", "details": {...}, "retryable": true|false}}`.
Lists are paginated: `{count, page, page_size, total_pages, results}` (`?page=`, `?page_size=` up to 100).

| Method & path | Purpose |
|---|---|
| GET `/health/` (public) | Health check |
| GET `/config/` (public) | Non-secret settings (AI configured?, upload limit) |
| POST `/auth/register/` (public) | email, password, first_name, last_name → token |
| POST `/auth/login/` (public) | email, password → token |
| POST `/auth/logout/` | Invalidates the token |
| GET/PATCH `/auth/me/` | Profile |
| POST `/auth/change-password/` | current_password, new_password → new token |
| POST `/auth/sign-out-everywhere/` | Invalidates the token |
| POST `/auth/password-reset/` (public) | Sends a reset link (same answer for unknown emails) |
| POST `/auth/password-reset/confirm/` (public) | uid, token, new_password |
| POST `/auth/delete-account/` | password → deletes the account and all data |
| GET/POST `/meetings/` | List (`search,status,date_from,date_to,ordering`) / create |
| GET/PATCH/DELETE `/meetings/{id}/` | Detail / update / delete (notes locked after analysis) |
| POST `/meetings/extract-text/` | multipart `file` (.txt .docx .pdf) → extracted text (nothing saved) |
| POST `/meetings/{id}/analyze/` | body `{acknowledge_external_processing: true}`; rate limited |
| GET `/meetings/{id}/analysis/` | Summary, attempts, decisions, tasks, risks, questions |
| PATCH `/meetings/{id}/analysis/` | `{followup_draft}` |
| POST `/meetings/{id}/followup/rebuild/` | Rebuild follow-up from approved items |
| POST `/meetings/{id}/review/` | Bulk `{action: approve\|reject, items:[{type,id}], confirm: true}` (approve requires confirm) |
| GET `/meetings/{id}/report/?file=pdf\|docx` | Meeting report |
| GET `/decisions/` `/risks/` `/questions/` | Filters: `meeting, review_status, search` |
| PATCH `/{decisions\|risks\|questions}/{id}/` | Edit |
| POST `/{decisions\|risks\|questions\|tasks}/{id}/approve\|reject\|reset/` | Review actions |
| GET/POST `/tasks/` | List (`view=operational\|review\|rejected\|all, search, status, priority, owner, meeting, due_from, due_to, no_due_date, overdue, open, ordering`) / create manual task |
| PATCH/DELETE `/tasks/{id}/` | Update (status only for approved tasks) / delete |
| GET `/tasks/export/` | CSV; same filters as the list, or `?ids=1,2,3` |
| GET `/reports/questions/export/` | CSV of approved open questions |
| GET `/dashboard/stats/` | Dashboard numbers |

Differences from the original proposal: `format` was renamed `file` on the report endpoint (DRF reserves `format`);
extra endpoints were added for upload, bulk review, follow-up, password change/confirm and account deletion.
