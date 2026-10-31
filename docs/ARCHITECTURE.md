# Chosen School Website — Technical Architecture

**Document status:** Approved
**Version:** 1.1
**Date:** 24 October 2026 · **Revised:** 29 October 2026 — file storage changed from Cloudflare R2 to Supabase Storage (ADR-032)
**Approved by:** project owner, 24 October 2026
**Product baseline:** Approved `discovery.md`, `PRD.md`, `DESIGN.md` (approved 22 October 2026)
**Supersedes:** the provisional Oracle Cloud single-VM architecture discussed on 22 October 2026

> This document describes the technology direction chosen by the project owner and the
> approved technical structure for implementing it. It is a planning artifact. No part of this
> system has been built, deployed, or tested. Nothing here should be read as a claim that a
> control is in place.

---

## 1. How to read this document

Statements are tagged so that a decision you made is never confused with a detail I am
proposing:

| Tag | Meaning |
|---|---|
| **[OWNER]** | Decided by you. Recorded in `DECISIONS.md`. |
| **[PROPOSED]** | A recommendation raised after the 24 October 2026 approval. **None outstanding** |
| **[VERIFIED]** | Checked against the provider's official documentation on the date stated. |
| **[UNVERIFIED]** | Could not be confirmed from official sources. Must not be relied on. |
| **[BLOCKER]** | Must be resolved before Stage 2 (real personal data). |
| **[CONDITION]** | Must be resolved before Stage 1 deployment. |

---

## 2. Architecture overview

### 2.1 Shape

Three hosted services and one object store, all on free tiers:

```
Browser
   │  https://<project>.vercel.app
   ▼
┌─────────────────────────────┐
│ Vercel                      │
│  React + Vite + TS (static) │
│  rewrite: /api/* ───────────┼──┐
└─────────────────────────────┘  │
                                 │  https (server-to-server)
                                 ▼
                    ┌────────────────────────────┐
                    │ Render — Free web service  │
                    │  Express + TypeScript      │
                    │  Mongoose                  │
                    └──────────┬─────────────────┘
                               │  TLS, SRV connection string
                               ▼
                    ┌────────────────────────────┐
                    │ MongoDB Atlas — Free (M0)  │
                    │  replica set, 0.5 GB       │
                    └────────────────────────────┘

                    Supabase Storage (selected, not provisioned)
                     ├── admissions-private  (private, streamed via the API)
                     ├── gallery-public      (public read)
                     └── backups             (separate project — D-12)
```

The important line is the `rewrite`. It is what makes authentication workable — see §5.

### 2.2 Architectural goals

1. **Zero cost** at both stages, with every paid dependency identified rather than assumed.
2. **One origin from the browser's point of view**, so cookies behave predictably.
3. **The server is the only security boundary.** No client-side trust anywhere.
4. **No permanent state on Render's disk**, because that disk does not survive.
5. **Recoverable without the provider.** Every durable fact must be reconstructible from a
   backup held somewhere else.
6. **Simple enough for one developer to operate and explain.**

---

## 3. Technology decisions

### 3.1 Accepted by the project owner

| Area | Decision | Notes |
|---|---|---|
| Frontend | React + Vite + TypeScript + Tailwind CSS | **[OWNER]** |
| Frontend hosting | Vercel | **[OWNER]** — subject to plan eligibility, §6.1 |
| Backend | Node.js + Express + TypeScript | **[OWNER]** |
| Backend hosting | Render (free web service) | **[OWNER]** |
| Database | MongoDB Atlas (Free / M0) | **[OWNER]** |
| ODM | Mongoose | **[OWNER]** |
| Repository | `client/`, `server/`, `docs/` | **[OWNER]** |
| Admin session maximum | 12 hours | **[OWNER]** |
| Delivery model | Two stages: demonstration, then production | **[OWNER]** |

### 3.2 Superseded

The PostgreSQL + Prisma direction and the Oracle Cloud Always Free single-VM arrangement
discussed on 22 October 2026 are **withdrawn**. They are retained in Appendix A only as a
recorded alternative, not as a recommendation.

---

## 4. Component responsibilities

### 4.1 `client/` — React SPA

- Renders public pages and the admin dashboard from `DESIGN.md`.
- Holds **no secrets** and enforces **no security decisions**. Every route guard is a
  convenience; the server re-checks every request.
- Talks to the API through a relative `/api/v1/...` path. It never hardcodes the Render host,
  so moving the API later is a configuration change, not a code change.
- Client-side validation exists for fast feedback only. The server validates everything again.

### 4.2 `server/` — Express API

Sole owner of: request validation, authentication, authorization, business rules, file
handling, PDF generation, rate limiting, and audit recording.

Layering, kept deliberately shallow:

```
routes/        HTTP surface, Zod schema binding
controllers/   request → service → response mapping
services/      business rules (admissions, content, trash, export)
models/        Mongoose schemas and indexes
middleware/    auth, authorization, rate limit, CSRF/origin, error handler
lib/           storage (Supabase), crypto, pdf, logging
```

No repository abstraction over Mongoose. It is one database and one ODM; an extra layer
would be ceremony.

### 4.3 MongoDB Atlas

System of record for all structured data. Also stores the session table, so that session
revocation is a database write rather than a token expiry wait.

### 4.4 Supabase Storage — **[APPROVED]** selected, not yet configured

Selected object storage, used **strictly for files**. MongoDB Atlas remains the application
database; Supabase Database is not used and must not be introduced.

| Bucket | Access | Purpose |
|---|---|---|
| `admissions-private` | Private — no public URL | Admission photographs and other approved private admission files |
| `gallery-public` | Public read | School gallery photographs shown on the public website |
| `backups` | Private, **separate project** | Encrypted database and file archives (D-12) |

**Status: selected, nothing provisioned.** No project, bucket or key exists. I-05 and I-06 are
"Awaiting my action" in `INTEGRATIONS.md`.

**How private files are served.** The backend reads the object with its service-role key and
streams it to the authenticated administrator. The browser never receives a Supabase credential,
and never receives a durable link to an admission photograph. Signed URLs exist and are documented
in §8.2, but are **not** used for admission photographs — see the reasoning there, because this
replaces a control that was already approved.

**The service-role key cannot be scoped to a bucket.** It bypasses row-level security entirely, so
one key opens every bucket in the project. That is why the backup bucket is proposed to live in a
second project rather than as a third bucket here (D-12).

---

## 5. The cross-origin problem, and why a rewrite is proposed

This is the single most important technical constraint in this stack, and it is the thing
most likely to break in a way that only appears after deployment.

### 5.1 The problem

`<project>.vercel.app` and `<service>.onrender.com` are **different sites** in the browser's
sense. A cookie set by the API is therefore a third-party cookie when the page is the Vercel
app.

That has three consequences:

1. `SameSite=Lax` and `SameSite=Strict` cookies are **not sent** on cross-site `fetch`.
   Admin authentication fails outright.
2. The only cookie that works is `SameSite=None; Secure`, which is a third-party cookie.
   Safari's ITP blocks third-party cookies by default, and Chrome blocks them in Incognito.
   Admin login would work in one browser and fail in another — the worst kind of bug.
3. CORS must be configured with `credentials: true` and an exact `Access-Control-Allow-Origin`.
   A wildcard is not permitted with credentials, and getting this subtly wrong produces
   confusing failures.

None of this can be resolved by configuration cleverness. It is a property of the domain
layout.

### 5.2 Proposed solution: proxy the API through the frontend origin — **[APPROVED]**

Configure Vercel to rewrite `/api/*` to the Render service. The browser then only ever
talks to the Vercel origin:

- The API appears same-origin. **CORS becomes unnecessary and should not be enabled at all.**
- The session cookie is **first-party**, so `HttpOnly; Secure; SameSite=Lax` works everywhere,
  including Safari.
- The `__Host-` cookie prefix becomes usable, which pins `Secure`, `Path=/`, and forbids a
  `Domain` attribute.

Illustrative configuration — **not created yet**:

```jsonc
// client/vercel.json — illustrative only
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://<service>.onrender.com/api/:path*" }
  ]
}
```

### 5.3 Consequences that must be tested, not assumed

- **Cold-start timeout.** Render free spins down after 15 minutes idle and takes about a
  minute to wake. Whether Vercel's rewrite proxy will hold a request that long is
  **[UNVERIFIED]**. A 504 at the proxy would make the wake-up invisible to the user but
  still fatal to the request. This must be measured on the real deployed domains.
- **Client IP.** Behind the proxy, Express sees Vercel's address, not the visitor's. Rate
  limiting keyed on `req.ip` would throttle the whole internet as one client. The proxy chain
  headers (`X-Forwarded-For`) must be read deliberately and `trust proxy` configured to match
  the actual hop count. Getting this wrong silently disables brute-force protection.
- **Set-Cookie forwarding** through the rewrite must be confirmed empirically.
- **Body size limits** at the proxy must accommodate the 5 MB upload cap. Uploads go **through**
  the API so that Multer and the content checks always run; sending files straight to Supabase with
  a signed upload URL would bypass validation, and is therefore not an option.

### 5.4 If the rewrite does not hold — **stop and escalate**

If T1 fails, **work stops and options are presented to the project owner for approval.** No
fallback is applied automatically, and no security attribute is relaxed to make the cookie work.

The options that exist, none of them pre-approved:

1. `SameSite=None; Secure` plus a strict credentialed CORS allowlist, with an explicit, documented
   statement that **admin login is unsupported in Safari and in private browsing**. This is a real
   functional regression and a security regression — it re-introduces exactly the third-party
   cookie exposure the rewrite design was chosen to avoid.
2. A custom domain (`school.example` + `api.school.example`), which makes both hosts the same site
   and resolves the problem properly. It costs money, so it requires an owner decision.
3. A different hosting arrangement for one of the two services.

**Explicitly forbidden as a response to a failed T1:** removing `Secure`, dropping `HttpOnly`,
disabling the origin/CSRF checks, widening a CORS allowlist to a wildcard, or moving the session
token into `localStorage`. Each would "fix" the symptom by removing the control.

---

## 6. Provider constraints — verified

All figures checked on **24 October 2026** unless stated. Sources are official documentation.

### 6.1 Vercel — **[CONDITION]**

| Item | Finding |
|---|---|
| Hobby eligibility | *"Hobby teams are restricted to non-commercial personal use only. All commercial usage of the platform requires either a Pro or Enterprise plan."* |
| Definition of commercial | *"any Deployment that is used for the purpose of financial gain of anyone involved in any part of the production of the project, including a paid employee or consultant writing the code."* |
| Listed examples | requesting or processing payment; **advertising the sale of a product or service**; **receiving payment to create, update, or host the site**; affiliate linking; advertisements |
| Vercel's own guidance | *"If you are unsure whether or not your site would be defined as commercial usage, please contact the Vercel Support team."* |

**Assessment.** A school website that advertises admissions is plausibly *"advertising the
sale of a product or service"*. If you are paid by the school to build it, the second clause
applies directly and unambiguously. The Stage 1 demonstration does **not** settle this: it may
weaken the "processing" dimension, but the site still advertises the school, and *"personal
use"* remains a poor fit for an institutional site.

**Low traffic is not an eligibility argument.** Vercel's restriction is about purpose, not
volume. Do not treat low traffic as evidence of compliance.

**Required action:** ask Vercel Support in writing, describing the site accurately — a school
website, advertising admissions, built by a developer, no payments processed, no advertising.
Record the written answer here. Until then this is a **deployment condition**, and for Stage 2
a **blocker**.

**If Hobby is not eligible:** Vercel Pro (paid, requires your approval), or move static hosting
to Cloudflare Pages (free, no equivalent commercial-use restriction **[UNVERIFIED]**), or
Render Static Sites (free, keeps one vendor). Do not switch silently.

### 6.2 Render — free web service

| Item | Finding |
|---|---|
| Intended use | Docs state: *"Do not use them for production applications."* |
| Spin-down | After **15 minutes** without inbound traffic |
| Spin-up | *"takes about one minute"*; a loading page is shown |
| Filesystem | **Ephemeral.** Changes lost on redeploy, restart, or spin-down. No persistent disks on free |
| Availability | *"Render might restart a Free web service at any time"* |
| Instance hours | **750/month** per workspace; exhausted hours suspend all free services until next month |
| Build pipeline | Monthly minute allowance; exceeding it disables new builds |
| Bandwidth | Monthly allowance; exceeding it without a payment method suspends free services |
| Other | No shell/SSH, no one-off jobs, cannot receive private network traffic, outbound SMTP ports blocked |

**Consequences.** No permanent uploads on disk (§8). No reliance on in-process memory for
rate-limit counters or sessions — both must live in Atlas, because the process can be
replaced at any moment. Cold starts are a user-visible cost.

**Keep-alive consideration — [PROPOSED, UNVERIFIED].** 24/7 uptime is ~730 hours against a
750-hour allowance, leaving almost no headroom for restarts. A pinger restricted to active
hours (e.g. 06:00–22:00, ~480 hours) would keep cold starts out of the school day. Whether
deliberate keep-alive traffic is acceptable under Render's terms is **unverified**; it should
not be relied on until checked.

### 6.3 MongoDB Atlas — Free (M0)

| Item | Finding |
|---|---|
| Storage | **0.5 GB** total (documents + indexes), not configurable |
| Connections | **500** maximum |
| Throughput | **100** read/write operations per second |
| Data transfer | 10 GB in / 10 GB out per rolling 7 days |
| Topology | 3-node replica set, fixed. MongoDB 8.0; version upgrades are automatic |
| In-memory sort | **32 MB** limit — sorting large result sets without an index will fail |
| Collections | 500 per cluster |
| Stated purpose | *"For learning and exploring MongoDB"*; **not** intended for production |

**Inactivity pausing — confirmed.** *"Atlas automatically pauses all inactive Free clusters
after 30 days."* Atlas emails **seven days before** pausing, and again afterwards. A paused
cluster **retains its data**; it is not deleted. Connections are refused until it is resumed,
which requires a manual action in the Atlas UI (or CLI/API) — the application cannot wake it
by connecting. Atlas also stops collecting monitoring data after a few days of inactivity, so
a paused cluster will look silent in monitoring.

You cannot pause a Free cluster manually; only Atlas does it.

**Backups — this is where two official pages disagree.** The pricing page FAQ states that
backup services are not available on the free tier; the Free Cluster Backups page describes an
optional paid subscription. The specific page resolves it:

- Backups for Free clusters are **an optional paid add-on**: **$0.10/day, capped at $3.00/month
  per cluster**, and **a payment method on file is required**.
- Daily snapshot, **last 4 retained**, no on-demand snapshots, no custom policies.
- Currently in **private preview** and *"might change at any time"*; rollout is gradual, so
  the option may not even appear.

**Conclusion:** this is neither free nor dependable, and it is not a backup strategy. The
primary backup must be a self-managed export (§9). Enabling the Atlas add-on would introduce a
**paid dependency requiring your explicit approval** — it is not assumed anywhere in this plan.

### 6.4 Supabase Storage — **[VERIFIED 29 Oct 2026]**

| Item | Free-plan figure |
|---|---|
| Storage | **1 GB** total across all buckets |
| Egress | **5 GB + 5 GB cached egress** per month |
| Max file size | **50 MB** per upload |
| Active projects | **2** |
| Inactivity | **Project paused after 1 week with no activity** |
| Backups | **None.** Automatic backups start on the paid plan |

Three of these are worse than the provider this replaces, and each has a consequence:

1. **1 GB is shared by every bucket.** Admission photos at ~200 KB re-encoded, a gallery of ~100
   images, and any backup archives all draw on the same gigabyte. Fine for the demonstration;
   a capacity to watch, not a limit to ignore.
2. **The project pauses after seven days idle.** This is the most consequential change. A school
   site can plausibly go a week without a visitor during holidays, and when the project pauses,
   **public gallery images stop loading and uploads fail** — including for a parent mid-form.
   Atlas pauses at 30 days and R2 did not pause at all. Recovery is manual, from the dashboard.
   This is recorded as a Stage 1 operational risk in §13.
3. **No backups on the free plan.** Supabase Storage is therefore not a backup of itself, and §9
   still requires a self-managed export.

The 50 MB per-file limit is comfortably above the 5 MB cap the application enforces, so it does
not constrain us.

---

## 7. Authentication and session design

### 7.1 Password storage

**[APPROVED]** Argon2id via `argon2` (native bindings) at OWASP-baseline parameters, with the
cost parameters recorded alongside the hash so they can be raised later without invalidating
existing credentials.

One administrator account, created by a documented provisioning step. **No registration route
exists at all** — not disabled, absent.

### 7.2 Sessions

**[OWNER]** Maximum session duration: **12 hours**.
**[APPROVED]** Idle timeout: **60 minutes**, sliding.

Server-side sessions in an Atlas collection, not JWTs:

- The cookie carries a 32-byte random token. The database stores only its SHA-256 hash, so a
  database read cannot yield a usable session token.
- Every request resolves the session and checks `expiresAt` and `lastSeenAt`.
- A TTL index on `expiresAt` cleans up expired rows; the TTL monitor runs about once a minute,
  so the application must still check expiry explicitly rather than trusting the index.
- Logout deletes the row. "Sign out everywhere" deletes all rows for the admin. A password
  change deletes all rows.

**Why not a JWT in `localStorage`:** it cannot be revoked before expiry, it is readable by any
XSS, and with a single administrator the entire benefit of stateless tokens — horizontal
scaling — is irrelevant here.

### 7.3 Cookie attributes — **[APPROVED]**

If §5.2 holds: `__Host-cs_session; HttpOnly; Secure; SameSite=Lax; Path=/`.

The `__Host-` prefix is deliberate: the browser rejects the cookie unless `Secure` is set,
`Path=/`, and no `Domain` attribute is present. It makes a future misconfiguration fail loudly
instead of quietly weakening the cookie.

### 7.4 CSRF — **[APPROVED]**

Two independent layers, because `SameSite=Lax` alone is a browser-behaviour assumption:

1. Reject state-changing requests whose `Origin` does not match the expected origin, and whose
   `Sec-Fetch-Site` is `cross-site`.
2. A per-session CSRF token, issued at login, required in a header on every mutating admin
   request and compared in constant time.

Public form endpoints are also origin-checked, though they are not authenticated.

### 7.5 Rate limiting — **[APPROVED]**

Counters in Atlas, not process memory, because Render may restart the process at any time and
silently reset in-memory limits.

| Surface | Proposed limit |
|---|---|
| Login | 5 failures per 15 minutes per IP **and** per email, then exponential backoff |
| Admission submission | 5 per hour per IP |
| Enquiry / visit request | 5 per hour per IP |
| Testimonial submission | 3 per hour per IP |
| Authenticated admin requests | Generous ceiling, mostly to catch runaway clients |

IP-based limits depend on correct `X-Forwarded-For` handling (§5.3). This is a correctness
requirement, not a tuning detail.

### 7.6 Brute-force and account protection

Generic authentication errors that never reveal whether the account exists. Failed-attempt
counters recorded per email. A temporary lockout after repeated failures, with the lockout
itself logged. Login success, login failure, logout, password change, and permanent deletion
are written to an audit collection.

### 7.7 Password recovery

Developer-assisted, per `discovery.md`. A CLI script run against the database, not an HTTP
endpoint. No email service is introduced.

---

## 8. File storage

### 8.1 Rules

1. **Nothing permanent is written to Render's disk.** It is erased on restart.
2. **Private and public are different buckets**, not different prefixes in one bucket. A
   prefix is a convention; a bucket is an access boundary.
3. **No code path copies a private object into the public bucket.** Promotion of an admission
   photo to the gallery is not a feature; a gallery image is a separate upload.
4. **Uploads are validated by content, not by filename or declared MIME type.**
5. **Supabase holds files only.** No Supabase Database, no Supabase Auth, no row-level-security
   policies deciding who may read what. Authorization is decided by Express, as everywhere else.
   RLS is deliberately left out of the design so there is exactly one place where access is
   decided.

### 8.2 Upload workflow

1. The browser posts `multipart/form-data` to the API.
2. **Multer** (memory storage, 5 MB cap) receives it. Nothing touches disk.
3. The server validates: `file-type` magic-byte check (JPEG, PNG, WebP only; SVG rejected as a
   script-bearing format; animated images rejected), then `sharp` re-encodes to WebP bounded to
   1600 px, which also strips EXIF and GPS as a consequence.
4. The server uploads to the appropriate bucket with `@supabase/supabase-js`, using the
   service-role key. The bucket is chosen from the file's purpose, never from client input.
5. MongoDB stores the object key and metadata. The key is a generated UUID; the original filename
   is discarded.
6. Private files are served only after the API authorises the request.

Failure and orphan handling is specified in `INTEGRATIONS.md` §5.5. In short: upload first, then
write the record; if the record write fails, delete the object. The recoverable failure is the one
that happens.

### 8.3 Private admission files

Bucket `admissions-private`. No public URL exists for it.

Access: `GET /api/v1/admin/applications/:id/photo`, authenticated. The backend reads the object
with the service-role key and streams the bytes to the response. Headers:
`Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`,
`Content-Disposition: inline`.

**Signed URLs — available, and deliberately not used here.** A Supabase private object is reachable
either by a signed URL or by an authenticated GET. A signed URL is a bearer credential:

- it works for anyone who holds it until it expires;
- **it cannot be revoked individually** — Supabase's own documentation says the only ways to
  invalidate one are to delete, move or rename the object, or to ask Supabase to rotate an internal
  signing key for the whole project;
- it lands in browser history, proxy logs and `Referer` headers.

Streaming through the authorised endpoint keeps the access decision on every request, and
preserves a control that was already approved. If a signed URL is ever wanted — for example a
time-limited download link — that is a new decision, with an explicit expiry and a written
acceptance of the revocation limitation.

### 8.4 Public gallery images — and a control that has to change

Bucket `gallery-public` is publicly readable. Its objects are served at:

```
https://<project-ref>.supabase.co/storage/v1/object/public/gallery-public/<key>
```

**The consequence, stated plainly:** in a public bucket, *every* object is publicly fetchable the
moment it is uploaded. There is no per-object switch. The approved design said "an uploaded image
is not public until an administrator publishes it" — **that control cannot be implemented by a
database flag alone when the bucket is public.** Setting `isPublic: false` hides the image from the
site's listings, but anyone with the URL can still fetch it.

Two ways to resolve this, and it needs your decision (**D-13**):

| Option | How it works | Trade-off |
|---|---|---|
| **A — stage then publish** *(recommended)* | Upload new gallery images to the **private** bucket under a `staging/` prefix. On publish, copy the object into `gallery-public` and record the published key. On unpublish, delete the public copy | Preserves the approved control exactly. Costs one copy operation and two keys per image |
| **B — upload is publication** | Upload straight to `gallery-public`; unpublishing deletes the object | Simpler, but an uploaded-but-unpublished image is still reachable by anyone who has the URL. Weakens an approved control |

Either way, the object key stays a generated UUID, so URLs are not guessable. But "not guessable"
is not the same as "not published", and the difference matters when the image is a photograph of a
child.

### 8.5 Alternatives considered

| Option | Assessment |
|---|---|
| **Supabase Storage** | **Selected** (ADR-032). 1 GB, 5 GB egress, project pauses after 7 days idle, no backups on free |
| Cloudflare R2 | The previous selection, superseded. 10 GB free, zero egress, no inactivity pause, bucket-scoped tokens |
| Backblaze B2 | 10 GB free, but egress is metered and free egress is limited |
| Render disk | Not available on free tier. Excluded |
| Atlas GridFS | Would consume the 0.5 GB database budget. Excluded |

The R2 row is retained deliberately: it is the only way to see what was given up, and a future
review should be able to compare rather than re-derive.

---

## 9. Backup and recovery

### 9.1 What the providers give you

- **Atlas Free:** no usable backup. The paid add-on is a preview, costs up to $3/month, needs a
  card, and retains only four daily snapshots (§6.3).
- **Render:** nothing. The instance is disposable by design.
- **Supabase Storage:** **no backups on the free plan** — automatic backups begin on the paid plan.
  It is a destination, not a backup, and it cannot be a backup of itself.

**Therefore the backup strategy is entirely self-managed. This is a real operational
obligation, not a formality.**

### 9.2 Design — **[APPROVED, pending D-12]**

**Database.** Nightly `mongodump --gzip --archive` against Atlas, run from a machine you
control (not from Render, whose disk is ephemeral and whose egress is metered). Atlas Free does
not support `--oplog`, `--oplogReplay`, or `--preserveUUID`; the dump must not use them.

**Files.** Nightly download of both buckets to a local copy, then a single archive. Both
`admissions-private` and `gallery-public` are included — a gallery image is still school data,
and a private photograph is the thing that must never be lost.

**Encryption.** `age` with a key held **offline** — in a password manager and on paper — never on
Render, never in the repository, and never in the same project that holds the ciphertext. Encrypt
before upload, so the backup project only ever stores ciphertext.

**Destination.** A `backups` bucket in a **second Supabase project** — proposed, **D-12**. The
reasoning is in §9.3; it is the one place where the new provider cannot reproduce the old
provider's guarantees.

**Frequency.** Daily, plus a manual run before any schema migration and during peak admission
weeks. Daily is the floor, not the target.

**Retention — accepted 24 October 2026:** 30 daily, 12 monthly. Retention still interacts with
the data-retention policy, which is open in the PRD: a backup is a copy of personal data and is
subject to the same rules as the live record.

**Access.** One person. Key held offline. No automated process holds the decryption key.

### 9.3 Where Supabase cannot reproduce the old guarantee — **D-12**

Under the previous provider, the application held a token **scoped to two buckets**, and the
backup job held a **separate** token scoped to the backup bucket. A compromised API therefore
could not touch the backups.

**Supabase cannot do that.** A `service_role` key is project-wide and bypasses row-level security
entirely; it cannot be scoped to a bucket, a prefix, or an operation. If backups lived in the
application's project, the application's own key could delete every backup of the data it had just
corrupted — the exact failure the previous design prevented.

Two options:

| Option | Effect |
|---|---|
| **A — separate backup project** *(recommended)* | The free plan allows two active projects. A second project has its own URL and its own key, which the application never holds. Restores the separation. Costs a second 1 GB quota and a second 7-day pause clock |
| **B — same project, third bucket** | Simpler, but the application key can reach `backups`. Accepts a risk that was previously engineered away |

**Until D-12 is decided, the backup design is not complete.** This is not a detail that can be
settled during implementation.

### 9.4 Restoration

Documented procedure: provision a replacement Atlas cluster, `mongorestore --gzip --archive`,
re-upload the two buckets to the storage project, redeploy the API with the new connection string,
verify record counts and a sample of photo checksums.

**A backup is not verified until a restore has been performed and the result checked.** The
drill restores into a scratch cluster, verifies counts and checksums, then destroys the scratch
cluster. Before launch, and quarterly afterwards.

### 9.5 Honest limits

- Up to 24 hours of records can be lost between nightly runs. This is the accepted trade-off
  from `discovery.md`, and it should be stated to the school in plain language before Stage 2.
- If Atlas pauses after 30 days of inactivity, the API will fail to connect. It does **not**
  lose data, but nothing recovers automatically — a human must resume the cluster.
- **If the Supabase project pauses after 7 days idle, file uploads and gallery images stop
  working.** Nothing recovers automatically; a human must resume the project from the dashboard.
  This is the shortest fuse in the system.
- **1 GB is shared** by admission photos, gallery images and any local staging. Backup archives
  stored in the same project would compete with the live data for that gigabyte — a further reason
  for D-12.
- If Render restarts or spins down mid-request, that request is lost. Writes must be atomic at
  the document level so a partial write cannot occur.

---

## 10. Environment and secrets

### 10.1 Variables

The authoritative register — every name, purpose, secret classification, validation rule and
rotation procedure — is **`ENVIRONMENT_VARIABLES.md`**. This section records only the shape:

| Context | Consumed by | Contains |
|---|---|---|
| Server | Render environment | Database URI, Supabase URL and service-role key, bucket names, origin and proxy settings |
| Client | Vercel build | `VITE_API_BASE_URL` only — public, bundled into the browser |
| Backup job | Developer machine, `.env.backup` | Database read credentials, the **backup project's** URL and key, and the `age` key path |

No credential, connection string, or provider URL appears in source. `.env` is git-ignored;
`.env.example` documents the keys with placeholder values only.

**The service-role key cannot be scoped.** Unlike the token it replaces, a Supabase `service_role`
key grants unrestricted access to every bucket in its project. Separation is therefore achieved by
**project boundary**, not by token scope — which is precisely what D-12 is about.

### 10.2 Handling

Render environment variables are set in the dashboard, are visible to anyone with project
access, and are injected at runtime. Rotating a secret means redeploying. Anyone with access to
the Render dashboard can read the service-role key, so dashboard access is equivalent to holding
every file the school has uploaded.

### 10.3 Logging

Structured JSON. Never log request bodies, passwords, session tokens, health information, or
photograph contents. Log request id, method, path (with identifiers redacted where they are
personal), status, duration. Errors are logged with stack traces server-side and returned to
the client as a generic message plus a request id.

---

## 11. Deployment workflow — **[APPROVED]**

1. Push to the default branch.
2. **Vercel** builds `client/` (`vite build`) and publishes the static output.
3. **Render** builds `server/` (`npm ci`, `tsc`), then starts the service.
4. Environment variables are configured in both dashboards, not in the repository.
5. Atlas network access must allow Render's egress addresses. Render free services do not have
   static outbound IPs, so the Atlas allowlist must be broad — which is a security compromise
   that must be documented rather than glossed over. Mitigation: a strong database user
   password, SCRAM authentication, and TLS required. This is a **known weakness of the free
   combination** and belongs in the Stage 2 review.
6. Migrations: Mongo has no schema migrations. Index changes are applied by a documented
   script that runs `syncIndexes()` on each model, executed deliberately, never automatically
   on boot.

---

## 12. Stage 1 and Stage 2

### 12.1 Stage 1 — demonstration and familiarisation

Purpose: an online presence, and experience of the dashboard. **Not** a replacement for the
paper admission process.

Required before Stage 1:

- Vercel eligibility question sent to support (answer may still be pending — record the risk).
- Admission submission either disabled, or clearly marked as a demonstration and storing
  sample data only.
- No real child or parent information entered, including in testing.
- Sample or school-approved photographs only.
- Backups running and **one restore drill completed**.
- The deployed-domain authentication test (§13, T1) passed on the real Vercel and Render hosts.
- A written statement to the school of what Stage 1 does and does not do.

### 12.2 Stage 2 — official production use

Required before real applications are accepted:

1. **Vercel plan eligibility confirmed in writing**, or hosting moved.
2. **Atlas tier decision.** Free is documented by MongoDB as not for production and carries no
   SLA. Either accept that in writing with the school, or move to a paid tier. This is the
   most likely reason the "fully free" constraint fails.
2a. **Supabase Storage tier decision.** The free plan has **no backups**, **1 GB** of storage and
   **pauses after seven days idle**. For real admission files, the school must either accept those
   limits in writing or the project moves to a paid plan. A paused project on the day a parent
   applies is a failed application.
3. **Backup and restore proven**, with a completed drill and a written runbook.
4. **Retention and deletion policy approved** by the school (open in the PRD).
5. **Privacy notice and consent wording approved**, including for children's data.
6. **Nigerian data protection review** — see §14.
7. **Security review** of authorization on every admin route, file access, and rate limits.
8. **Accessibility testing** completed per `DESIGN.md` §8.
9. **Monitoring and an incident runbook** in place.
10. **Atlas network access** reviewed, given Render's non-static egress (§11, item 5).

---

## 13. Known limitations

1. **Cold starts.** First request after 15 idle minutes waits roughly a minute. Unavoidable on
   Render free without a keep-alive, which is itself unverified against the terms.
2. **Single point of failure.** One Render instance, one Atlas cluster, no redundancy.
3. **0.5 GB database ceiling.** Fine for years of text records; photographs must never be
   stored in the database.
4. **100 operations/second.** Adequate, but a naive dashboard query loop could hit it.
5. **32 MB in-memory sort.** Listing without an index on the sort field will fail at scale.
6. **Atlas pauses after 30 days of no connections** and requires manual resumption.
7. **No SLA on any component.** Nothing in this stack promises uptime.
8. **Broad Atlas allowlist** because Render's egress IPs are not static.
9. **Deployed-domain cookie behaviour is untested.** Until T1 passes, admin authentication is a
   design, not a fact.
10. **Storage pauses after 7 days idle.** Shorter than Atlas's 30. When it happens, uploads fail
    and gallery images disappear until someone resumes the project.
11. **1 GB of file storage, shared.** Admission photographs, gallery images and any staging share
    one gigabyte.
12. **5 GB monthly egress.** Private photographs pass through the API, so they are counted once by
    Supabase and again by Render. Fine at this scale; not a limit to forget.
13. **Gallery publication is weaker than designed** unless D-13 is resolved. A public bucket serves
    every object in it, so an uploaded-but-unpublished image is still reachable by URL.

---

## 14. Privacy and data protection

A preliminary identification of Nigerian obligations was completed on 24 October 2026 and is
recorded in **`SECURITY.md` §13**, with threat analysis in `THREAT_MODEL.md`. It is not legal
advice and does not establish compliance.

Verified from the primary text of the Nigeria Data Protection Act 2023:

- **s.28** — a Data Privacy Impact Assessment is required before processing likely to result in
  high risk. Children's data, health information and photographs together make that the default
  assumption.
- **s.29** — processor obligations, including a **written agreement** between controller and
  processor. Vercel, Render, Supabase and MongoDB are all processors.
- **s.30** — sensitive personal data may only be processed on listed grounds.
- **s.31** — parental or guardian consent is required for a child's data, and the controller must
  apply **appropriate mechanisms to verify age and consent**.
- **Part VIII** — cross-border transfers. Every component is hosted outside Nigeria.

Separately, the NDPC's GAID 2025 classifies **primary and secondary schools** in its
Ordinary-High Level tier of data controllers of major importance, implying registration and
annual renewal. That reading comes from a secondary source and must be confirmed against the GAID
text by qualified counsel.

What the architecture does provide: data minimisation (only approved fields), access control on
every private surface, no personal data in logs or URLs, encryption in transit, and encrypted
backups. What it does not provide: a lawful basis, a privacy notice, a retention rule, a DPIA, or
a registration determination. Those are school and legal decisions, tracked as L-01 to L-10 in
`SECURITY.md` §13.3.

---

## 15. Unresolved questions and blockers

Updated 24 October 2026 on approval. A resolved item is recorded in `DECISIONS.md`; it is not
reopened without a reason.

| # | Question | Status |
|---|---|---|
| Q1 | Is the school website eligible under Vercel Hobby? | **Open** — SG-01, requires Vercel's written answer |
| Q2 | Does the Vercel→Render rewrite survive a ~60 s cold start? | **Open** — must be measured (TEST_PLAN T2) |
| Q3 | Is a keep-alive pinger acceptable under Render's terms? | **Open** — unverified; do not rely on it |
| Q4 | File storage provider? | Resolved — **Supabase Storage** (ADR-032; supersedes ADR-019) |
| Q5 | Backup destination? | Resolved — Supabase Storage backup project, subject to **D-12** |
| Q6 | Atlas Free accepted for Stage 2, or upgrade? | **Open** — SG-02, school decision |
| Q7 | Retention and permanent-deletion policy? | **Open** — school decision |
| Q8 | Backup retention period? | Resolved — 30 daily + 12 monthly, subject to Q7 |
| Q9 | PDF generation approach? | Resolved — `pdfkit` (ADR-021) |
| Q10 | Dashboard count definitions? | Resolved — `API_SPEC.md` §4.1 |
| Q11 | Archive vs Trash for enquiries and visits? | Resolved — archive only; Trash is applications-only |
| Q12 | Event time-of-day? | **Partly** — date-only approved as the interim model; a time is a product change |
| Q13 | Does the admin edit school information (FR-003), and where? | Resolved — fixed structured fields, `pagecontents` collection (ADR-030) |
| Q14 | Health data in bulk PDF? | Resolved — excluded (ADR-026) |
| Q15 | Testimonial name display? | **Open** — school preference |
| Q16 | Idle session timeout? | Resolved — 60 minutes sliding (ADR-027) |

**Q13 — resolved.** FR-003 is satisfied by a fixed set of named sections per page, stored in
`pagecontents` and editable in the dashboard, but not addable, removable, reordered or restyled
(ADR-030). `settings` continues to hold contact details, social links, branding and placement
lists. The school's actual text is still outstanding — a content task, not a technical one.

**Nothing currently blocks implementation.** The remaining open items are verifications (Q2, Q3)
and school or legal decisions (Q1, Q6, Q7, Q12, Q15), none of which blocks the core slices.

---

## Appendix A — Superseded alternative (22 October 2026)

A single Oracle Cloud Always Free VM running Caddy + Express + PostgreSQL, with Neon for the
database, was proposed and accepted on 22 October 2026, then withdrawn on 24 October 2026 in
favour of the Vercel/Render/Atlas direction.

It is recorded here because it remains the only arrangement examined that keeps the database
and application under direct control, allows same-origin cookies without a proxy, and supports
local `pg_dump` backups. Its risks were Oracle's idle-reclamation policy (CPU 95th percentile
below 20% over 7 days), a single point of failure, and full OS patching responsibility.

It is **not** a current recommendation and should not be resurrected without a fresh decision.

## Appendix B — Sources

All checked 24 October 2026 unless noted.

- Vercel fair use guidelines — https://vercel.com/docs/limits/fair-use-guidelines
- Render free tier — https://render.com/docs/free
- Atlas free/shared limitations — https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/
- Atlas pause/resume — https://www.mongodb.com/docs/atlas/pause-terminate-cluster/
- Atlas free cluster backups — https://www.mongodb.com/docs/atlas/backup/cloud-backup/free-cluster-backup/
- Atlas pricing — https://www.mongodb.com/pricing
- Supabase Storage docs and pricing — https://supabase.com/docs/guides/storage · https://supabase.com/pricing (29 October 2026)
- Supabase Storage access control — https://supabase.com/docs/guides/storage/security/access-control (29 October 2026)
- Supabase Storage signed URLs — https://supabase.com/docs/guides/storage/serving/downloads (29 October 2026)
- Cloudflare R2 pricing — https://developers.cloudflare.com/r2/pricing/ (22 October 2026; retained as the superseded alternative)
