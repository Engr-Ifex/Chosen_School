# Chosen School Website — API Specification

**Document status:** Approved
**Version:** 1.0
**Date:** 24 October 2026
**Approved by:** project owner, 24 October 2026
**Stack:** Express + TypeScript, Mongoose, Zod
**Baseline:** `PRD.md`, `DESIGN.md`, `DATA_MODEL.md`

> Contract only. No endpoint exists yet. Where this document and the implementation eventually
> disagree, this document is the specification and the implementation is the defect — until the
> document is deliberately revised.

---

## 1. Conventions

### 1.1 Base path and versioning

```
https://<service>.onrender.com/api/v1/...
```

The client calls `/api/v1/...` **relative**, proxied through the Vercel rewrite
(ARCHITECTURE §5.2). No absolute API host appears in client code.

`v1` is in the path from the first commit. It costs nothing now and avoids a breaking change
later. Breaking changes require `v2`; additive changes do not.

### 1.2 Transport and content type

- HTTPS only. Plain HTTP is redirected by the platform.
- `application/json` for all bodies except file upload (`multipart/form-data`) and PDF
  responses (`application/pdf`).
- Request bodies capped at **100 KB** for JSON, **5 MB** for multipart.

### 1.3 Authentication

A session cookie (`__Host-cs_session`), set by `POST /auth/login`. No bearer tokens, no API
keys, no `Authorization` header.

Every `/admin/*` route requires a valid session. There is one role, so authorization is binary:
authenticated administrator, or public.

**The frontend is never the boundary.** Route guards in React are a convenience. Every admin
route independently resolves the session and rejects unauthenticated requests.

### 1.4 Error envelope

All errors share one shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Some fields need attention.",
    "fields": { "guardian.phone": "Enter a valid phone number." },
    "requestId": "01J..."
  }
}
```

| Code | Status | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 422 | Body/query failed Zod validation. `fields` maps dotted paths to messages |
| `UNAUTHENTICATED` | 401 | No session, or invalid session |
| `SESSION_EXPIRED` | 401 | Session existed but exceeded absolute or idle limit. Client must re-authenticate |
| `FORBIDDEN` | 403 | Origin/CSRF check failed |
| `NOT_FOUND` | 404 | No such record, **or** a record the caller may not see |
| `CONFLICT` | 409 | State transition not allowed (e.g. publishing an already-published item) |
| `RATE_LIMITED` | 429 | Includes `Retry-After` |
| `PAYLOAD_TOO_LARGE` | 413 | Body or file exceeds limit |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | File content not an accepted image type |
| `SERVICE_UNAVAILABLE` | 503 | Database unreachable (e.g. Atlas paused) |
| `INTERNAL_ERROR` | 500 | Unexpected. Message is generic; detail is only in server logs |

**Rules:**
- `NOT_FOUND` is returned instead of `FORBIDDEN` for records the caller has no right to know
  exist. Do not confirm the existence of an application to an unauthenticated caller.
- `INTERNAL_ERROR` never includes a stack trace, a query, a connection string, or a submitted
  value.
- `requestId` is present on every error and in the corresponding log line.

### 1.5 Success envelope

Single resource: the object itself, no wrapper.
Collection: `{ "data": [...], "meta": { ... } }`.
Mutations: the updated object, so the client can re-render without a second request.

### 1.6 Pagination, filtering, sorting

Offset pagination, because the UI shows page numbers and the dataset is small.

| Parameter | Default | Constraints |
|---|---|---|
| `page` | 1 | ≥ 1 |
| `pageSize` | 20 | 1–100 |

`meta`: `{ page, pageSize, total, totalPages }`.

**Sorting** is whitelisted per endpoint. An unknown `sort` value is a `VALIDATION_ERROR`, not a
silent fallback — a silent fallback produces a page that looks sorted and is not.

`sort=-submittedAt` means descending; `sort=student.surname` ascending.

**Filtering** uses explicit query parameters, never a query language. Every filter value is
validated against an allowlist before it reaches Mongoose.

### 1.7 Origin and CSRF

Every mutating request (`POST`, `PATCH`, `DELETE`) requires:

1. `Origin` equal to `APP_ORIGIN`, and `Sec-Fetch-Site` not `cross-site`.
2. For authenticated routes, an `X-CSRF-Token` header matching the session's token, compared in
   constant time.

Read-only admin routes (`GET`) require the session but not the CSRF token.

### 1.8 Rate limits

Keyed on client IP derived from the proxy chain (ARCHITECTURE §5.3), plus the email for login.
Counters live in Atlas, so a Render restart does not reset them.

| Surface | Limit |
|---|---|
| `POST /auth/login` | 5 failures / 15 min per IP and per email |
| `POST /public/applications` | 5 / hour / IP |
| `POST /public/enquiries` | 5 / hour / IP |
| `POST /public/visit-requests` | 5 / hour / IP |
| `POST /public/testimonials` | 3 / hour / IP |
| `GET /admin/*/pdf` | 20 / hour / session |
| Other `/admin/*` | 600 / hour / session |

---

## 2. Public endpoints

No authentication. All are rate-limited and origin-checked where mutating.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness probe |
| `GET` | `/public/site` | School information, contact details, social links |
| `GET` | `/public/placement-options` | Class lists and academic sessions for the form |
| `GET` | `/public/announcements` | Published, non-expired announcements |
| `GET` | `/public/events` | Published, non-expired events, ordered by start date |
| `GET` | `/public/gallery` | Public images and video links, grouped or flat |
| `GET` | `/public/faqs` | Published FAQs, ordered |
| `GET` | `/public/pages/:page` | Fixed school-information sections for About, Academics, Admissions |
| `GET` | `/public/testimonials` | Approved **and** published testimonials |
| `POST` | `/public/applications` | Submit an admission application |
| `POST` | `/public/enquiries` | Submit an enquiry |
| `POST` | `/public/visit-requests` | Submit a visit request |
| `POST` | `/public/testimonials` | Submit a testimonial |

### 2.1 `GET /health`

Returns `200 { "status": "ok" }` when the process is up and a database ping succeeds, `503`
otherwise.

**Must not** return the database name, host, connection state detail, version, uptime, memory,
or any environment value. A health endpoint is public and is exactly where this information
leaks by accident.

### 2.2 `GET /public/site`

Returns only: school name, short name, address, phone, email, WhatsApp number, map link, social
links, logo URL. **Never** the placement lists' internal identifiers, the admin email, or
anything from `settings` not on that list.

### 2.3 `GET /public/placement-options`

```json
{ "primary": ["..."], "secondary": ["..."], "sessions": ["..."], "currentSession": "..." }
```

Served from the approved school configuration (`server/src/config/school.ts`), **not** from the
database. The class lists are fixed school data, so this endpoint returns `200` on a deployment
whose database is empty — it previously returned `503` until a `settings` document had been seeded,
which left the admission form with an empty dropdown.

`currentSession` and `sessions` are still administrator-controlled and read from `settings`
best-effort: if the lookup fails, the configured default is returned and the class lists are
unaffected.

### 2.4 `GET /public/announcements` and `/public/events`

Both apply the same visibility rule: `status = published` **and** (`expiresAt` null or in the
future). `events` additionally orders by `event.startDate` ascending and excludes events whose
end date has passed.

Query: `?page`, `?pageSize`, `?category`.
Response items: `id, title, category, body, isUrgent, publishedAt, expiresAt, event { startDate, endDate }`.

`isUrgent` is presentation only. It does not change ordering or visibility.

### 2.5 `GET /public/gallery`

Returns public images (`isPublic = true`, not deleted) ordered by `order`, plus published video
links. Includes `width`/`height` so the client reserves space and avoids layout shift.
`altText` is always present.

### 2.6 `POST /public/applications`

The most security-sensitive public endpoint.

**Body** (validated by Zod, then re-validated by Mongoose):

```json
{
  "student": { "surname": "", "firstName": "", "middleName": "", "dateOfBirth": "2015-04-02",
               "gender": "male", "religion": "", "ethnicity": "", "stateOfOrigin": "",
               "previousSchool": "", "lastClassAttended": "" },
  "guardian": { "name": "", "homeAddress": "", "phone": "", "email": "", "occupation": "",
                "officeAddress": "" },
  "placement": { "section": "primary", "classApplyingFor": "", "academicSession": "" },
  "signature": { "typedName": "" },
  "healthInformation": "",
  "photo": "<multipart part, optional>"
}
```

Sent as `multipart/form-data` when a photo is attached, `application/json` otherwise.

**Server-side rules:**
- `placement.classApplyingFor` must belong to the selected section's list from `settings`.
  A class from the wrong section is a `VALIDATION_ERROR`.
- `placement.academicSession` must be in the configured list.
- `signature.signedAt` is set by the server. A client-supplied value is ignored.
- `student.gender` must be exactly `male` or `female` (ADR-031). Any other value is a
  `VALIDATION_ERROR`.
- `submittedAt`, `search`, `revisions`, `deletedAt` are never accepted from the client; any
  attempt is stripped, not honoured.
- Photo: magic-byte check, ≤5 MB, JPEG/PNG/WebP only, re-encoded to WebP with metadata
  stripped. SVG is rejected.

**Response** `201`:

```json
{ "id": "...", "submittedAt": "2026-10-24T09:12:33.000Z" }
```

The client shows *"Your admission application has been submitted successfully."* **only** after
receiving `201`. A `2xx` with no persisted document would be a bug; a timeout must be treated as
unknown, not success.

**Duplicate submissions are accepted deliberately** (PRD). No deduplication, no fingerprinting.

**Not returned:** the record itself. The applicant has no account and no way to authenticate, so
returning the stored record would hand personal data to anyone who can guess a response.

### 2.7 `POST /public/enquiries`, `POST /public/visit-requests`, `POST /public/testimonials`

- Enquiry: `name, phone, email?, section, message`. Response `201 { id }`.
- Visit request: `name, phone, email?, section, preferredDate, preferredTime, message?`.
  `preferredTime` must match `HH:mm`. Response `201 { id }`.
  The confirmation text must say the request was **received**, not that a visit is booked.
- Testimonial: `authorName, text, consentGiven`. `consentGiven` must be `true`; `false` is a
  `VALIDATION_ERROR`. Response `201 { id }`. The record is created with `status: 'pending'` and
  is not public.

---

### 2.8 `GET /public/pages/:page`

Returns the fixed sections for one content page. `page` is one of `about`, `academics-primary`,
`academics-secondary`, `admissions`. Any other value is a `404`.

```json
{
  "page": "about",
  "sections": [
    { "key": "history", "body": "<p>…</p>" },
    { "key": "mission", "body": "" }
  ]
}
```

Every key in that page's fixed set is always present, in the defined order. An **empty `body`**
means the school has not supplied that section; the client renders an honest "information not yet
available" state and never invents text.

The key set is fixed in code (ADR-030). The client maps each key to a fixed layout slot and does
not render a dynamic list. No personal data is returned.

## 3. Authentication endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/auth/login` | public | Start a session |
| `POST` | `/auth/logout` | session | End the session |
| `GET` | `/auth/session` | session | Current session state and CSRF token |

### 3.1 `POST /auth/login`

Body: `{ "email": "", "password": "" }`.

Success `200`:

```json
{ "admin": { "email": "..." }, "csrfToken": "...", "expiresAt": "..." }
```

Sets `Set-Cookie: __Host-cs_session=...; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=43200`.

**Failure is always `401 UNAUTHENTICATED` with the same message**, whether the email is unknown,
the password is wrong, or the account is locked. Distinguishing them is an account-enumeration
oracle. The lockout is disclosed only after a correct password, or not at all.

`429` with `Retry-After` after 5 failures in 15 minutes.

Every attempt writes an `auditlogs` entry — success or failure.

### 3.2 `POST /auth/logout`

Deletes the session document and clears the cookie. `204`. Idempotent: logging out with no
session is still `204`.

### 3.3 `GET /auth/session`

`200` with admin email, CSRF token, `expiresAt`, `idleExpiresAt`.
`401 SESSION_EXPIRED` if either limit has passed — this is the signal for the client to show the
sign-in screen.

---

## 4. Admin endpoints

All require a session and, when mutating, a CSRF token. Every response is scoped to the single
administrator; there is no tenant or ownership check beyond "is authenticated".

### 4.1 Dashboard

`GET /admin/dashboard`

```json
{
  "applications": { "total": 0, "thisMonth": 0 },
  "enquiries": { "new": 0 },
  "visitRequests": { "needsFollowUp": 0 },
  "recentAnnouncements": [ ... ],
  "upcomingEvents": [ ... ]
}
```

**Count definitions are open (Q10).** The proposed definitions — `applications.total` excludes
trashed records; `enquiries.new` is `status = 'new'` and not archived; `visitRequests.needsFollowUp`
is `status != 'responded'`, not archived, with `preferredDate` today or later — must be approved
before this endpoint is implemented. They are stated here so they are not invented silently in
code.

### 4.2 Applications

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/admin/applications` | List with search, filters, sort, pagination |
| `GET` | `/admin/applications/:id` | Full record |
| `PATCH` | `/admin/applications/:id` | Edit, with revision capture |
| `GET` | `/admin/applications/:id/photo` | Stream the private photo |
| `GET` | `/admin/applications/:id/pdf` | Single application PDF |
| `GET` | `/admin/applications/pdf?ids=a,b,c` | Bulk PDF, max 50 |
| `DELETE` | `/admin/applications/:id` | Move to Trash |
| `POST` | `/admin/applications/:id/restore` | Restore from Trash |
| `DELETE` | `/admin/applications/:id/permanent` | Permanent delete |

**`GET /admin/applications`**

Query: `q` (name or phone), `section`, `class`, `session`, `sort`, `page`, `pageSize`,
`includeTrashed=false`.

Response items are a **fixed projection** — never the whole document:

```
id, student.surname, student.firstName, student.middleName, student.dateOfBirth,
placement.section, placement.classApplyingFor, placement.academicSession,
guardian.phone, submittedAt, hasPhoto
```

`healthInformation` is **never** in a list projection (PRD FR-018, `DESIGN.md` §6.3). Adding a
field to the list requires editing this projection deliberately.

Search: `q` matches a prefix of `search.studentName` or exactly matches `search.guardianPhone`.
A single `q` value is tested against both; no field prefix syntax.

**`PATCH /admin/applications/:id`**

Partial update of editable fields only. `submittedAt`, `_id`, `revisions`, `search` are
immutable — a request attempting to set them is a `VALIDATION_ERROR`, not a silent ignore, so
the client cannot believe it changed something it did not.

On success, a revision entry is appended: `{ at, by, changedFields, before, after }`, bounded to
50. If nothing actually changed, no revision is written and the response is still `200` — a
no-op edit should not pollute the history.

**`GET /admin/applications/:id/photo`**

Streams the object from the private bucket. `Content-Type: image/webp`,
`Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`,
`Content-Disposition: inline`.

`404` if the application has no photo. Never a redirect to a public URL. Never a presigned URL.

**PDF endpoints**

`Content-Type: application/pdf`, `Content-Disposition: attachment; filename="..."`. Generated
server-side with `pdfkit` **[APPROVED]** — headless Chromium is not viable on a 512 MB Render
instance.

Bulk: `ids` capped at **50**; over the cap is a `VALIDATION_ERROR`, not a partial success. A
request naming an unknown id is a `404` — silently skipping would produce a PDF that looks
complete and is not.

PDF content: student, guardian, placement, submission date, photo if present, and a header
identifying it as an application record. **Health information is included only in the single-
record PDF, never in a bulk export** — a bulk file is more likely to be emailed or printed and
left lying around. Approved 24 October 2026 as ADR-026.

### 4.3 Trash

`GET /admin/trash?type=application&page=...`

Returns trashed applications with just enough to identify them: name, section, class, submission
date, deletion date. **No health information, no photo, no address.**

`DELETE /admin/applications/:id/permanent` requires the body `{ "confirm": "<id>" }`. A mismatch
is a `VALIDATION_ERROR`. This makes accidental deletion by a stray request essentially
impossible, and it is cheap.

Order of operations on permanent delete: delete the photo object → delete the document → write
the audit entry. If the object delete fails, abort with `500` and leave the record intact.

### 4.4 Enquiries and visit requests

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/admin/enquiries` | List, search, filter by status |
| `GET` | `/admin/enquiries/:id` | Full record |
| `PATCH` | `/admin/enquiries/:id` | Update `status` only |
| `POST` | `/admin/enquiries/:id/archive` | Archive |
| `POST` | `/admin/enquiries/:id/unarchive` | Unarchive |

Identical set under `/admin/visit-requests`, plus `preferredDate` and `preferredTime` in the
record and list.

`status` accepts only `new`, `reviewed`, `responded`. **No `confirmed` state exists** — see
DATA_MODEL §6.

Archive is not deletion, and there is no permanent-deletion path for enquiries or visit requests —
settled as Q11. Trash, restore and permanent deletion apply to applications only (§4.3).

### 4.5 Announcements and events

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/admin/announcements` | List with `status`, `kind`, `category` filters |
| `POST` | `/admin/announcements` | Create as draft |
| `GET` | `/admin/announcements/:id` | Full record |
| `PATCH` | `/admin/announcements/:id` | Update |
| `POST` | `/admin/announcements/:id/publish` | Publish |
| `POST` | `/admin/announcements/:id/unpublish` | Return to draft |
| `DELETE` | `/admin/announcements/:id` | Delete |

Creation always produces `status: 'draft'`. A `POST` attempting to set `publishedAt` or
`status: 'published'` is a `VALIDATION_ERROR` — publishing is a separate, auditable action.
This is what makes "no urgent-publication bypass" structural rather than a convention.

`kind: 'event'` requires the `event` object; `kind: 'announcement'` must not carry one.

`body` is sanitised server-side against an allowlist of tags (paragraphs, headings, bold, italic,
lists, links). Anything else is stripped, not escaped — escaped markup shows up as visible
garbage in the admin UI.

### 4.6 Gallery

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/admin/gallery` | All images including unpublished |
| `POST` | `/admin/gallery` | Upload an image (multipart) |
| `PATCH` | `/admin/gallery/:id` | Caption, alt text, category, order |
| `POST` | `/admin/gallery/:id/publish` | Make public |
| `POST` | `/admin/gallery/:id/unpublish` | Remove from public view |
| `POST` | `/admin/gallery/reorder` | Body: ordered array of ids |
| `DELETE` | `/admin/gallery/:id` | Move to Trash |
| `POST` | `/admin/gallery/:id/restore` | Restore |
| `GET` | `/admin/gallery/videos` | List video links |
| `POST` | `/admin/gallery/videos` | Add a YouTube link |
| `PATCH` | `/admin/gallery/videos/:id` | Edit title, order, visibility |
| `DELETE` | `/admin/gallery/videos/:id` | Remove |

**Upload:** `multipart/form-data`, field `image`, ≤5 MB, JPEG/PNG/WebP by magic bytes. Re-encoded
to WebP, metadata stripped. New uploads have `isPublic: false`. The response includes the
intrinsic dimensions.

**Video links:** the request body is a URL. The server parses it, accepts only `youtube.com`,
`www.youtube.com`, `m.youtube.com`, `youtu.be`, extracts the 11-character video id, and stores
**only the id** — not the submitted URL. Storing the raw URL invites a stored-XSS or open-redirect
payload later. The public page embeds `youtube-nocookie.com` behind a click-to-load placeholder,
so no third-party script runs until the visitor asks for it.

### 4.7 FAQs

`GET`, `POST`, `GET /:id`, `PATCH /:id`, `DELETE /:id`, plus `POST /:id/publish` and
`POST /:id/unpublish`. Creation defaults to `isPublished: false`.

### 4.8 Testimonials

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/admin/testimonials` | All, including pending and rejected |
| `PATCH` | `/admin/testimonials/:id` | Edit text, author, private notes |
| `POST` | `/admin/testimonials/:id/approve` | `status → approved` (still not public) |
| `POST` | `/admin/testimonials/:id/reject` | `status → rejected` |
| `POST` | `/admin/testimonials/:id/publish` | Set `publishedAt`. **Requires `approved`** |
| `POST` | `/admin/testimonials/:id/unpublish` | Clear `publishedAt` |
| `DELETE` | `/admin/testimonials/:id` | Delete |

Publishing an unapproved testimonial is `409 CONFLICT`. Approval and publication are two
distinct actions because the PRD requires both, and collapsing them would let a single click put
unreviewed parent text on the public site.

`adminNotes` is never returned by a public endpoint, and is excluded from any export.

### 4.9 Categories

`GET`, `POST`, `PATCH`, `DELETE` under `/admin/categories`, with `?scope=gallery|announcement`.
Deleting a category that is in use returns `409 CONFLICT` with the usage count — see DATA_MODEL
§9.

### 4.10 Settings

`GET /admin/settings` — full document.
`PATCH /admin/settings` — partial update, validated, writes an audit entry.

Placement lists are validated on write: no empty strings, no duplicates, at least one class per
section, and `currentSession` must exist in `academicSessions`. Removing a class that existing
applications reference is allowed — historical records keep the class name they were submitted
with, because the value is stored on the application, not referenced.

---

### 4.11 School information pages

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/admin/pages/:page` | Full document, with section bodies and metadata |
| `PATCH` | `/admin/pages/:page` | Update one or more section bodies |

`PATCH` body:

```json
{ "sections": [ { "key": "history", "body": "<p>…</p>" } ] }
```

**Rules:**
- Only keys in that page's fixed set are accepted. An unknown key is a `422`, not ignored.
- A `PATCH` may update a subset, but the stored document must always retain the complete key set —
  a missing key in the result is a `422`.
- Sections cannot be added, removed, renamed or reordered. There is no endpoint for it, because
  the PRD forbids the administrator from changing page structure (ADR-030).
- `body` is sanitised with the same allowlist as announcement bodies. This is a stored-XSS surface
  identical to `T-09` in the threat model.
- Each successful write records an audit entry.

---

## 5. Authorization matrix

| Surface | Anonymous | Administrator |
|---|---|---|
| `/health` | yes | yes |
| `/public/*` reads | yes | yes |
| `/public/*` writes | yes (rate-limited) | yes |
| `/auth/*` | login only | yes |
| `/admin/*` | **no** | yes |
| `/admin/applications/:id/photo` | **no** | yes |
| `/admin/applications/*/pdf` | **no** | yes |

There is no partial access, no role, and no ownership rule. The single meaningful distinction is
authenticated or not, and it is enforced by middleware applied to the `/admin` router as a whole
— not per handler, where one omission would be invisible.

---

## 6. Security requirements per endpoint

| Requirement | Applies to |
|---|---|
| Zod validation of body **and** query | every endpoint |
| Explicit field projection (no whole-document returns) | every list endpoint |
| Origin + CSRF check | every `POST`/`PATCH`/`DELETE` |
| Rate limiting | every public write, login, PDF export |
| No personal data in logs | every endpoint |
| No personal data in URLs or query strings | every endpoint — hence `POST` for bulk PDF, not `GET` with a filter payload |
| `no-store` on private responses | photo, PDF, application detail |
| Constant-time comparison | CSRF token, session token hash lookup |

**One deliberate exception:** bulk PDF uses `GET` with `ids` in the query string, which puts
record identifiers in the URL and therefore in logs. This is accepted because the ids are opaque
ObjectIds, not personal data, and a `GET` is required for a browser download. The trade-off is
recorded rather than hidden.

---

## 7. Unresolved in this specification

Updated 24 October 2026 on approval. Resolved items are recorded in `DECISIONS.md`.

| # | Item | Status |
|---|---|---|
| Q10 | Dashboard count definitions | **Resolved** — §4.1 of this document |
| Q11 | Archive vs permanent deletion for enquiries/visits | **Resolved** — archive only; Trash is applications-only |
| Q12 | Event time-of-day and time zone | **Partly open** — date-only is the approved interim model; a time is a product change |
| Q13 | Admin editing of school information | **Resolved** — fixed structured fields (ADR-030); endpoints in §2.8 and §4.11 |
| Q14 | Health information in bulk PDF export | **Resolved** — excluded (ADR-026) |
| Q15 | Testimonial `authorName` displayed in full or abbreviated | **Open** — school preference |
| Q16 | Session idle timeout | **Resolved** — 60 minutes sliding (ADR-027) |

Three further items are not API-contract questions and do not block implementation of these
routes: **Q1** (Vercel eligibility), **Q2** (proxy cold start) and **Q3** (keep-alive) are
deployment-time verifications, addressed in `ROADMAP.md` S07 and S14.

Only Q12 and Q15 remain open here. Both affect a single field's presentation, not the shape of an
endpoint, so neither blocks the slices that build them — but neither should be guessed silently
either.
