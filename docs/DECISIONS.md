# Chosen School Website — Decision Log

**Document status:** Living record — baseline approved 24 October 2026
**Version:** 1.0
**Last updated:** 24 October 2026

> One entry per significant decision. A decision is only **Accepted** when the project owner has
> said so explicitly. Anything I have recommended is **Proposed** and must not be implemented as
> though it were settled. Superseded decisions stay in the log — the history is the point.

---

## Index

| ID | Title | Status |
|---|---|---|
| ADR-001 | Frontend stack: React + Vite + TypeScript + Tailwind | Accepted |
| ADR-002 | Frontend hosting: Vercel | Accepted (conditional) |
| ADR-003 | Backend: Express + TypeScript | Accepted |
| ADR-004 | Backend hosting: Render free web service | Accepted |
| ADR-005 | Database: MongoDB Atlas Free (M0) | Accepted |
| ADR-006 | ODM: Mongoose | Accepted |
| ADR-007 | Repository structure | Accepted |
| ADR-008 | Administrator maximum session duration: 12 hours | Accepted |
| ADR-009 | Two launch stages | Accepted |
| ADR-010 | Oracle Cloud single-VM architecture | Superseded |
| ADR-011 | PostgreSQL + Prisma | Superseded |
| ADR-012 | Supabase Free as database | Rejected |
| ADR-013 | Long-lived JWT in `localStorage` | Rejected |
| ADR-014 | Assuming Vercel Hobby eligibility | Rejected |
| ADR-015 | Same-origin API via Vercel rewrite | Accepted |
| ADR-016 | Session cookie strategy | Accepted |
| ADR-017 | Argon2id password hashing | Accepted |
| ADR-018 | Server-side sessions in Atlas | Accepted |
| ADR-019 | Cloudflare R2 for file storage | Accepted |
| ADR-020 | Cloudflare R2 for backup destination | Accepted |
| ADR-021 | PDF generation with `pdfkit` | Accepted |
| ADR-022 | One `announcements` collection with a `kind` discriminator | Accepted |
| ADR-023 | Bounded embedded revision history | Accepted |
| ADR-024 | `categories` collection | Accepted |
| ADR-025 | `auditlogs` collection, 12-month retention | Accepted |
| ADR-026 | Health information excluded from bulk PDF | Accepted |
| ADR-027 | 60-minute idle session timeout | Accepted |
| ADR-028 | Keep-alive pinger for Render | Accepted in principle, unverified |
| ADR-029 | Security control baseline (`SECURITY.md` §20) | Accepted |
| ADR-030 | School information as fixed structured fields (Q13) | Accepted |
| ADR-031 | Admission form field baseline (D-01, D-02) | Accepted |

---

## Accepted

### ADR-001 — Frontend stack
**Status:** Accepted · **Date:** 2026-10-24 · **Owner decision**

**Context.** The public site and dashboard need a component model, a build tool, and type safety
across a form-heavy UI.

**Decision.** React with Vite, TypeScript, and Tailwind CSS.

**Consequences.** Vite produces a static bundle that any static host can serve, which keeps the
hosting decision (ADR-002) separable from the framework choice. Tailwind moves design decisions
into markup, so the token layer described in `DESIGN.md` §2.3 must be enforced by convention
rather than by a theme file.

---

### ADR-002 — Frontend hosting: Vercel
**Status:** Accepted, **conditional** · **Date:** 2026-10-24 · **Owner decision**

**Context.** Vercel is the preferred provider. Its Hobby plan is restricted to non-commercial
personal use, and a school website advertising admissions may fall outside that.

**Decision.** Vercel, subject to plan eligibility being confirmed.

**Consequences.** This is a **deployment condition for Stage 1** and a **blocker for Stage 2**.
Low traffic is not an eligibility argument — the restriction is about purpose, not volume. The
question must be put to Vercel Support in writing and the answer recorded here. If Hobby is not
eligible, the options are Vercel Pro (paid, requires approval), Cloudflare Pages, or Render
Static Sites; the provider is not to be changed silently.

**Follow-up.** Send the eligibility question. Record the written answer verbatim.

---

### ADR-003 — Backend: Express + TypeScript
**Status:** Accepted · **Date:** 2026-10-24 · **Owner decision**

**Context.** The API owns validation, authorization, file handling, and PDF generation.

**Decision.** Node.js with Express and TypeScript.

**Consequences.** Express is a long-lived, well-understood choice with no framework-specific
lock-in. It also means the security controls are ones we write and must therefore test, rather
than ones a framework provides by default.

---

### ADR-004 — Backend hosting: Render free web service
**Status:** Accepted · **Date:** 2026-10-24 · **Owner decision**

**Context.** A free host for a Node service was required.

**Decision.** Render's free web service.

**Consequences.** Render's own documentation states free instances should not be used for
production. Verified limits: spins down after 15 minutes idle, ~1 minute to wake, ephemeral
filesystem, may restart at any time, 750 instance hours per month, no shell. **Nothing permanent
may be stored on disk** (ADR-019), and no state may live in process memory — sessions and rate
limit counters go to Atlas (ADR-018).

**Follow-up.** Measure real cold-start latency through the proxy (TEST_PLAN T2).

---

### ADR-005 — Database: MongoDB Atlas Free (M0)
**Status:** Accepted · **Date:** 2026-10-24 · **Owner decision**

**Context.** The data is document-shaped: applications with embedded student, guardian and
placement blocks; content items with optional event blocks.

**Decision.** MongoDB Atlas, Free tier.

**Consequences.** Verified limits: 0.5 GB, 500 connections, 100 operations/second, 32 MB
in-memory sort cap, 500 collections. The cluster **pauses after 30 days of inactivity** and
requires manual resumption — data is retained, not deleted. MongoDB documents the free tier as
being for learning and exploration, with no SLA; accepting it for Stage 2 is a decision the
school must make in writing, and is the most likely point at which the "fully free" constraint
fails.

**Follow-up.** Stage 2 tier decision.

---

### ADR-006 — ODM: Mongoose
**Status:** Accepted · **Date:** 2026-10-24 · **Owner decision**

**Decision.** Mongoose for schemas, validation, and population.

**Consequences.** Mongoose validation is application-level, not database-level. Every rule in
`DATA_MODEL.md` must therefore be enforced twice — once in the schema and once in Zod at the API
boundary — because a schema can be bypassed by a query that skips validation.

---

### ADR-007 — Repository structure
**Status:** Accepted · **Date:** 2026-10-24 · **Owner decision**

**Decision.**

```text
chosen-school/
├── client/
├── server/
├── docs/
├── README.md
└── root configuration
```

**Consequences.** No monorepo tooling, no `apps/` layout, no shared package. If shared types
become necessary, they are duplicated deliberately or introduced as a single small package —
that would be a new decision.

---

### ADR-008 — Administrator maximum session duration
**Status:** Accepted · **Date:** 2026-10-24 · **Owner decision**

**Decision.** 12 hours absolute maximum.

**Consequences.** Absolute expiry is stored on the session document at creation and never
extended. Sliding renewal may shorten the practical session but must never push it past 12 hours.

---

### ADR-009 — Two launch stages
**Status:** Accepted · **Date:** 2026-10-24 · **Owner decision**

**Context.** The school is not replacing its paper admission process immediately.

**Decision.** Stage 1 is a demonstration and familiarisation deployment. Stage 2 is official
production use with real personal data. They have separate readiness requirements.

**Consequences.** A configuration acceptable for Stage 1 is not thereby acceptable for Stage 2.
The Stage 2 gate list in `ARCHITECTURE.md` §12.2 is the definition of "ready", and no real
application may be accepted before every item is closed. This also means the site can go live
sooner, provided the admission form is disabled or clearly labelled during Stage 1.

---

## Superseded

### ADR-010 — Oracle Cloud single-VM architecture
**Status:** Superseded (was Accepted 2026-10-22) · **Superseded by:** ADR-002, ADR-004, ADR-005

**Context.** Proposed on 22 October 2026 as a way to keep Express and PostgreSQL together on one
free host, with same-origin cookies and local `pg_dump` backups.

**Why superseded.** The project owner chose the Vercel/Render/Atlas direction on 24 October 2026.

**Consequences.** The Oracle arrangement remains the only option examined that avoids a
cross-origin proxy and keeps backups fully under the developer's control. It is recorded in
`ARCHITECTURE.md` Appendix A so the trade-off is not lost, but it is **not** a current
recommendation and must not be revived without a new decision.

---

### ADR-011 — PostgreSQL + Prisma
**Status:** Superseded (was Proposed) · **Superseded by:** ADR-005, ADR-006

**Why superseded.** The database decision changed to MongoDB with Mongoose.

**Consequences.** All PostgreSQL, Prisma, migration and foreign-key language has been removed
from the technical documents. Relational guarantees that the application now has to provide for
itself are listed in `DATA_MODEL.md` §17.

---

## Rejected

### ADR-012 — Supabase Free as the database
**Status:** Rejected · **Date:** 2026-10-24

**Context.** Considered as an alternative to Atlas.

**Why rejected.** Verified on 24 October 2026: Free projects **pause after 7 days of
inactivity**, and the free plan includes **no backups and no point-in-time recovery**. A school
site can plausibly go a week without a database request during holidays, and an unpause requires
a manual dashboard action. Separately, using Supabase's auth and generated API would replace
Express and move authorization into row-level security policies — a different architecture, not
a drop-in database.

---

### ADR-013 — Long-lived JWT in `localStorage`
**Status:** Rejected · **Date:** 2026-10-24

**Why rejected.** Cannot be revoked before expiry, readable by any XSS, and offers no benefit
with a single administrator where horizontal scaling is irrelevant.

---

### ADR-014 — Treating Vercel Hobby as eligible by assumption
**Status:** Rejected · **Date:** 2026-10-24

**Why rejected.** The fair-use guidelines restrict Hobby to non-commercial personal use, and
name "advertising the sale of a product or service" and "receiving payment to create, update, or
host the site" as commercial. Proceeding on an assumption would put the school's site at risk of
suspension at an arbitrary time. The question is asked and answered in writing, or the provider
changes (ADR-002).

---

## Accepted 24 October 2026 — technical proposals

These were proposed in the architecture documents and accepted when the project owner approved
the document set. Each entry states what was accepted, and what still has to be *verified* before
it can be called working. Acceptance of a design is not evidence that it behaves as designed.

### ADR-015 — Same-origin API via Vercel rewrite
**Status:** Accepted · **Date:** 2026-10-24

**Context.** `<project>.vercel.app` and `<service>.onrender.com` are different sites. A cookie set
by the API is third-party, so `SameSite=Lax` fails and `SameSite=None` is blocked by Safari.

**Options.**
1. Rewrite `/api/*` on Vercel to the Render service — browser sees one origin.
2. `SameSite=None; Secure` with a credentialed CORS allowlist — works in Chrome, fails in Safari
   and private browsing.
3. Buy a domain and use `api.` subdomain — correct, but costs money.

**Proposal.** Option 1.

**Consequences.** CORS becomes unnecessary and should be omitted entirely. The cookie is
first-party and `__Host-` becomes usable. Two risks must be measured, not assumed: whether the
proxy holds a ~60 second cold start, and whether client IP survives for rate limiting. If it
fails, option 2 with a documented Safari limitation is the fallback.

**Follow-up.** TEST_PLAN T1–T4.

---

### ADR-016 — Session cookie strategy
**Status:** Accepted · **Date:** 2026-10-24 · **Depends on:** ADR-015

**Proposal.** `__Host-cs_session`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, no `Domain`.

**Consequences.** The `__Host-` prefix makes the browser reject the cookie if any of those
attributes are wrong, so a future misconfiguration fails visibly. Only valid if ADR-015 holds.

---

### ADR-017 — Argon2id password hashing
**Status:** Accepted · **Date:** 2026-10-24

**Proposal.** Argon2id at OWASP-baseline parameters, with parameters stored alongside each hash so
they can be raised without invalidating credentials.

**Consequences.** Requires native bindings, which build fine on Render's Linux runtime. If the
build ever fails, the fallback is bcrypt with a high cost factor — a decision, not a silent swap.

---

### ADR-018 — Server-side sessions stored in Atlas
**Status:** Accepted · **Date:** 2026-10-24

**Proposal.** Session documents keyed by a SHA-256 hash of the cookie token, with absolute and
idle expiry, revoked by deletion.

**Consequences.** Revocation is immediate. It adds one indexed read per authenticated request,
which is negligible at this scale. A TTL index provides housekeeping, but the application must
still check expiry explicitly because the TTL monitor runs only about once a minute.

---

### ADR-019 — Cloudflare R2 for file storage
**Status:** Accepted — **selected**. Not yet configured or verified · **Date:** 2026-10-24

**Decision.** Cloudflare R2, three buckets: private admission photographs, public gallery images,
backups. 10 GB free, zero egress.

**Consequences.** Required because Render's disk is ephemeral. Introduces an S3-compatible client
dependency and a third vendor. Alternatives (Backblaze B2, Supabase Storage, Atlas GridFS) were
considered and rejected in `ARCHITECTURE.md` §8.4.

**Status of the integration.** Selection is settled; nothing is provisioned. No account, bucket,
token or connection exists. See `INTEGRATIONS.md` I-05 and I-06 — both remain "Awaiting my
action". The three-bucket design and the separation between the application token and the backup
token are part of this decision and are not optional.

---

### ADR-020 — Cloudflare R2 for the backup destination
**Status:** Accepted · **Date:** 2026-10-24

**Proposal.** Encrypted `mongodump` archives and file archives uploaded to a separate R2 bucket,
encrypted client-side with a key held offline.

**Consequences.** A different vendor from both Atlas and Render, so one provider's outage does not
take the backups with it. The key must never be stored on Render or in the repository, or the
encryption protects nothing.

**Open.** Approval, retention period, and where the key is physically held.

---

### ADR-021 — PDF generation with `pdfkit`
**Status:** Accepted · **Date:** 2026-10-24

**Context.** FR-020 requires printing and PDF export, individually and in bulk.

**Options.** Headless Chromium (faithful to the HTML, ~300–500 MB per render); `pdfkit` (a
programmatic layout, small footprint).

**Proposal.** `pdfkit` with a fixed layout template.

**Consequences.** Render's free instance has limited memory; Chromium is not viable there. A
fixed layout is more predictable for a form than an HTML render, and bulk export of 50 records
becomes one streaming response. The cost is that the PDF layout is maintained separately from
the web UI.

---

### ADR-022 — One `announcements` collection with a `kind` discriminator
**Status:** Accepted · **Date:** 2026-10-24

**Context.** Announcements and events share the draft/publish workflow, categories, expiry, and
one admin editor, and appear on one public page with two tabs.

**Proposal.** One collection, `kind: 'announcement' | 'event'`, with a conditional `event` block.

**Consequences.** One set of publishing rules instead of two. The conditional requirement needs an
explicit validator, since `required` alone cannot express "required only when kind is event".

---

### ADR-023 — Bounded embedded revision history
**Status:** Accepted · **Date:** 2026-10-24

**Context.** FR-019 requires recording edits and preserving original values "where practical".

**Options.** A separate `revisions` collection (complete, unbounded, one more query per record);
an embedded bounded array (simple, capped).

**Proposal.** Embedded array of the last 50 field-level changes.

**Consequences.** Keeps the history with the record and requires no join. History beyond 50 edits
is lost — acceptable for a record edited a handful of times. If the school later wants a full
audit trail, that becomes a new collection and a new decision.

---

### ADR-024 — `categories` collection rather than a list in settings
**Status:** Accepted · **Date:** 2026-10-24

**Proposal.** A small collection with `scope` (`gallery` or `announcement`), so items reference a
stable id.

**Consequences.** Renaming a category is one write rather than a bulk update across items.
Deleting one that is in use is blocked rather than silently orphaning content — the extra click
is deliberate.

---

### ADR-025 — `auditlogs` collection with 12-month retention
**Status:** Accepted · **Date:** 2026-10-24

**Context.** Permanent deletion of a child's record should leave a trace, and authentication
events are needed for incident response.

**Proposal.** Log auth events and permanent deletions only. Never store the deleted content
itself.

**Consequences.** If the audit entry copied the deleted data, deletion would be a fiction — the
personal data would survive in the log. Retention of 12 months is proposed, not agreed, and is
coupled to the retention policy that is still open.

---

### ADR-026 — Health information excluded from bulk PDF export
**Status:** Accepted · **Date:** 2026-10-24

**Proposal.** Health information appears in the single-record PDF but not in a bulk export.

**Consequences.** A bulk file is more likely to be emailed or printed and left unattended. The
cost is that a bulk export is not a complete record, which must be stated in the UI so nobody
relies on it as one.

---

### ADR-027 — 60-minute idle session timeout
**Status:** Accepted · **Date:** 2026-10-24

**Proposal.** Sliding 60-minute idle timeout inside the 12-hour absolute ceiling (ADR-008).

**Consequences.** A dashboard left open on a shared office machine locks itself. The administrator
will occasionally be interrupted mid-task; the UI must re-authenticate without losing unsaved
work, or the timeout will be worked around.

---

### ADR-028 — Keep-alive pinger for Render
**Status:** Accepted in principle, **unverified** · **Date:** 2026-10-24

**Context.** Render free spins down after 15 minutes idle. 24/7 uptime is ~730 hours against a
750-hour monthly allowance, leaving almost no headroom.

**Proposal.** External pings during active hours only (e.g. 06:00–22:00, ~480 hours), not 24/7.

**Consequences.** Removes cold starts from the school day without exhausting the allowance.
**Whether deliberate keep-alive traffic is acceptable under Render's terms is unverified** and must
be checked before it is relied upon. It also conflicts with the idle-reduction premise of the free
tier, which is a fair question for Render to answer rather than for us to assume.

---

## Accepted 24 October 2026 — security controls

### ADR-029 — Security control baseline
**Status:** Accepted · **Date:** 2026-10-24

**Context.** `SECURITY.md` and `THREAT_MODEL.md` were prepared for review. Most controls restate
decisions already accepted; a number were new.

**Decision — controls approved:**

1. Authorization middleware applied to the whole `/admin` router, not per handler.
2. Immutable fields (`submittedAt`, `deletedAt`, `revisions`, `search`, `status`, `publishedAt`,
   `_id`) rejected with a validation error rather than silently ignored.
3. Unknown request keys stripped, not merged.
4. Boot-time configuration validation; refuse to start on a missing or malformed required value.
5. Startup logs variable **names**, never values.
6. MFA on Vercel, Render, Cloudflare, Atlas and GitHub accounts.
7. Lockfile committed and `npm ci` used in builds; dependencies reviewed before being added.
8. Public source maps disabled in production.
9. Explicit security header set, including a Content-Security-Policy.
10. Password change deletes all sessions; logout deletes the session row.
11. Session expiry checked on every request rather than delegated to the TTL index.
12. Bulk PDF export excludes health information (ADR-026) **and** is `no-store`.

**Consequences.** Items 1 and 2 are cheap now and expensive to retrofit — a missing middleware
line is invisible in review, and a mass-assignment hole is a data-integrity failure. Items 6 and 7
are process controls that depend on discipline rather than code, which makes them the most likely
to lapse; they are recorded here so that lapse is visible.

**What this decision does not cover.** DPIA, NDPC registration, processor agreements, cross-border
transfer basis, consent and age verification, and retention policy. Those are L-01 to L-10 in
`SECURITY.md` §13.3. Neither of us can approve them: they belong to the school, with qualified
counsel. Approving this document does not make the system lawful, and it does not verify any
control — SEC-01 to SEC-14 remain unrun.

---

## Accepted 24 October 2026 — content and admission baseline

### ADR-030 — School information as fixed structured fields (Q13, Option A)
**Status:** Accepted · **Date:** 2026-10-24 · **Owner decision**

**Context.** FR-003 requires the administrator to manage the school's history, mission, teaching
approach, facilities, extracurricular activities and admission requirements without code edits.
The PRD non-goals forbid the administrator from changing layout, page structure or navigation.
Those two requirements pull in opposite directions unless the editable surface is bounded.

**Options considered.** (a) Free-form content blocks the administrator could add, remove and
reorder; (b) a fixed set of named text fields per page; (c) content fixed in code with only
contact details editable.

**Decision — Option A, fixed structured fields.** Each content page is composed of a fixed set of
named text sections defined in code. The administrator may edit the body text of each section. The
administrator may **not** add, remove, reorder, rename or restyle sections, and cannot change
layout.

| Page key | Fixed sections |
|---|---|
| `about` | `history`, `mission`, `vision` |
| `academics-primary` | `introduction`, `classesOffered`, `teachingApproach`, `facilities`, `extracurricularActivities` |
| `academics-secondary` | `introduction`, `classesOffered`, `teachingApproach`, `facilities`, `extracurricularActivities` |
| `admissions` | `requirements`, `process` |

**Consequences.**
- The section set is a constant in the codebase. Changing it is a code change and a new decision,
  not something the school can do from the dashboard.
- Stored as one document per page in a `pagecontents` collection (`DATA_MODEL.md` §13).
- Section bodies are sanitised HTML, and are a stored-XSS surface exactly like announcement bodies.
- A section the school has not supplied is **empty**, and the public page shows an honest
  "information not yet available" state. It is never filled with invented text.
- The school still has to supply the actual content. That is a content-provision task, separate
  from this decision, and it is not satisfied by this approval.

**Supersedes.** Q13, previously recorded as blocking implementation.

---

### ADR-031 — Admission form field baseline (D-01, D-02)
**Status:** Accepted · **Date:** 2026-10-24 · **Owner decision**

**Decision.**
1. **D-01.** The proposed admission field list in `PRD.md` §6.2 is the agreed baseline, with the
   required and optional status exactly as proposed there. The typed parent/guardian full name is
   **required** as a signature.
2. **D-02.** The permitted values for `gender` are **`male` | `female`**.

**Consequences.**
- `DATA_MODEL.md` §4.2 and `API_SPEC.md` §2.6 are the implementation contract; they are now
  aligned rather than provisional.
- A later change to the field list — adding, removing, or changing requiredness — is a **schema
  change**, requiring a migration plan and a new decision. It is not a form tweak.
- The system still makes **no claim about the legal validity** of a typed signature. Recording a
  name is not evidence that the signatory is the guardian; that remains L-04 in `SECURITY.md`
  §13.3, for the school and counsel.
- **This approval does not authorise collecting real personal data.** The Stage 2 gates in
  `PRD.md` §4.4 and `SECURITY.md` §18 remain in force and unmodified.

---

## Open — not yet decided

**Resolved by the 24 October 2026 approval** (recorded so they are not reopened without reason):

| # | Item | Now |
|---|---|---|
| Q4 | Photo storage provider | Cloudflare R2 (ADR-019) |
| Q5 | Backup destination | Cloudflare R2, encrypted, separate bucket (ADR-020) |
| Q8 | Backup retention | 30 daily + 12 monthly, subject to Q7 |
| Q9 | PDF approach | `pdfkit`, server-side (ADR-021) |
| Q10 | Dashboard count definitions | As specified in `API_SPEC.md` §4.1 |
| Q11 | Archive vs Trash | Archive only for enquiries and visits; Trash is applications-only |
| Q13 | Admin editing of school information | Fixed structured fields, Option A (ADR-030) |
| Q14 | Health data in bulk PDF | Excluded (ADR-026) |
| Q16 | Idle timeout | 60 minutes sliding (ADR-027) |

Also resolved on 24 October 2026, outside the Q numbering: **D-01** (admission field baseline) and
**D-02** (gender values) — both in ADR-031.

**Still open.** These are not decisions waiting on preference — they are facts to be established
or decisions the school must make. None can be closed by approving a document.

| # | Item | Why it is still open |
|---|---|---|
| Q1 | Vercel Hobby eligibility | Requires Vercel's written answer. SG-01 |
| Q2 | Proxy survives a ~60 s cold start | Must be measured on the deployed domains (TEST_PLAN T2) |
| Q3 | Keep-alive acceptable under Render's terms | Unverified; do not rely on it until checked |
| Q6 | Atlas tier for Stage 2 | School decision, in writing. SG-02 |
| Q7 | Retention and permanent-deletion policy | School policy decision |
| Q12 | Event time-of-day | Date-only is the approved interim model; adding a time is a product change |
| Q15 | Testimonial name display | School preference |

**Note on Q13.** Resolved by ADR-030. FR-003 is satisfied by a fixed set of named sections per
page, editable in the dashboard but not addable, removable or reorderable. `settings` continues to
hold contact details, social links, branding and placement lists; `pagecontents` holds the
long-form page text. The school's actual content is still outstanding — that is a content task,
not a decision.
