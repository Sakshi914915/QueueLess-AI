# QueueLess AI: REST API Documentation

Base URL: `http://localhost:5000/api`

---

## 1. Authentication (`/auth`)
- `POST /auth/register`: Register customer or org_admin.
  - Body: `{ email, password, full_name, phone, role, organization_name, organization_category }`
  - Returns: `{ success, token, user }`
- `POST /auth/login`: Authenticate with email & password.
  - Body: `{ email, password }`
  - Returns: `{ success, token, user }`
- `GET /auth/me`: Retrieve current profile & permissions. (Header: `Bearer <token>`)
- `PUT /auth/profile`: Update user name, phone, or password.

---

## 2. Organizations (`/organizations`)
- `GET /organizations`: List approved organizations with filters (`?category=...&search=...`).
- `GET /organizations/recommendations`: Smart recommendations ranked by lowest wait time & distance.
- `GET /organizations/:id`: Retrieve organization details, branches, and active services.
- `PUT /organizations/:id`: Update organization profile (Org Admin or Super Admin).

---

## 3. Branches & Counters (`/branches`, `/counters`)
- `GET /branches?organization_id=...`: Retrieve branches for organization.
- `GET /branches/:id`: Branch details, operating hours, and counters.
- `POST /branches`: Add new branch (Org Admin).
- `GET /counters?branch_id=...`: Retrieve counters, assigned staff, and serving tokens.
- `POST /counters`: Add counter desk.
- `PUT /counters/:id/status`: Toggle counter (`active`, `paused`, `closed`) with emergency reason.

---

## 4. Digital Tokens (`/tokens`)
- `POST /tokens`: Generate live digital queue token with concurrency locks.
  - Body: `{ branch_id, service_id, priority_type, priority_reason, walkin_name, walkin_phone }`
  - Returns: `{ token: { id, token_number, display_code, queue_position, estimated_wait_minutes, qr_code_hash } }`
- `GET /tokens/:id`: Retrieve live token state, people ahead, and rule calculation breakdown.
- `GET /tokens/my-tokens`: Retrieve customer active and past token history.
- `POST /tokens/:id/cancel`: Cancel waiting token.
- `GET /tokens/verify-qr/:hash`: QR scan endpoint for entrance kiosk / counter staff.

---

## 5. Staff Queue Management (`/queue`)
- `GET /queue/:branchId/:serviceId`: Get waiting and serving queue stream.
- `POST /queue/call-next`: Staff calls next eligible token.
  - Body: `{ counter_id, branch_id, service_id }`
- `POST /queue/:tokenId/serving`: Mark customer at desk as serving.
- `POST /queue/:tokenId/complete`: Complete service with optional internal notes.
- `POST /queue/:tokenId/skip`: Mark token as skipped.
- `POST /queue/:tokenId/recall`: Recall skipped token.
- `POST /queue/:tokenId/no-show`: Mark token as no-show.
- `POST /queue/:tokenId/transfer`: Transfer token to another desk/service.

---

## 6. Appointments (`/appointments`)
- `GET /appointments/slots`: Get available appointment slots for a date.
  - Query: `?branch_id=...&service_id=...&date=YYYY-MM-DD`
- `POST /appointments`: Book appointment slot with double-booking prevention.
- `GET /appointments/my-appointments`: List logged-in user's scheduled appointments.
- `POST /appointments/:appointmentId/check-in`: Digital check-in on arrival; generates live queue token.
- `DELETE /appointments/:appointmentId`: Cancel scheduled appointment.

---

## 7. Analytics & Export (`/analytics`)
- `GET /analytics/overview?organization_id=...`: Total tokens, completed, waiting, avg wait time, no-show rate, counter utilization, and 7-day trend.
- `GET /analytics/export-csv?organization_id=...`: Download actual MySQL queue report as CSV.

---

## 8. AI Assistants (`/ai`)
- `POST /ai/queue-assistant`: Customer assistant powered by Google Gemini API with verified user token context in English and Hindi.
- `POST /ai/admin-assistant`: Admin assistant querying live MySQL metrics for operational analysis.

---

## 9. Super Admin (`/super-admin`)
- `GET /super-admin/overview`: Platform health, total users, total organizations, active queues.
- `GET /super-admin/organizations`: List all organizations with approval filters.
- `PUT /super-admin/organizations/:id/status`: Approve, reject, or suspend organization.
- `GET /super-admin/audit-logs`: View system security audit logs.
