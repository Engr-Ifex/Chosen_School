# Chosen School Website — Test Plan

**Document status:** Approved
**Version:** 1.0
**Date:** 24 October 2026
**Approved by:** project owner, 24 October 2026
**Baseline:** `PRD.md`, `DESIGN.md`, `ARCHITECTURE.md`, `DATA_MODEL.md`, `API_SPEC.md`

> This document defines what must be proven, and what counts as proof. Tests exist for the slices
> completed so far — S01 covers configuration validation, the error envelope and the health
> contract. Everything else is unwritten. A test that passes because it asserts nothing is worse
> than no test, because it buys false confidence.

---

## 1. Scope and limits

**What this plan covers:** correctness of the API contract, enforcement of authorization,
behaviour of the deployed system on the real provider domains, and recovery from data loss.

**What it cannot prove:** that the site is legally compliant, that the school's content is
accurate, or that a free-tier provider will keep its current terms. Those are review items, not
test cases, and are tracked in `ARCHITECTURE.md` §15.

**Test levels**

| Level | Tool | Runs |
|---|---|---|
| Unit | Vitest | Every commit |
| API integration | Vitest + Supertest + `mongodb-memory-server` | Every commit |
| Frontend component | Vitest + React Testing Library | Every commit |
| End-to-end | Playwright | Every commit against a preview, and before every release |
| Deployed-domain | Manual + Playwright against real Vercel/Render hosts | **Before Stage 1**, and after any hosting change |
| Recovery drill | Manual, documented | Before launch, quarterly |

`mongodb-memory-server` is a real `mongod`, so indexes, validators and TTL behaviour are
genuine. It is not Atlas, so Atlas-specific behaviour (pausing, connection limits) must be
tested separately on the real cluster.

**Database-dependent tests are opt-in.** `server/src/db.integration.test.ts` needs a `mongod`
binary and is skipped unless `RUN_DB_TESTS=1` is set:/n/n```bash
RUN_DB_TESTS=1 npm test --workspace server
```

**CI must set that flag.** Without it, the only test that proves the health endpoint against a real
database silently stops running, and a green build means less than it appears to.

---

## 2. Unit tests

| Area | Cases |
|---|---|
| Validation schemas (Zod) | Each field: valid, boundary, over-length, wrong type, missing required, unknown key stripped |
| Phone normalisation | Local formats, spaces, dashes, leading `+234`, leading `0`, too short, too long |
| Class/session validation | Class in wrong section rejected; unknown class rejected; valid pair accepted |
| Password hashing | Hash verifies; wrong password fails; parameters recorded with the hash; hashes differ across runs for the same input (salt) |
| Session token | Raw token never equals stored hash; constant-time compare used |
| Origin/CSRF middleware | Matching origin passes; mismatched origin rejected; missing token rejected; wrong token rejected |
| Sanitiser | Script tags, event handlers, `javascript:` links, and `iframe` removed from announcement body; allowed tags preserved |
| YouTube id extraction | `youtu.be`, `watch?v=`, `m.`, `embed/`, with tracking params; non-YouTube host rejected; malformed id rejected |
| Revision diffing | Only changed paths recorded; no-op edit produces no revision; array bounded at 50 |
| PDF builder | Renders a known fixture; page count correct; health section present in single, absent in bulk |

**Pass condition:** all cases pass, and coverage of `server/src/lib` and `server/src/services` is
**≥ 80% lines**. Coverage is a floor for finding untested code, not a quality claim.

---

## 3. API integration tests

Each test runs against an in-memory MongoDB with the real Express app.

### 3.1 Public endpoints

| ID | Case | Expected |
|---|---|---|
| API-P01 | `GET /health` with database reachable | `200 {status:"ok"}` |
| API-P02 | `GET /health` with database unreachable | `503`, no host, database name, or error detail in body |
| API-P03 | `GET /public/announcements` with draft, published, expired | Only published and non-expired returned |
| API-P04 | `GET /public/events` ordering | Ascending by `event.startDate`; past events excluded |
| API-P05 | `GET /public/gallery` | Only `isPublic: true` returned; unpublished absent |
| API-P06 | `GET /public/testimonials` with approved-but-unpublished | **Excluded** |
| API-P07 | `POST /public/applications` valid, no photo | `201`, document persisted, `signedAt` server-set |
| API-P08 | Same, client supplies `submittedAt` and `deletedAt` | Fields ignored; server values win |
| API-P09 | `POST /public/applications` with class from the other section | `422`, field error on `placement.classApplyingFor` |
| API-P10 | `POST /public/applications` with unknown academic session | `422` |
| API-P11 | `POST /public/applications` missing each required field, one at a time | `422` for each, with the correct field path |
| API-P12 | `POST /public/testimonials` with `consentGiven: false` | `422`; no document created |
| API-P13 | `POST /public/visit-requests` with `preferredTime: "3pm"` | `422` |
| API-P14 | Response body of a public POST | Contains `id` only — no personal data echoed |
| API-P15 | Two identical applications submitted | Both stored (duplicates are accepted by design) |
| API-P16 | `GET /public/pages/about` | Returns the complete fixed key set in the defined order; an unsupplied section is present with an empty `body`, not omitted |
| API-P17 | `GET /public/pages/nonsense` | `404` |

### 3.2 Admin endpoints

| ID | Case | Expected |
|---|---|---|
| API-A01 | Any `/admin/*` route without a cookie | `401 UNAUTHENTICATED` |
| API-A02 | Any `/admin/*` route with an expired session | `401 SESSION_EXPIRED` |
| API-A03 | Any `/admin/*` route with a revoked session | `401` |
| API-A04 | `POST` without `X-CSRF-Token` | `403 FORBIDDEN` |
| API-A05 | `POST` with a token from a different session | `403` |
| API-A06 | `GET /admin/applications` list projection | `healthInformation` **absent** from every item |
| API-A07 | `GET /admin/applications?q=` name prefix | Matching records returned |
| API-A08 | `GET /admin/applications?q=` phone digits | Exact match returned |
| API-A09 | `?sort=__v` (not whitelisted) | `422`, not a silent default |
| API-A10 | `?pageSize=500` | `422` (max 100) |
| API-A11 | `PATCH` attempting to set `submittedAt` | `422` |
| API-A12 | `PATCH` changing one field | Revision appended with correct `changedFields` |
| API-A13 | `PATCH` with no actual change | `200`, no revision written |
| API-A14 | `DELETE` (trash) then `GET` list | Record absent from list, present in `/admin/trash` |
| API-A15 | `POST /:id/restore` | Record back in list, original `submittedAt` intact |
| API-A16 | `DELETE /:id/permanent` with wrong `confirm` value | `422`; record still present |
| API-A17 | `DELETE /:id/permanent` correct | Document gone, photo object gone, audit entry written |
| API-A18 | Permanent delete when the photo object delete fails | `500`; **record still present** |
| API-A19 | `POST /admin/announcements` with `status: "published"` | `422`; created as draft only |
| API-A20 | `POST /:id/publish` twice | Second returns `409` |
| API-A21 | `kind: "event"` without `event` block | `422` |
| API-A22 | `event.endDate` before `startDate` | `422` |
| API-A23 | `POST /testimonials/:id/publish` while `pending` | `409 CONFLICT` |
| API-A24 | `GET /admin/gallery` includes unpublished | Present in admin, absent in public |
| API-A25 | `DELETE /admin/categories/:id` in use | `409` with usage count |
| API-A26 | Bulk PDF with 51 ids | `422`; no partial PDF generated |
| API-A27 | Bulk PDF with one unknown id | `404`; no partial PDF |
| API-A28 | `PATCH /admin/settings` removing all primary classes | `422` |
| API-A29 | `PATCH /admin/pages/about` with an unknown section key | `422`, not ignored |
| API-A30 | `PATCH /admin/pages/about` whose result would drop a required key | `422`; stored document unchanged |
| API-A31 | `PATCH /admin/pages/about` with a `<script>` in the body | Tag stripped before storage; the saved body contains no script |
| API-A32 | `PATCH /admin/pages/about` with no session | `401` |

**Pass condition:** every row passes. Rows A01–A06, A16–A18 and A23 are release-blocking
individually — each corresponds to a privacy or integrity failure, not a cosmetic one.

---

## 4. Database and model tests

| ID | Case | Expected |
|---|---|---|
| DB-01 | `admins.email` duplicate insert | Unique index error |
| DB-02 | `sessions.tokenHash` duplicate | Unique index error |
| DB-03 | `categories` same slug, different scope | Both allowed |
| DB-04 | `categories` same slug, same scope | Rejected |
| DB-05 | `settings` second document with `key: 'site'` | Rejected |
| DB-06 | Session `expiresAt` in the past | Removed by TTL; **and** rejected by the application before TTL runs |
| DB-07 | Application saved without `search` fields set manually | `search.studentName` and `search.guardianPhone` populated by the hook |
| DB-08 | Application list query sort plan | `explain()` shows an index scan, **no** `SORT` stage |
| DB-09 | 2,000 synthetic applications, default list query | Completes < 500 ms; no 32 MB sort error |
| DB-10 | Document with 50 revisions | Under 1 MB; further edits drop the oldest |
| DB-11 | `healthInformation` at 1001 characters | Rejected |
| DB-12 | `event` block present on `kind: "announcement"` | Rejected |

**Pass condition:** all pass. DB-08 and DB-09 are the guard against the Atlas Free 32 MB
in-memory sort limit, which fails at runtime rather than at build time.

---

## 5. Frontend tests

| Area | Cases |
|---|---|
| Admission form | Required-field errors render beside fields; error summary lists all; entered data survives a failed submit; submit disabled while in flight |
| Success state | Exact string *"Your admission application has been submitted successfully."* appears **only** after a `201` |
| Failure state | On `500`/timeout, no success message; retry offered; data retained |
| Section → class | Choosing Primary populates only Primary classes |
| Admin guard | Unauthenticated visit to `/admin/*` redirects to sign-in; a `401` mid-session returns to sign-in without losing the current URL |
| Session expiry | `401 SESSION_EXPIRED` shows the re-authentication state, not a blank page |
| Unsaved changes | Navigating away from a dirty editor prompts for confirmation |
| Destructive dialogs | Permanent delete requires typing/confirming; Trash and permanent delete are visually distinct |
| Empty and error states | Every list has empty, no-results, loading and error states per `DESIGN.md` §9.2 |
| Accessibility | Axe scan on every page: **zero** serious or critical violations |
| Keyboard | Tabs, accordion, gallery viewer, dialogs fully operable; focus trapped in dialogs and restored on close |

---

## 6. End-to-end tests (Playwright)

| ID | Flow | Expected |
|---|---|---|
| E2E-01 | Visitor browses Home → About → Primary → Admissions | No console errors; layout intact at 375 px and 1440 px |
| E2E-02 | Submit a valid application | Success message; record appears in the admin list |
| E2E-03 | Submit with errors, then correct | Errors shown; correction succeeds without re-entering other fields |
| E2E-04 | Admin signs in, views application, edits, saves | Change persisted; revision recorded; UI shows saved state |
| E2E-05 | Admin exports single PDF | Valid PDF downloads; contains the applicant's name |
| E2E-06 | Admin selects 3 records, bulk export | One PDF with 3 records |
| E2E-07 | Move to Trash → restore | Record returns with original date |
| E2E-08 | Permanent delete with confirmation | Record gone; not recoverable; audit entry exists |
| E2E-09 | Create draft → publish → view publicly | Visible publicly only after publish |
| E2E-10 | Publish announcement with expiry in the past | Not visible publicly |
| E2E-11 | Upload gallery image → publish | Visible publicly only after publish |
| E2E-12 | Submit testimonial → approve → publish | Public only after both steps |
| E2E-13 | Sign out, then press Back | Admin pages not reachable from cache |
| E2E-14 | Mobile viewport, admin tables | Record-card layout usable; no horizontal clipping of controls |

---

## 7. Deployed-domain tests — the highest-risk area

**T1 is the test that decides whether the proposed authentication design works at all.** It must
run against the real Vercel and Render hosts, not localhost, because the failure mode exists only
in the real domain layout.

### T1 — Session cookie across the real domains

1. Deploy `client/` to Vercel and `server/` to Render, with the `/api/*` rewrite configured.
2. Open the site at the Vercel URL. Sign in.
3. In DevTools → Application → Cookies, confirm:
   - the cookie is attributed to the **Vercel** origin, not the Render host;
   - `HttpOnly` ✔, `Secure` ✔, `SameSite=Lax`, `Path=/`;
   - no `Domain` attribute.
4. Call an authenticated admin endpoint. Confirm `200`.
5. **Safari (desktop) and Safari on iOS:** repeat steps 2–4.

**Pass condition:** the cookie is first-party on the Vercel origin and admin authentication
succeeds in Safari and iOS Safari. Anything less means the rewrite is not doing its job and the
design must fall back to `SameSite=None` with a documented Safari limitation (ARCHITECTURE §5.4).

### T2 — Cold start through the proxy

1. Leave the Render service idle for 20 minutes so it spins down.
2. Request an admin page that triggers an API call.

**Pass condition:** the request eventually succeeds, **or** it fails with a clear, user-facing
retry state. A silent 504, an infinite spinner, or a success message without a persisted record
is a failure. Record the measured latency — this number determines whether a keep-alive is
necessary.

### T3 — Client IP and rate limiting behind the proxy

1. Send 6 failed logins from one client.
2. Confirm the 6th returns `429`.
3. Confirm the rate-limit record shows the **visitor's** IP, not a Vercel egress address.
4. Confirm a different client is not throttled.

**Pass condition:** limits apply per real client. If all traffic shares one key, brute-force
protection is effectively disabled and this is a release blocker.

### T4 — CORS absence

**Pass condition:** no `Access-Control-Allow-Origin` header is needed for the app to work. If the
frontend cannot function without CORS, the rewrite is not in effect.

### T5 — Atlas behaviour

1. Connect from Render and confirm TLS and SCRAM authentication are required.
2. Confirm a wrong password is rejected.
3. Confirm the application returns a clean `503` — not a stack trace — when the cluster is
   unreachable.

---

## 8. File upload security

| ID | Case | Expected |
|---|---|---|
| F-01 | `.jpg` extension containing a ZIP | Rejected `415` (magic bytes checked) |
| F-02 | Real JPEG renamed `.png` | Accepted (content is what matters) |
| F-03 | 6 MB image | `413` |
| F-04 | SVG containing `<script>` | Rejected `415` |
| F-05 | Animated GIF | Rejected |
| F-06 | JPEG with GPS EXIF | Stored output has **no** EXIF, no GPS |
| F-07 | 8000×8000 image | Downscaled to ≤1600 px long edge |
| F-08 | Filename `../../etc/passwd.jpg` | Stored under a generated UUID; original name discarded |
| F-09 | Two uploads with the same filename | Two distinct objects, no overwrite |
| F-10 | Unauthenticated `GET` of a private photo path | `401` |
| F-11 | Unauthenticated fetch of a private object via the public URL form | `400`/`403`/`404` — never the file |
| F-12 | Private photo URL constructed from the public gallery pattern | Refused; the two buckets are separate and only one is public |
| F-13 | Gallery image unpublished | Object still exists but is not returned publicly |
| F-14 | Admission photo after permanent delete | Object removed from Supabase Storage |

**Pass condition:** all pass. F-01, F-06, F-10, F-11 and F-14 are individually release-blocking.

---

## 9. Search, filtering, sorting, export

Covered by API-A07–A10 and DB-08/09, plus:

| ID | Case | Expected |
|---|---|---|
| S-01 | Filter by section + class + session together | Correct subset; `meta.total` matches |
| S-02 | Search matching nothing | `200` with empty `data`, not `404` |
| S-03 | Sort by surname ascending/descending | Correct order; stable across pages |
| S-04 | Page 2 of 3 with a filter | No duplicates or omissions across pages |
| S-05 | PDF for a record with no photo | Renders without a broken image |
| S-06 | PDF with a very long health note | Text wraps; no overflow off the page |

---

## 10. Backup and restoration

This is the only test whose failure is unrecoverable, so it is performed, timed, and written
down.

**Drill procedure**

1. Record current record counts per collection and checksums of three sample photos.
2. Run the backup exactly as the scheduled job does.
3. Confirm the encrypted archive exists at the destination, and that its size is plausible.
4. **Restore into a scratch Atlas cluster** using only the documented runbook — no undocumented
   steps, no help from memory.
5. Verify counts match and the three photo checksums match.
6. Destroy the scratch cluster.
7. Record the elapsed time and every step that was unclear.

**Pass condition:** the restore completes from the runbook alone, counts and checksums match, and
the elapsed time is known. If the runbook needed a step that was not written down, the runbook
is the defect and must be fixed before the drill counts as passed.

| ID | Case | Expected |
|---|---|---|
| B-01 | Backup job with the encryption key absent | Fails loudly; never uploads plaintext |
| B-02 | Restore from a 3-day-old archive | Data as of that date; no corruption |
| B-03 | Atlas cluster paused | API returns `503`; data intact after manual resume |
| B-04 | Render instance replaced mid-day | New instance serves normally; no data loss (nothing permanent lived on disk) |
| B-05 | Restore of a photo referenced by an application | Photo streams correctly after restore |

---

## 11. Accessibility and responsive

Per `DESIGN.md` §7 and §8.

| Check | Pass condition |
|---|---|
| Automated scan (axe) | Zero serious or critical issues on every page and admin screen |
| Keyboard-only | Every interactive element reachable and operable; focus always visible |
| Zoom to 200% | No loss of content or function |
| Contrast | Meets WCAG AA for text and UI components |
| Screen reader spot check | Form errors announced; dialog open/close announced; table headers associated |
| Mobile 375 px | Forms single-column; admin tables become cards; no horizontal page scroll |
| Tablet 768 px | Layouts remain readable; no overlapping controls |
| Reduced motion | Animations suppressed |

**Not claimed:** full WCAG conformance. The plan targets AA and records residual issues rather
than declaring compliance.

---

## 12. Deployment and operational checks

Identifiers use the `DEP-` prefix. (`D-nn` in `ROADMAP.md` §10 means a *decision*, not a check —
the two must not be confused.)

| ID | Check | Pass condition |
|---|---|---|
| DEP-01 | Secrets in repository | None. `grep` for keys, URIs and passwords returns nothing |
| DEP-02 | `.env` ignored | Present in `.gitignore`; only `.env.example` committed |
| DEP-03 | Production build | `vite build` and `tsc` complete with no errors |
| DEP-04 | Error responses in production | No stack traces, no internal paths, no query text |
| DEP-05 | Logs | No passwords, tokens, health information, or request bodies |
| DEP-06 | Security headers | HSTS, `X-Content-Type-Options`, `Referrer-Policy`, a CSP that permits only required origins |
| DEP-07 | HTTPS | HTTP redirects to HTTPS; no mixed content |
| DEP-08 | `robots.txt` | Admin paths disallowed; no personal data in any crawlable path |
| DEP-09 | Health endpoint | Responds correctly; leaks nothing |
| DEP-10 | Uptime monitor | Configured against `/api/v1/health`; an intentional outage produces an alert |

---

## 13. Stage 1 acceptance — demonstration

The site may be shown to the school when **all** of the following hold:

1. T1, T2, T3 pass on the real domains.
2. Section 8 (file upload security) passes.
3. B-01 through B-05 pass, including one completed restore drill.
4. E2E-01, E2E-02, E2E-04, E2E-09, E2E-11 pass.
5. Accessibility scan clean; mobile and tablet layouts verified.
6. **No real child or parent data has been entered at any point**, including during testing.
7. Admission submission is either disabled or explicitly labelled a demonstration.
8. All content is sample or school-approved; no placeholder is presented as fact.
9. The school has been told in writing what Stage 1 does and does not do.

## 14. Stage 2 production-readiness — real applications

Everything in Stage 1, **plus**:

1. Vercel eligibility confirmed in writing, or hosting changed.
2. Atlas tier decision recorded and accepted by the school in writing.
3. Retention and deletion policy approved and implemented.
4. Privacy notice and consent wording approved and published.
5. Nigerian data-protection review completed with actions closed.
6. Authorization review: every `/admin` route enumerated and confirmed protected.
7. Rate limiting verified against real client IPs.
8. Backup retention approved; restore drill repeated within the last 30 days.
9. Incident runbook written: what to do if Atlas pauses, if Render is unavailable, if a
   credential is compromised.
10. Accessibility residual issues documented.

**Until every item is closed, the admission form must not accept real applications.** A form
that works is not the same as a system that is safe to use.

---

## 15. Requirement traceability

| Requirement | Covered by |
|---|---|
| FR-001–FR-006 public pages | E2E-01, §11 |
| FR-007–FR-013 admissions | API-P07–P15, E2E-02/03, §5 |
| FR-014–FR-016 authentication | API-A01–A05, T1, §5 |
| FR-017–FR-022 application admin | API-A06–A18, DB-07–DB-10, S-01–S-06 |
| FR-023–FR-025 enquiries and visits | API-P13, §3.2, E2E-04 |
| FR-026–FR-029 announcements and events | API-P03/P04, API-A19–A22, E2E-09/10 |
| FR-030–FR-031 gallery | API-P05, API-A24, F-01–F-14, E2E-11 |
| FR-032–FR-033 testimonials | API-P06/P12, API-A23, E2E-12 |
| FR-034–FR-035 contact and settings | API-A28, E2E-01 |
| FR-036–FR-038 private data, abuse, accessibility | §7, §8, §11 |
| FR-039–FR-042 operations and recovery | §10, §12 |
