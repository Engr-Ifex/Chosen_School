# Chosen School Website — Security and Data Protection

**Document status:** Approved
**Version:** 1.0
**Date:** 24 October 2026
**Approved by:** project owner, 24 October 2026
**Baseline:** `PRD.md`, `ARCHITECTURE.md`, `DATA_MODEL.md`, `API_SPEC.md`, `INTEGRATIONS.md`, `DECISIONS.md`
**Companion:** `THREAT_MODEL.md`

> This document states what the system must do to be safe for children's and parents' personal
> data. It is a specification, not a description of anything built. **No control in this document
> has been implemented or tested.** Where a control depends on a provider behaviour that has not
> been measured, it is marked accordingly.

---

## 1. How to read this document

| Tag | Meaning |
|---|---|
| **[APPROVED]** | Already decided in the approved document set |
| **[PROPOSED]** | A control proposed after the 24 October 2026 baseline. **None currently outstanding** — every control below is approved |
| **[VERIFY]** | Design agreed, but behaviour is unproven until tested on the real deployment |
| **[LEGAL]** | Requires qualified Nigerian legal review; not a technical decision |
| **[STAGE-2]** | Not required for the demonstration; mandatory before real applications |

Controls are written as requirements with a testable condition wherever possible. "Be secure" is
not a control.

---

## 2. Security objectives

1. **Children's and families' data is readable only by the administrator.** No other person, and
   no unauthenticated request, reaches it.
2. **A submission is never falsely confirmed.** Success is shown only after the record exists.
3. **A private photograph cannot become public.** Not by accident, not by a bug in visibility
   logic, not by guessing a URL.
4. **Loss is bounded and recoverable.** Up to 24 hours of records may be lost; nothing may be
   lost permanently.
5. **Compromise of one component does not yield the backups.** The application server cannot
   delete or read the backup archives.
6. **Failures fail closed.** An unavailable database denies access; it does not fall back to
   something permissive.

## 3. Principles

- **Least privilege.** Every credential can do only what its job requires. The database user is
  not an admin. The storage token is scoped to two buckets. The backup token is scoped to one.
- **Deny by default.** Administrative routes are protected by middleware applied to the whole
  router, not route by route, because one forgotten decorator is invisible in review.
- **Minimise what is collected.** Only fields the school has approved. Optional fields stay
  optional. No field is added "while we are here".
- **The server is the boundary.** The client never decides access. Client-side route guards are
  usability, not security.
- **No secret in the browser, ever.** Only `VITE_`-prefixed values reach the bundle, and none of
  them may be sensitive.
- **Verify, do not assume.** A control is not real because it is configured; it is real when it
  has been tested and the result recorded.

---

## 4. Data classification

| Class | Data | Who may read | Where |
|---|---|---|---|
| **Critical** | Admission applications: student name, date of birth, gender, religion, ethnicity, state of origin, previous school, health information, photograph | Administrator only | Atlas, R2 private bucket |
| **Critical** | Parent/guardian name, home address, phone, email, occupation, office address | Administrator only | Atlas |
| **Critical** | Administrator password hash, session tokens | Nobody, in readable form | Atlas |
| **Moderate** | Enquiries and visit requests: contact details and message | Administrator only | Atlas |
| **Moderate** | Pending and rejected testimonials, audit records | Administrator only | Atlas |
| **Public** | Published announcements and events, public gallery images, published FAQs, approved testimonials, school contact details | Anyone | Atlas, R2 public bucket |

**Health information is the highest-risk field in the system.** It is optional, sensitive under
NDPA s.30, never appears in a list view, never appears in a log, and — per ADR-026 — is excluded
from bulk PDF export. Its necessity should be re-confirmed with the school before Stage 2.

**Religion, ethnicity and state of origin** were requested by the school and are collected as
optional fields. Under NDPA they may be treated as sensitive personal data. Their necessity
should be part of the DPIA (§13.2), not assumed.

---

## 5. Trust boundaries

| Boundary | Crossing | Control |
|---|---|---|
| Browser → Vercel | Public internet | TLS; static assets only; no secrets in the bundle |
| Browser → Vercel `/api/*` → Render | Vercel rewrite proxy | TLS on both hops; the browser never learns the Render hostname |
| Render → Atlas | Provider network | TLS required; SCRAM auth; scoped database user |
| Render → R2 | Provider network | TLS; token scoped to two buckets |
| Developer machine → Atlas / R2 backup | Home network | TLS; read-only database user; separate backup token |
| Administrator → dashboard | Public internet | Session cookie; origin and CSRF checks; rate limiting |

The boundary that matters most is **the browser**. Everything the browser holds is public, so
authorization decisions must never be based on anything the browser sends about itself.

---

## 6. Authentication

### 6.1 Administrator credentials

| Control | Status |
|---|---|
| One administrator account, no registration route exists at all | [APPROVED] |
| Argon2id hashing at OWASP-baseline parameters, parameters stored with the hash | [APPROVED] ADR-017 |
| Password minimum length 12, checked against a breach list on provisioning | [APPROVED] |
| Credentials provisioned by a CLI script run locally, never by an HTTP endpoint | [APPROVED] |
| Generic authentication errors — never reveals whether an account exists | [APPROVED] |
| Failed attempts counted per email; temporary lockout; both logged | [APPROVED] |

**No password reset endpoint exists.** Recovery is developer-assisted, by script, over a channel
that is not the website. This removes an entire class of account-takeover risk at the cost of a
manual process — a good trade for a single administrator.

### 6.2 Session management

| Control | Status |
|---|---|
| Server-side sessions in Atlas; cookie carries a random token, database stores only its SHA-256 hash | [APPROVED] ADR-018 |
| Absolute maximum 12 hours, set at creation, never extended | [APPROVED] ADR-008 |
| Idle timeout 60 minutes, sliding | [APPROVED] ADR-027 |
| Cookie `__Host-cs_session; HttpOnly; Secure; SameSite=Lax; Path=/`, no `Domain` | [APPROVED] ADR-016 |
| Logout deletes the session row; password change deletes all rows | [APPROVED] |
| Expiry checked on every request, not delegated to the TTL index | [APPROVED] |
| Session token compared by hash lookup, never by scanning | [APPROVED] |

**The `__Host-` prefix is a deliberate safety device.** The browser refuses the cookie unless
`Secure` is set, `Path=/`, and no `Domain` attribute is present. A future misconfiguration fails
loudly instead of quietly weakening the cookie.

**Session fixation is structurally absent:** the token is generated server-side at login and
never accepted from the client.

### 6.3 What is deliberately not used

- No JWT in `localStorage` (ADR-013) — unrevocable, XSS-readable.
- No "remember me" beyond the 12-hour ceiling.
- No API keys or bearer tokens for the admin surface.
- No social or federated login.

---

## 7. Authorization

### 7.1 Model

One role, binary outcome: authenticated administrator, or anonymous. There is no ownership model,
no tenancy, and no partial access. That simplicity is a security asset — there is no permission
matrix to get wrong.

### 7.2 Enforcement rules

| Rule | Status |
|---|---|
| `/admin/*` protected by middleware on the router, not per handler | [APPROVED] |
| Every admin handler re-derives the session; no trust in a client-sent user id | [APPROVED] |
| Object access checked against the record, not the request (no IDOR) | [APPROVED] |
| Private photo endpoint verifies the application exists and belongs to the admin's scope | [APPROVED] |
| `404` returned instead of `403` where confirming existence would leak | [APPROVED] API_SPEC §1.4 |
| Public endpoints return fixed projections; never whole documents | [APPROVED] |
| `healthInformation` excluded from every list projection | [APPROVED] PRD FR-018 |

### 7.3 Mass assignment

The client may never set `submittedAt`, `deletedAt`, `revisions`, `search`, `status`,
`publishedAt`, or `_id`. A request attempting to set an immutable field is **rejected with a
validation error**, not silently ignored — a silent ignore leaves the client believing it changed
something.

### 7.4 Authorization tests that must exist

API-A01 to A06, A16 to A18, and F-10 to F-14 in `TEST_PLAN.md`. A passing authorization test suite
is a Stage 1 condition; a missing one is a blocker.

---

## 8. CSRF, origin and CORS

| Control | Status |
|---|---|
| `Origin` must equal `APP_ORIGIN`; `Sec-Fetch-Site` must not be `cross-site` on mutations | [APPROVED] |
| Per-session CSRF token required in `X-CSRF-Token` on authenticated mutations, constant-time compare | [APPROVED] |
| **CORS is not enabled at all** — the rewrite makes the API same-origin | [APPROVED] ADR-015 [VERIFY] |

**The CORS decision is a security decision, not a convenience.** If a credentialed CORS
allowlist were configured as well, a mistake in it becomes an authentication bypass. Because the
rewrite makes the browser see one origin, CORS can simply be absent — and absence is much easier
to verify than a correct allowlist.

**[VERIFY]** Whether the rewrite actually produces same-origin behaviour is unproven. TEST_PLAN
T1 and T4 decide it. If T1 fails, the fallback (`SameSite=None` + CORS) re-introduces exactly the
risk this design avoids, and must be treated as a security regression, not a neutral change.

---

## 9. Input validation

| Control | Status |
|---|---|
| Zod validation of body **and** query on every endpoint | [APPROVED] |
| Mongoose schema validation as an independent second check | [APPROVED] |
| Enumerations validated against allowlists, never free strings | [APPROVED] |
| `classApplyingFor` and `academicSession` validated against the settings lists | [APPROVED] |
| Unknown keys stripped, not merged | [APPROVED] |
| Sort and filter parameters whitelisted; unknown values rejected | [APPROVED] |
| NoSQL injection prevented by never passing raw client objects into query operators | [APPROVED] |

**The NoSQL injection point is specific and worth naming.** In MongoDB, a query like
`{ email: req.body.email }` will happily accept `{ "$ne": null }` and match the first document.
Every query must construct its filter from validated primitives — `String(value)`, not the
submitted object — and reject any input that is not the expected primitive type. Zod's
`.strict()` and explicit type coercion are the control.

**Announcement and page-content bodies** are sanitised against an allowlist of tags and attributes.
Disallowed markup is stripped, not escaped — escaped markup renders as visible garbage in the
editor and tempts someone to "fix" the sanitiser later. Both are stored-HTML surfaces reachable
only by the administrator, and both are covered by threat T-09.

---

## 10. File upload and access

| Control | Status |
|---|---|
| Magic-byte content check, not filename or declared MIME type | [APPROVED] |
| Accepted: JPEG, PNG, WebP only. **SVG rejected** (script-bearing). Animated images rejected | [APPROVED] |
| 5 MB limit, enforced at the server, not only in the browser | [APPROVED] |
| Re-encode through `sharp` to WebP at ≤1600 px — this also strips EXIF and GPS | [APPROVED] |
| Generated UUID storage keys; the original filename is discarded | [APPROVED] |
| Private and public images in **separate buckets**, not separate prefixes | [APPROVED] |
| Private photos streamed only through an authenticated endpoint | [APPROVED] |
| No presigned URLs for private photos | [APPROVED] |
| No code path promotes a private photo to public | [APPROVED] |

**Why not presigned URLs for private photos:** a presigned URL is a bearer credential. It lands
in browser history, in `Referer` headers, and in any proxy log. Streaming through an authorised
endpoint means the access decision is made on every request, by code that can be reviewed.

**Re-encoding is the strongest single control here.** It is not only about metadata: decoding and
re-encoding an image destroys polyglot payloads that survive a naive extension check.

---

## 11. Secrets and credentials

| Control | Status |
|---|---|
| `.env` gitignored; only `.env.example` committed, with placeholders | [APPROVED] |
| Server secrets set only in the Render dashboard; client bundle holds none | [APPROVED] |
| No secret uses the `VITE_` prefix | [APPROVED] |
| Boot-time validation refuses to start on a missing or malformed required variable | [APPROVED] |
| Startup logs variable **names**, never values | [APPROVED] |
| MFA on Vercel, Render, Cloudflare, Atlas and GitHub accounts | [APPROVED] [STAGE-2] |
| Credentials rotated on any suspected exposure | [APPROVED] |

### 11.1 Credential separation — the rule that protects the backups

| Credential | Scope | Lives |
|---|---|---|
| Atlas application user | `readWrite` on `chosen_school` only | Render env |
| Atlas backup user | Read-only on `chosen_school` | Developer machine |
| R2 application token | `admissions-private` + `gallery-public` | Render env |
| R2 backup token | `backups` only | Developer machine |
| `age` private key | Decrypts backups | Offline only |

**The application server must not hold the backup token.** If it did, an attacker who compromised
the API could delete the backups of the very data they had corrupted — turning a recoverable
incident into an unrecoverable one. This is the single most important separation in the design,
and it is easy to undo accidentally by "simplifying" the environment variables.

---

## 12. Logging, audit and monitoring

### 12.1 Never logged

Request bodies, passwords, session tokens, cookies, health information, photograph content,
full addresses, or full phone numbers. Query strings are logged with identifiers redacted.

### 12.2 Always logged

Request id, method, route pattern (not the concrete URL with identifiers), status, duration,
client IP (truncated), and for errors the stack trace **server-side only**.

### 12.3 Audit trail

Authentication events (success, failure, logout, password change) and permanent deletion of an
application are written to `auditlogs`. **The audit entry never contains the deleted content** —
if it did, deletion would be a fiction and the personal data would survive in the log.

### 12.4 Monitoring

`/api/v1/health` is public and returns `ok` or `503` with no internal detail. An external monitor
polls it every 5 minutes. This also detects an Atlas pause, which is otherwise completely silent —
no error is raised anywhere, the site simply stops working.

**[VERIFY]** No monitor exists yet. The health endpoint itself is unbuilt.

---

## 13. Legal and privacy considerations — Nigeria

**This section is not legal advice.** It records obligations identified from primary sources so
they can be reviewed by qualified Nigerian counsel. Nothing here should be read as a statement
that the school is compliant.

### 13.1 Verified from primary sources

Read directly from the **Nigeria Data Protection Act 2023** (47 pages, retrieved 24 October 2026):

| Provision | Requirement | Consequence for this project |
|---|---|---|
| **s.28** | Where processing is likely to result in **high risk** to rights and freedoms, a **Data Privacy Impact Assessment must be carried out before processing**; if residual risk remains high, the Commission must be consulted before processing | Children's data, health information and photographs together make high risk the default assumption. **A DPIA is required before Stage 2** |
| **s.29(1)–(2)** | The controller must ensure a processor complies with the Act, assists with data-subject rights, and implements appropriate technical and organisational measures. **The measures include a written agreement between controller and processor** | Vercel, Render, Cloudflare and MongoDB are processors. **Written processor terms are required**, and the school must satisfy itself that each is adequate |
| **s.30** | **Sensitive personal data** may only be processed on listed grounds — consent being the first | Health information is sensitive. Religion, ethnicity and state of origin may also be. Their necessity must be justified in the DPIA, not assumed |
| **s.31(1)** | Where the data subject is a **child** or lacks legal capacity, the controller **shall obtain the consent of the parent or legal guardian** | The admission form must record guardian consent, not merely a typed name |
| **s.31(2)–(3)** | The controller **shall apply appropriate mechanisms to verify age and consent**, taking available technology into account; government-issued ID is named as an appropriate mechanism | A consent checkbox alone is **not** obviously sufficient. The verification mechanism is an open product decision (§13.3) |
| **Part VIII** | Cross-border transfers of personal data are governed separately | **Every component is hosted outside Nigeria** — Vercel, Render, Atlas and Cloudflare. The transfer basis must be established, not assumed |
| **Breach notification** | Breach notification duties apply, with the Commission empowered to require notification to affected data subjects | A breach runbook is required before Stage 2. The NDPC's GAID sets a **72-hour** notification window per secondary sources — **confirm in the GAID text** |

### 13.2 Registration — likely required

The NDPC's **General Application and Implementation Directive 2025** (GAID, 20 March 2025,
superseding the NDPR 2019) introduces a risk-based tiering of "data controllers of major
importance". Per a Nigerian law firm's analysis of GAID arts. 9(2)–(3) and Schedule 7:

> **Ordinary-High Level (OHL)** includes **primary and secondary schools** … required to
> **renew their registration with the NDPC annually**, but need not file an annual Compliance
> Audit Report.

**Chosen School is named in that category.** On that reading, the school must register with the
NDPC and renew annually. **[LEGAL]** This comes from a secondary source; the GAID text itself
should be read by counsel, and the school — not the developer — is the data controller and the
party that registers.

### 13.3 Decisions this raises, which are not mine to make

| # | Decision | Owner |
|---|---|---|
| L-01 | Whether to register with the NDPC, and who acts for the school | School, with counsel |
| L-02 | Whether a DPIA is required (strongly indicated) and who conducts it | School, with counsel |
| L-03 | Lawful basis for processing each field — consent, or another ground | School, with counsel |
| L-04 | How age and consent are verified under s.31(2)–(3): guardian attestation, ID upload, or another mechanism | School, with counsel |
| L-05 | Cross-border transfer basis for US/EU-hosted infrastructure | School, with counsel |
| L-06 | Written processor terms with Vercel, Render, Cloudflare, MongoDB | School, with counsel |
| L-07 | Retention periods and permanent-deletion policy | School |
| L-08 | Privacy notice and consent wording | School, with counsel |
| L-09 | Whether religion, ethnicity and state of origin are necessary at all | School |
| L-10 | Breach notification procedure and who is responsible | School |

**I will not invent retention periods or deletion rules on the school's behalf.** The system will
support whatever the school decides; it will not embed a guess.

### 13.4 What the architecture can and cannot do

| The system can | The system cannot |
|---|---|
| Restrict access to the administrator | Establish a lawful basis |
| Encrypt in transit and at rest (provider-managed) | Decide whether consent is valid |
| Strip metadata from photographs | Determine whether a transfer is lawful |
| Record consent and its timestamp | Verify that the consenting adult is the guardian |
| Log access and deletion | Prove compliance to a regulator |
| Delete on request, on a defined rule | Define that rule |

**Technical safeguards are not compliance.** A system can be well built and still unlawful, and
the reverse. The two are separate reviews and both are needed before Stage 2.

---

## 14. Infrastructure-specific assessment

### 14.1 React + Vite + TypeScript on Vercel

- **Bundle is public.** Everything shipped is readable. Only `VITE_` variables are inlined, and
  none may be secret. The API base path is the only client configuration.
- **No secrets in the frontend, ever.** A key placed in a `VITE_` variable is published the
  moment it is deployed, and indexed by anyone watching.
- **Source maps:** disable public source maps in production, or accept that the client code is
  fully readable. Client code is not a secret, but source maps make endpoint discovery trivial.
- **Third-party scripts:** none planned. The YouTube embed is click-to-load via
  `youtube-nocookie.com`, so no third-party script runs until a visitor asks for it.
- **Dependency risk:** Vite and the React toolchain are build-time; the shipped bundle contains
  no server-side dependency.

### 14.2 Node.js + Express + TypeScript on Render

- **Express provides very little by default.** No CSRF, no security headers, no rate limiting,
  no input validation out of the box. Every control in §6–§10 is code we write and must test. This
  is the main security cost of choosing Express over a batteries-included framework.
- **Process may be replaced at any time.** No in-memory state: sessions and rate-limit counters
  live in Atlas.
- **Ephemeral filesystem.** Nothing permanent may be written to disk. A bug that writes uploads
  locally would appear to work and then silently lose files on the next restart.
- **Security headers** must be set explicitly: HSTS, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy`, `X-Frame-Options: DENY`, and a Content-Security-Policy that permits only the
  origins actually used.
- **Error handling** must not leak stack traces, query text, or connection strings in production.

### 14.3 MongoDB Atlas with Mongoose

- **No referential integrity.** A delete does not cascade. Orphaned photos and stale references
  are a correctness and privacy problem — a "deleted" record's photo could remain readable if the
  object delete fails. The delete order in `DATA_MODEL.md` §4.6 exists for this reason.
- **Broad network access is forced.** Render free has no static egress IP, so the Atlas allowlist
  must be wide. Protection therefore rests entirely on a strong generated password, SCRAM and
  TLS. **This is a real weakness of the free combination and belongs in the Stage 2 review.**
- **Free tier has no SLA and is documented as being for learning.** Availability is not
  guaranteed by anyone.
- **Pauses after 30 days of inactivity.** Data is retained; connections are refused; resumption
  is manual. Nothing in the application can recover from this automatically.
- **Mongoose `find()` returns whole documents.** Every list endpoint must use an explicit
  projection, or a newly added sensitive field is exposed by default.

### 14.4 Cloudflare R2

- **Private bucket must have no public URL.** Not a signed URL, not a `r2.dev` subdomain — no
  public access configuration at all.
- **Separate buckets, not prefixes.** A prefix is a naming convention; a bucket is an access
  boundary. The application token cannot reach the backup bucket.
- **Public bucket is world-readable by design.** Anything placed there is public permanently.
  This is why publication is a separate, explicit administrator action.
- **No egress fees** removes a denial-of-service cost vector — a large download cannot run up a
  bill — which is a genuine security benefit of this choice.

### 14.5 Vercel rewrite proxy and Render cold start

- **The proxy hides the API origin** from the browser, which reduces casual discovery and removes
  the need for CORS. It does not provide authentication or authorization.
- **Client IP handling is a security control, not a tuning detail.** If `TRUST_PROXY_HOPS` is
  wrong, rate limiting either collapses to a single shared key (protection effectively off) or
  becomes forgeable. **[VERIFY]** TEST_PLAN T3.
- **Cold start creates an ambiguity risk.** A request that times out at the proxy may have
  reached the API and been saved. The client must never treat a timeout as success, and must offer
  a safe retry rather than assuming failure. A duplicate submission is acceptable by design; a
  false success is not.

### 14.6 Sessions, cookies, hashing, timeouts

- Session design, cookie attributes, Argon2id and the 12h/60m limits are assessed in §6. All are
  sound **provided T1 passes**. In Safari, if the rewrite fails and the cookie becomes
  third-party, admin login breaks — and the tempting "fix" of dropping `Secure` or using
  `SameSite=None` with a loose CORS policy would be a genuine security regression.

---

## 15. Dependency and supply-chain risk

| Risk | Control | Status |
|---|---|---|
| Compromised npm package | Lockfile committed; `npm ci` in builds; review before adding a dependency; prefer fewer | [APPROVED] |
| Typosquatting | Add dependencies by exact name from official docs, never from a search result | [APPROVED] |
| Post-install scripts | Disable install scripts where feasible; review any package that requires them | [APPROVED] |
| Stale dependencies | `npm audit` on a schedule; not on every build, to avoid breaking on a non-exploitable advisory | [APPROVED] |
| Provider supply chain | Out of our control. Accepted for Vercel, Render, Atlas, Cloudflare | Accepted risk |
| Native build failure (Argon2, sharp) | Pin versions; verify the Render build succeeds before relying on it | [VERIFY] |

The dependency surface should stay small. Every package is code that runs with the application's
privileges and, in the API, potentially with access to children's records.

---

## 16. Security assumptions requiring verification

These are designs, not facts. Each needs a real test on the real deployment.

| # | Assumption | If wrong |
|---|---|---|
| A-01 | The Vercel rewrite yields same-origin cookies accepted by Safari | Authentication design fails; fallback is a security regression |
| A-02 | The proxy survives a ~60 s cold start, or fails visibly | Requests may hang or return ambiguous errors |
| A-03 | Client IP survives the proxy chain | Rate limiting is ineffective or forgeable |
| A-04 | `Set-Cookie` is forwarded through the rewrite | Login silently does not persist |
| A-05 | The private R2 bucket is genuinely unreachable publicly | Photographs of children are exposed |
| A-06 | `sharp` and Argon2 native builds succeed on Render | Uploads or login fail in production only |
| A-07 | Atlas accepts the connection from Render's dynamic egress | The API cannot reach its database |
| A-08 | A restore from backup actually reconstructs a working system | The recovery plan is fiction |

Each maps to a numbered check in `INTEGRATIONS.md` §7 and `TEST_PLAN.md` §7.

---

## 17. Stage 1 — demonstration

The demonstration environment still requires **every** control in §6–§12 except those that only
matter for real data. Security theatre in Stage 1 is how Stage 2 launches with untested controls.

**Required in Stage 1:**

- Authentication, sessions, CSRF, origin checks, rate limiting — all active.
- Authorization on every admin route, tested.
- Private/public bucket separation, tested with a real unauthenticated request.
- File upload validation, tested with malformed inputs.
- No secrets in the repository or bundle.
- Backups running, with **one completed restore drill**.
- Deployed-domain tests T1–T4 passed.

**Required in Stage 1 that people skip:**

- **Synthetic data only.** No real child's name, photograph, address or health note — including
  in screenshots, in demos to the school, or in a "quick test" that is never cleaned up.
- The admission form is disabled or explicitly labelled a demonstration.
- Sample photographs are licensed stock or school-approved, and tracked for replacement.

**What Stage 1 does not prove:** that the system is safe for real data. Passing every Stage 1
test means the controls work; it says nothing about lawful basis, retention, consent validity, or
whether the school has registered with the NDPC.

## 18. Stage 2 — production

All of Stage 1, plus the SG-01 to SG-12 gates in `PRD.md` §4.4, plus:

| # | Requirement | Owner |
|---|---|---|
| S2-01 | DPIA completed before processing (NDPA s.28) | School + counsel |
| S2-02 | NDPC registration current (GAID OHL tier) | School |
| S2-03 | Written processor terms with all four providers (s.29) | School + counsel |
| S2-04 | Cross-border transfer basis documented (Part VIII) | School + counsel |
| S2-05 | Consent and age-verification mechanism decided and implemented (s.31) | School + counsel |
| S2-06 | Retention and deletion policy approved and implemented | School |
| S2-07 | Privacy notice published | School + counsel |
| S2-08 | Breach notification procedure written, with named responsibility | School |
| S2-09 | MFA on all provider accounts | Developer |
| S2-10 | Atlas network exposure reviewed and accepted in writing | Developer + school |
| S2-11 | Full authorization review: every admin route enumerated | Developer |
| S2-12 | Restore drill performed within the last 30 days | Developer |

**Infrastructure limitations that may make the free tier unsuitable for Stage 2** — stated plainly:

1. **No SLA anywhere.** No component promises availability.
2. **Atlas free is documented as being for learning**, not production, and has no backups.
3. **Broad Atlas network exposure** is forced by Render's dynamic egress.
4. **Vercel Hobby may not permit this use at all** (SG-01).
5. **Render free is documented as not for production.**
6. **0.5 GB database ceiling** and a 32 MB in-memory sort limit.

Any one of these might be acceptable to the school with informed consent; together they are a
conversation the school should have before real children's data is entered, not after.

---

## 19. Verification tasks

| ID | Task | Blocking for |
|---|---|---|
| SEC-01 | T1: first-party cookie in Safari and Chrome on real domains | Stage 1 |
| SEC-02 | T3: rate limiting keyed on the real client IP | Stage 1 |
| SEC-03 | F-10/F-11: private bucket unreachable unauthenticated | Stage 1 |
| SEC-04 | F-01/F-04: polyglot and SVG uploads rejected | Stage 1 |
| SEC-05 | API-A01–A06: authorization on every admin route | Stage 1 |
| SEC-06 | No secret in bundle or repository (grep the built output) | Stage 1 |
| SEC-07 | Boot refuses to start on missing configuration | Stage 1 |
| SEC-08 | Restore drill completed and timed | Stage 1 |
| SEC-09 | Health endpoint leaks nothing | Stage 1 |
| SEC-10 | Security headers present in production responses | Stage 1 |
| SEC-11 | DPIA completed | Stage 2 |
| SEC-12 | NDPC registration confirmed | Stage 2 |
| SEC-13 | Processor agreements in place | Stage 2 |
| SEC-14 | Consent and age-verification mechanism implemented | Stage 2 |

**None of these has been run.**

---

## 20. Approval status summary

| Category | Items |
|---|---|
| **Approved 24 October 2026** | Every control in §6–§12, including those previously listed as proposals: router-level auth middleware; immutable-field rejection; strict key stripping; boot-time config validation; startup logging of names only; MFA on provider accounts; lockfile + `npm ci`; dependency review policy; public source maps disabled; explicit security header set; session revocation on password change |
| **Requires technical verification** | A-01 to A-08; SEC-01 to SEC-14. Approval of a design is not evidence that it behaves as designed |
| **Requires qualified legal review** | L-01 to L-10; DPIA; NDPC registration; processor terms; cross-border basis; age and consent verification |
| **Requires the school's decision** | Retention periods; whether religion, ethnicity and state of origin are collected at all; Atlas tier acceptance; privacy notice wording |

### 20.1 Approval record

**Approved by:** project owner, 24 October 2026. Recorded as ADR-029.

Approval covers the technical controls specified in this document. It does **not**:

- verify any control — SEC-01 to SEC-14 remain unrun, and none of the assumptions A-01 to A-08 has
  been tested;
- discharge any legal obligation — L-01 to L-10 remain open and require the school and qualified
  counsel, not the developer;
- establish that the system is safe for real children's data — that is the Stage 2 gate set in §18.
