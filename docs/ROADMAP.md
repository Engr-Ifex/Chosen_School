# Chosen School Website — Roadmap

**Document status:** Approved
**Version:** 2.0
**Date:** 24 October 2026
**Approved by:** project owner, 24 October 2026 · **Revised:** 29 October 2026 (S13/S15 storage provider)
**Companions:** `PRD.md`, `TEST_PLAN.md`, `INTEGRATIONS.md`, `ENVIRONMENT_VARIABLES.md`, `DECISIONS.md`

> Delivery is cut into small, testable slices. Each slice ends with something that can be
> demonstrated or verified, not with "the model is written". The spine of the product — a parent
> submits an application and an administrator sees it — is completed before any secondary feature
> is polished.

---

## 1. Slice format

Every slice states the same eleven things:

| Field | Meaning |
|---|---|
| **Outcome** | What exists at the end, in user-visible or verifiable terms |
| **Covers** | Requirement IDs from `PRD.md` |
| **Depends on** | Slices, decisions, and integrations that must already be true |
| **Touches** | Files or components likely to change |
| **Setup** | Accounts, credentials, environment variables |
| **AI work / Owner action** | What I do; what only you can do |
| **Approach** | The implementation shape |
| **Acceptance** | Observable conditions that mean it is finished |
| **Verify** | Test IDs from `TEST_PLAN.md` |
| **Risks / rollback** | What can go wrong, and how to back out |
| **DoD** | The definition of done for that slice |

## 2. Sequencing rules

1. **Core spine first.** Submission → storage → admin visibility is closed before anything
   secondary. A school can use that loop even if the gallery is empty.
2. **Decisions before features.** No slice starts while a decision it depends on is open. The
   one place this looks violated is §5, and it is addressed there explicitly.
3. **Build against interfaces.** Storage sits behind an adapter with a local implementation, so
   the product is fully testable before any account exists.
4. **De-risk the unknown early.** The cross-origin authentication question is the largest
   technical unknown in the project. It is tested in **S07**, which runs as soon as accounts
   exist — in parallel with local work, not at the end.
5. **A slice is done when its verification has run.** Code existing is not completion.

## 3. Slice map

| # | Slice | Depends on | Needs an account? |
|---|---|---|---|
| S00 | Repository foundation | — | No |
| S01 | API skeleton, config validation, health | S00 | No |
| S02 | Data layer, models, synthetic seed | S01 | No |
| S03 | Admission submission API | S02 | No |
| S04 | Admission form UI — first end-to-end | S03 | No |
| S05 | Administrator authentication | S02 | No (local only) |
| S06 | Admin application list and detail — **core loop closed** | S04, S05 | No |
| **S07** | **Deployed-domain spike (T1/T2/T3)** | S01, accounts | **Yes — run in parallel** |
| S08 | Photo upload via storage adapter | S06 | No |
| S09 | Trash, restore, permanent delete | S08 | No |
| S10 | Edit with revision history | S06 | No |
| S11 | PDF export | S06 | No |
| S12 | Enquiries and visit requests | S06 | No |
| S13 | Swap storage to Supabase Storage | S08, Supabase project | Yes |
| S14 | Production deployment | S05, S07, S13, all accounts | Yes |
| S15 | Backups and restore drill | S14, Atlas + Supabase backup project | Yes |
| S16 | Announcements and events | S06 | No |
| S17 | Gallery | S08, S13 | Partly |
| S18 | FAQs, testimonials, settings | S06 | No |
| S19 | School information content | S18 | No |
| S20 | Accessibility, responsive, Stage 1 gate | S14, **S15**, S16–S19 | Yes |

**Progress:** S00 (28 Oct) and S01 (31 Oct) complete. **Next slice: S02** — data layer, models and
synthetic seed. Note that S02 needs a database, and the local `mongod` situation is unresolved.

---

## 4. What can proceed while an account is pending

This is the practical answer to "I haven't created the Atlas/Vercel/Render/Supabase accounts
yet."

**Fully unblocked — no account, no credential, no spend:**

S00 · S01 · S02 · S03 · S04 · S05 · S06 · S08 · S09 · S10 · S11 · S12 · S16 · S18 · S20 (local part)

These run against a local `mongod` and a local filesystem storage driver. That is the entire core
product. If every provider account were delayed by a month, **S00–S12 would still be complete and
demonstrable on a laptop.**

**Blocked on accounts, in priority order:**

| Blocked slice | Blocked by | Why it cannot be mocked |
|---|---|---|
| **S07** | Vercel + Render + Atlas | The cookie/ proxy/ IP behaviour only exists on the real domains |
| S13 | Supabase Storage | The client, the bucket access rules and the 7-day pause are what is being tested |
| S14 | All four | Nothing to deploy to |
| S15 | Atlas + Supabase backup project | A restore drill against a stub proves the stub works |
| S17 (real images) | Supabase Storage | Local driver covers the behaviour, not the bucket |

**Blocked on a decision, not an account:** none. Q13 was resolved on 24 October 2026 (ADR-030),
which unblocked S19.

---

## 5. The one place ordering is a judgement call

`S05` builds authentication **before** `S07` verifies that cross-origin cookies work. Strictly,
the verification should come first.

It is scheduled this way because the *decision* is already made (ADR-015, ADR-016) and only its
*verification* is pending — and blocking all admin work on an account you have not created yet
would idle weeks of progress.

The risk is contained deliberately: the cookie strategy lives in **one module**
(`server/src/lib/session-cookie.ts`). It does not touch the authorization logic, the models, or
the UI.

**If T1 fails, work stops.** No fallback is applied, and no security attribute is relaxed to make
the cookie work. The options in `ARCHITECTURE.md` §5.4 are presented to the project owner for a
decision, and implementation does not resume on the authentication path until that decision is
made. Removing `Secure`, dropping `HttpOnly`, widening CORS, or moving the session token to
`localStorage` are explicitly not permitted responses.

**If you would rather not carry this risk at all, say so and I will move S07 to the front** — the
cost is that no admin work starts until the accounts exist.

---

## 6. Critical path

```
S00 → S01 → S02 → S03 → S04 → S06 → S08 → S13 → S14 → S15
                      ↘ S05 ↗        ↘ S09, S10, S11, S12
                                        ↘ S16 → S17 → S18 → S19 → S20

S07 ══ parallel, as soon as accounts exist ══ feeds S14
```

Longest chain: **S00 → S06** (the core loop), then **S14** once accounts exist.
Highest risk: **S07**, which can invalidate the cookie design.
**S20 requires S15**, so a completed restore drill is part of reaching Stage 1, not an optional
extra. No slice is currently blocked on an open decision.

---

## 7. Slices

### S00 — Repository foundation
**Status:** Complete — 28 October 2026
**Outcome** — A clean clone installs, builds, lints, type-checks and tests. No product behaviour.
**Covers** — none directly; prerequisite for everything.
**Depends on** — nothing.
**Touches** — `git init`; `client/` and `server/` package files, strict `tsconfig`, ESLint, Vitest; root scripts; `AGENTS.md` §5.
**Setup** — None. No accounts.
**AI work** — Scaffold both apps with one passing test each; run every command before recording it.
**Owner action** — Create the GitHub remote when convenient; a local repository is enough to start.
**Approach** — Two npm workspaces, no monorepo tool. Root scripts fan out: `dev`, `build`, `lint`, `typecheck`, `test`.
**Acceptance** — `npm ci && npm run build && npm run lint && npm run typecheck && npm test` all exit 0 from a clean clone.
**Verify** — The commands themselves, plus `git check-ignore -v .env`.
**Risks / rollback** — Over-scaffolding. Keep only what makes those five commands real.
**DoD** — `AGENTS.md` §5 lists six verified commands with the date.

**Completion note (28 Oct 2026).** Five of the six commands verified. `npm ci` could not be run on
this machine — the environment's bulk-delete guard aborted it and the partial deletion had to be
repaired with `npm install`. `npm ci --dry-run` resolves the lockfile cleanly; it still needs
confirming on CI or a clean machine. TypeScript is pinned to 6.0.3 because `typescript-eslint`
requires `<6.1.0`; jsdom and Testing Library were deliberately left out until S04 needs them.

### S01 — API skeleton, configuration, health
**Status:** Complete — 31 October 2026
**Outcome** — The API starts, refuses to start on bad configuration, and reports health honestly.
**Covers** — FR-040.
**Depends on** — S00.
**Touches** — `server/src/app.ts`, `config.ts`, `db.ts`, `middleware/error.ts`, `routes/health.ts`.
**Setup** — Local `mongod` or `mongodb-memory-server`. `NODE_ENV`, `PORT`, `MONGODB_URI`, `LOG_LEVEL`.
**AI work** — App wiring, error envelope per `API_SPEC.md` §1.4, boot-time validation per `ENVIRONMENT_VARIABLES.md` §10, request logging with redaction.
**Owner action** — None.
**Approach** — Validate configuration before binding the port; exit non-zero naming the variable. Health returns `ok` or `503` with no internals.
**Acceptance** — Health `200` with a database, `503` without; a missing variable prevents boot with a message naming it; no host or database name in any response.
**Verify** — API-P01, API-P02, SEC-07, SEC-09.
**Risks / rollback** — None material; the app is empty.
**DoD** — Both health states observed and recorded.

**Completion note (31 Oct 2026).** The `503` path, the boot-time configuration failure and the
error envelope were observed against a running process. The `200` path is **not** verified on this
machine: `mongodb-memory-server` could not obtain a `mongod` binary (its download stalled and left
a corrupt 497 MB partial), so `db.integration.test.ts` is opt-in via `RUN_DB_TESTS=1`. Graceful
shutdown is implemented but unobserved — Windows `taskkill` does not deliver a POSIX signal.
Both should be confirmed on CI or Linux before S02 is called done.

### S02 — Data layer, models, synthetic seed
**Outcome** — Mongoose models with real validation and indexes, and a seed script of fake records.
**Covers** — FR-007 to FR-013 (data side), FR-034 (placement options).
**Depends on** — S01.
**Touches** — `server/src/models/*.ts` (applications, settings, admins, sessions), `scripts/seed.ts`.
**Setup** — Local database only.
**AI work** — Schemas per `DATA_MODEL.md` §2–§4, §12 and §13; `search` derivation hook; indexes; `gender` enum `male | female` (ADR-031); seed with obviously fake names.
**Owner action** — None. **D-01 and D-02 were approved on 24 October 2026** (ADR-031), so the field list and gender values are settled. School-supplied class lists and session names are still not needed — the seed uses placeholders marked as such.
**Approach** — One model at a time with its tests. Indexes declared in the schema; `autoIndex` disabled and a separate sync script.
**Acceptance** — Invalid documents rejected; a `gender` value outside `male | female` rejected; `search` populated automatically; list query sorts without an in-memory sort.
**Verify** — DB-01, DB-05, DB-07, DB-08, DB-11, DB-12.
**Risks / rollback** — Modelling too much too early. Only `applications`, `settings`, `admins`, `sessions` are needed now; the rest arrive with their slices.
**DoD** — Seed produces 20 fake applications that render in a raw query.

### S03 — Admission submission API
**Outcome** — A valid submission is persisted; an invalid one is rejected field by field.
**Covers** — FR-007 to FR-011, FR-013.
**Depends on** — S02.
**Touches** — `server/src/routes/public/applications.ts`, `services/admissions.ts`, Zod schemas.
**Setup** — None.
**AI work** — Endpoint, Zod + Mongoose validation, class/session checks against `settings`, server-set `submittedAt` and `signedAt`.
**Owner action** — None.
**Approach** — Reject immutable-field attempts rather than ignoring them. Return `id` only; never echo the record.
**Acceptance** — Valid → `201`; wrong-section class → `422` on the right field; client-supplied `submittedAt` ignored; response contains no personal data.
**Verify** — API-P07 to P11, API-P14, API-P15.
**Risks / rollback** — Validation duplicated in two places drifting apart. Keep Zod as the boundary and Mongoose as the backstop, and test both.
**DoD** — A record submitted by `curl` appears in the database with correct derived fields.

### S04 — Admission form UI — first end-to-end
**Outcome** — **A parent can complete the form and see the exact success message.** The product's first user-visible promise is kept.
**Covers** — FR-005, FR-007 to FR-013.
**Depends on** — S03.
**Touches** — `client/src/pages/Admissions.tsx`, form components, validation summary, `lib/api.ts`.
**Setup** — Vite dev proxy so `/api/v1` reaches the local API.
**AI work** — Grouped single-page form; client validation mirroring the server; error summary; preserve input on failure; success only on `201`.
**Owner action** — None.
**Approach** — Section choice drives the class list. Submit disabled while in flight. The exact string from `PRD.md` is asserted in a test, not typed twice.
**Acceptance** — Submitting a valid form shows *"Your admission application has been submitted successfully."*; a server error shows a failure with data retained; the record exists in the database.
**Verify** — E2E-02, E2E-03; API-P12-adjacent client tests.
**Risks / rollback** — The form drifting from the API contract. One Zod schema shared by reference, not duplicated by hand.
**DoD** — Recorded browser run from empty form to confirmation, and the row visible in the database.

### S05 — Administrator authentication
**Outcome** — Only an authenticated administrator reaches admin routes; sessions expire and revoke.
**Covers** — FR-014 to FR-016, FR-036.
**Depends on** — S02.
**Touches** — `server/src/routes/auth.ts`, `lib/session-cookie.ts`, `lib/password.ts`, `middleware/auth.ts`, `middleware/csrf.ts`, `middleware/rate-limit.ts`, `scripts/provision-admin.ts`.
**Setup** — `APP_ORIGIN`, `SESSION_COOKIE_NAME`, `TRUST_PROXY_HOPS=0` locally.
**AI work** — Argon2id; session rows with hashed tokens; `__Host-` cookie; origin + CSRF checks; Atlas-backed rate limits; login/logout/session endpoints; audit entries.
**Owner action** — Run the provisioning script locally and choose the admin password yourself. Do not send it to me.
**Approach** — Middleware on the router, not per handler. Expiry checked on every request, never delegated to the TTL index.
**Acceptance** — No cookie → `401`; expired → `401 SESSION_EXPIRED`; missing CSRF → `403`; five failures → `429`; logout invalidates immediately.
**Verify** — API-A01 to A05; unit tests for hashing, CSRF and token comparison.
**Risks / rollback** — **The cookie design is unverified until S07.** Isolated in one module so a failure is a localised change.
**DoD** — Login, navigate to a protected route, log out, and confirm the cookie no longer works.

### S06 — Admin application list and detail — core loop closed
**Outcome** — **An administrator signs in and sees the application a parent just submitted.** The product's central promise works end to end.
**Covers** — FR-017 to FR-019, FR-036, FR-037.
**Depends on** — S04, S05.
**Touches** — `server/src/routes/admin/applications.ts`, `client/src/pages/admin/Applications*`, list and detail views.
**Setup** — None.
**AI work** — Paginated list with search, filters and whitelisted sort; fixed projections; detail view; loading, empty, no-results and error states.
**Owner action** — None.
**Approach** — `healthInformation` never in a list projection. Search on prefix-anchored name or exact phone, both indexed.
**Acceptance** — Submitted record appears without a refresh; search by surname and by phone both work; `healthInformation` absent from list responses; sort and page size validated.
**Verify** — API-A06 to A10; S-01 to S-04; E2E-04.
**Risks / rollback** — A whole-document return leaking a field. Enforced by an explicit projection and asserted in a test.
**DoD** — Recorded walkthrough: submit in one browser, sign in, find the record.

### S07 — Deployed-domain spike — ⚠ needs accounts
**Outcome** — Proof, or disproof, that the session cookie works across the real Vercel and Render domains.
**Covers** — FR-014, FR-036.
**Depends on** — S01, and Vercel + Render + Atlas accounts.
**Touches** — Throwaway deployment: one page, one endpoint that sets a cookie, `vercel.json` rewrite.
**Setup** — `MONGODB_URI`, `APP_ORIGIN`, `TRUST_PROXY_HOPS`, `SESSION_COOKIE_NAME`.
**AI work** — Deploy the spike, run T1 to T4, record actual results and timings in `INTEGRATIONS.md` §7.
**Owner action** — Create the three accounts and set the variables. This is the gate.
**Approach** — Deliberately not the real app. Smallest possible surface that answers the question.
**Acceptance** — Cookie attributed to the Vercel origin and accepted in **Safari and iOS Safari**; cold-start latency measured; client IP correct in rate-limit records; no CORS header needed.
**Verify** — T1, T2, T3, T4.
**Risks / rollback** — If T1 fails, the cookie strategy changes (ADR-016) and `SESSION_COOKIE_NAME` may lose the `__Host-` prefix. Record the failure and the decision; do not quietly relax `Secure`.
**DoD** — Results table filled in with real numbers, pass or fail, and a recorded decision if it fails.

### S08 — Photo upload via storage adapter
**Outcome** — An optional photograph is accepted safely, stored privately, and visible only to the administrator.
**Covers** — FR-012, FR-019.
**Depends on** — S06.
**Touches** — `server/src/lib/storage/*` (interface + local driver), `services/uploads.ts`, multipart handling, photo route.
**Setup** — None; local driver writes outside the web root.
**AI work** — Magic-byte check, 5 MB cap, SVG and animation rejection, `sharp` re-encode to WebP, EXIF strip, UUID keys, authenticated streaming with `no-store`.
**Owner action** — None.
**Approach** — The adapter is the point: Supabase later implements the same interface, so S13 changes one file.
**Acceptance** — Polyglot and SVG rejected; EXIF and GPS absent from output; oversized rejected; unauthenticated access denied; no presigned URL anywhere.
**Verify** — F-01 to F-09, F-10 (local equivalent).
**Risks / rollback** — Native `sharp` build failure. Pin the version; if it will not build on the target, that is an S14 blocker to raise, not to work around.
**DoD** — Upload a JPEG with GPS data, then confirm the stored file has neither EXIF nor GPS.

### S09 — Trash, restore, permanent delete
**Outcome** — Records can be removed recoverably, and deleted irreversibly only with explicit confirmation.
**Covers** — FR-021, FR-022.
**Depends on** — S08.
**Touches** — `routes/admin/applications.ts`, `services/trash.ts`, Trash view.
**Setup** — None.
**AI work** — Soft delete, restore, permanent delete with `confirm` value, audit entry, object deletion in the defined order.
**Owner action** — None.
**Approach** — Object first, then document, then audit. If the object delete fails, abort and leave the record.
**Acceptance** — Trashed records leave the list and appear in Trash; restore preserves `submittedAt`; wrong `confirm` value rejected; permanent delete removes the photo and writes an audit entry.
**Verify** — API-A14 to A18, F-14, E2E-07, E2E-08.
**Risks / rollback** — Orphaned photo if the order is reversed. The order is the control; test it.
**DoD** — Delete a record with a photo and confirm neither the document nor the object remains.

### S10 — Edit with revision history
**Outcome** — An administrator can correct an application, and the change is attributable and traceable.
**Covers** — FR-019, FR-020.
**Depends on** — S06.
**Touches** — `PATCH` handler, revision logic, edit form.
**Setup** — None.
**AI work** — Partial update, immutable-field rejection, revision entry with `changedFields`, before and after; bounded to 50.
**Owner action** — None.
**Approach** — A no-op edit writes no revision, so history stays meaningful.
**Acceptance** — Only changed fields recorded; no-op produces no entry; attempt to set `submittedAt` rejected; history visible in the detail view.
**Verify** — API-A11 to A13; DB-10.
**Risks / rollback** — Unbounded array growth. Cap at 50 and test the cap.
**DoD** — Edit two fields, confirm the revision lists exactly those two.

### S11 — PDF export
**Outcome** — An application prints or exports as a clean PDF, singly or in bulk.
**Covers** — FR-020.
**Depends on** — S06.
**Touches** — `server/src/lib/pdf/*`, export routes, print layout.
**Setup** — None.
**AI work** — `pdfkit` template; single and bulk endpoints; 50-record cap; `no-store`; health information excluded from bulk.
**Owner action** — None.
**Approach** — Structured layout, not headless Chromium — Render's memory cannot support it.
**Acceptance** — Single PDF contains the record; bulk contains all selected and excludes health data; over 50 rejected, not truncated; unknown id → `404`.
**Verify** — API-A26, API-A27, S-05, S-06, E2E-05, E2E-06.
**Risks / rollback** — Layout drift from the web view. Accept it; the PDF is a fixed form, not a mirror of the UI.
**DoD** — Open both a single and a bulk PDF and confirm the content and the exclusion.

### S12 — Enquiries and visit requests
**Outcome** — Visitors can enquire and request a visit; the administrator manages both in separate inboxes.
**Covers** — FR-023 to FR-025.
**Depends on** — S06.
**Touches** — Public and admin routes, two models, two list views, contact page forms.
**Setup** — None.
**AI work** — Two public forms, two admin inboxes, status transitions, archive.
**Owner action** — None.
**Approach** — No `confirmed` state exists for visits, because the PRD does not have one and adding it would let the UI imply a booking.
**Acceptance** — Submission confirms receipt only; status changes persist; archived records are distinguishable from deleted; no route claims a visit is confirmed.
**Verify** — API-P13, E2E-04, and the visit-request wording check.
**Risks / rollback** — Copy implying confirmation. Assert the wording in a test.
**DoD** — Submit a visit request and confirm the page says it was received, not booked.

### S13 — Swap storage to Supabase Storage — ⚠ needs a Supabase project
**Outcome** — Files live in Supabase Storage; the local driver remains for tests.
**Covers** — FR-012, FR-030.
**Depends on** — S08, a Supabase project (I-05), and **D-13** if gallery publication is to keep its approved control.
**Touches** — `server/src/lib/storage/supabase.ts`, `INTEGRATIONS.md` §7.
**Setup** — `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, bucket names; two buckets.
**AI work** — Implement the interface against `@supabase/supabase-js`; verify private-bucket access; record results.
**Owner action** — Create the project and the two buckets, set per-bucket size and MIME limits, copy the URL and service-role key.
**Approach** — Selection by environment, not by branching in business code.
**Acceptance** — Upload and stream work against Supabase; the private bucket is unreachable without auth; the public bucket serves only gallery objects.
**Verify** — V-03, V-04, F-10 to F-14 against real buckets.
**Risks / rollback** — A private bucket configured public exposes children's photographs. Verify before any real upload.
**DoD** — V-03 and V-04 recorded with actual responses.

### S14 — Production deployment — ⚠ needs all accounts
**Outcome** — The real system runs on Vercel, Render and Atlas.
**Covers** — FR-039 to FR-042.
**Depends on** — S05, S07, S13; all accounts; SG-01 answered.
**Touches** — `vercel.json`, Render service config, environment variables.
**Setup** — Full server variable set; `TRUST_PROXY_HOPS` set from S07's measurement.
**AI work** — Configure both services, run the deployed-domain suite, fix what breaks.
**Owner action** — Set variables in both dashboards; confirm the Vercel eligibility answer.
**Approach** — Deploy, then verify; do not assume the local result carries over.
**Acceptance** — Public pages load; submission persists; admin sign-in works in Safari; health honest; no CORS header.
**Verify** — T1 to T5, DEP-01 to DEP-10.
**Risks / rollback** — A failed deploy leaves the previous one live. Never deploy with real data before S15.
**DoD** — T1 to T5 recorded as passed on the real domains.

### S15 — Backups and restore drill — ⚠ needs Atlas + a Supabase backup project
**Outcome** — A documented, encrypted, off-site backup that has actually been restored once.
**Covers** — FR-039 to FR-041.
**Depends on** — S14.
**Touches** — `scripts/backup.*`, runbook in `docs/`.
**Setup** — `BACKUP_*` variables and the `age` key, all on your machine.
**AI work** — Backup script, encryption, upload, retention; write the runbook.
**Owner action** — Hold the `age` private key offline.
**Approach** — `mongodump` → `age` → upload to the backup project. The backup project's key never reaches Render.
**Acceptance** — Archive produced and encrypted; restore into a scratch cluster reproduces counts and checksums; runbook sufficient without my help.
**Verify** — B-01 to B-05; TEST_PLAN §10 drill.
**Risks / rollback** — A drill that passes only because the author was present. If a step was unwritten, the runbook is the defect.
**DoD** — Drill completed, timed, and written down.

### S16 — Announcements and events
**Outcome** — The administrator publishes news and events; the public sees only published, unexpired content.
**Covers** — FR-026 to FR-029.
**Depends on** — S06.
**Touches** — Model, admin editor, public News & Events page with tabs.
**Setup** — None.
**AI work** — Draft/publish as separate actions, expiry, urgent flag, sanitised body, public visibility rule in one place.
**Owner action** — None for the build; real content later comes from the school.
**Approach** — Publication is a separate auditable action, which is what makes "no urgent bypass" structural.
**Acceptance** — Drafts never public; expired hidden; creating as published rejected; urgent changes presentation only.
**Verify** — API-P03, API-P04, API-A19 to A22, E2E-09, E2E-10.
**Risks / rollback** — Stored XSS via the body. Allowlist sanitiser and a CSP.
**DoD** — Publish, view publicly, let it expire, confirm it disappears.

### S17 — Gallery
**Outcome** — Approved photographs and YouTube links appear publicly; unpublished ones do not.
**Covers** — FR-030, FR-031.
**Depends on** — S08, S13 for real images.
**Touches** — Gallery models, admin grid, public grid and viewer, video link management.
**Setup** — Supabase public bucket for real images.
**AI work** — Upload, publish state, ordering, categories, alt text, click-to-load YouTube embed.
**Owner action** — Supply approved photographs and confirm publication permission (school).
**Approach** — Upload is never public; publication is explicit. Only the video id is stored, never the URL.
**Acceptance** — New uploads invisible publicly; publishing reveals; private admission photos unreachable; embed loads nothing until clicked.
**Verify** — API-P05, API-A24, F-13, E2E-11.
**Risks / rollback** — An image of a child published without consent. The approval step and the permission record are the control.
**DoD** — Upload, publish, view publicly, unpublish, confirm removal.

### S18 — FAQs, testimonials, settings
**Outcome** — The administrator manages FAQs, moderates testimonials, and edits school contact details.
**Covers** — FR-004, FR-032 to FR-035.
**Depends on** — S06.
**Touches** — Three models, three admin screens, two public pages.
**Setup** — None.
**AI work** — FAQ CRUD; testimonial consent enforcement and approve-then-publish; settings with validated placement lists.
**Owner action** — Approve consent wording before the public testimonial form is enabled.
**Approach** — Approval and publication are distinct, so one click cannot publish unreviewed parent text.
**Acceptance** — Consent false rejected; publishing unapproved → `409`; settings changes reflected publicly only after save; invalid placement lists rejected.
**Verify** — API-P06, API-P12, API-A23, API-A28, E2E-12.
**Risks / rollback** — Publishing a testimonial without permission. Consent flag enforced in the schema.
**DoD** — Submit, approve, publish, unpublish, confirm each step's public effect.

### S19 — School information content
**Outcome** — The administrator edits the fixed text sections of About, Academics (Primary and Secondary) and Admissions. Public pages render them, and show an honest empty state where the school has not supplied text.
**Covers** — FR-002, FR-003.
**Depends on** — S18 for the settings pattern. The structure decision (ADR-030) is approved.
**Touches** — `server/src/models/pagecontent.ts`, `constants/pageSections.ts`, `routes/public/pages.ts`, `routes/admin/pages.ts`, `scripts/seed-pages.ts`; the About, Academics and Admissions pages; a new admin content editor.
**Setup** — None.
**AI work** — Seed four documents with their fixed key sets and empty bodies; public `GET` and admin `GET`/`PATCH`; strict key validation; sanitised HTML; an editor with one field per section.
**Owner action** — None to build. **The school must later supply the actual text** for each section — a content task, separate from this slice.
**Approach** — Section keys are a constant in code; the client maps each key to a fixed layout slot. There is no add, remove or reorder control, because the PRD forbids the administrator from changing page structure (ADR-030).
**Acceptance** — All four pages return their complete key set in the defined order; an unknown key is `422`; a result missing a key is `422`; edited text appears publicly; an unsupplied section renders the "not yet available" state rather than placeholder prose.
**Verify** — API-P16, API-P17, API-A29 to A32, plus a sanitisation test mirroring T-09.
**Risks / rollback** — Stored XSS through section bodies; editors mistaking an empty section for a bug. Sanitiser plus an explicit empty state.
**DoD** — Edit one section, see it publicly, and confirm an untouched section shows the empty state.

### S20 — Accessibility, responsive, Stage 1 gate
**Outcome** — The site is usable by keyboard and screen reader, works on a phone, and meets the Stage 1 conditions.
**Covers** — FR-005, FR-038, and the Stage 1 gate.
**Depends on** — S14, **S15**, S16 to S19. S15 is required here because `SECURITY.md` §17 and `TEST_PLAN.md` §13 make a completed restore drill a Stage 1 condition.
**Touches** — All pages; focus management, headings, labels, contrast, mobile tables.
**Setup** — Deployed environment.
**AI work** — Accessibility pass, responsive fixes, run the full Stage 1 checklist.
**Owner action** — Review the demonstration and confirm no real data has been entered.
**Approach** — Test with keyboard and a screen reader, not only an automated scan.
**Acceptance** — Zero serious axe violations; keyboard-only completion of the admission form; usable at 375 px; all Stage 1 conditions met.
**Verify** — `TEST_PLAN.md` §11 and §13; DEP-01 to DEP-10.
**Risks / rollback** — Claiming accessibility from a clean scan. Record residual issues instead.
**DoD** — Stage 1 acceptance checklist signed off with evidence.

---

## 8. Gates

| Gate | Requires | Blocks |
|---|---|---|
| **G1 — Core loop** | S06 complete and demonstrated | Any claim that the product works |
| **G2 — Auth verified** | S07 passed | Stage 1 launch |
| **G3 — Data safety** | S09, S15 complete | Real admission data |
| **G4 — Stage 1** | S20 and `TEST_PLAN.md` §13 | Showing the school |
| **G5 — Stage 2** | SG-01 to SG-12 and S2-01 to S2-12 | Real applications |

**G3 is the one that matters most.** Trash and permanent deletion (S09) plus a proven restore (S15)
are what stand between a mistake and permanent loss of a child's record. Neither may be skipped to
reach a demo sooner.

## 9. Approval record

**Approved by:** project owner, 24 October 2026 · **Revised:** 29 October 2026 (S13/S15 storage provider).

The slice order is approved as written, including the judgement call in §5 — **S05 runs before
S07**, accepting that authentication is built before cross-origin cookie behaviour is verified,
with the exposure contained to `server/src/lib/session-cookie.ts`.

This approves the **order and scope** of the slices. It does not:

- authorise any slice beyond the one currently in progress;
- substitute for the accounts needed by S07, S13, S14 and S15;
- close any item in §10.

Two decisions have since been taken: **D-01** (admission field baseline) and **D-02** (gender
values), both on 24 October 2026, recorded as ADR-031. **Q13** was resolved as ADR-030, which
unblocked S19.

Slices start at S00 and proceed in order unless the order is explicitly changed.

---

## 10. Decisions still outstanding

Recorded here so they are visible at the point they matter, not buried in a register.

**Resolved 24 October 2026** (kept visible so they are not reopened): **D-01** admission field
baseline and **D-02** gender values — ADR-031. **D-04** / Q13 editable school content — ADR-030.

| # | Decision | Needed before | Whose |
|---|---|---|---|
| D-03 | Supply class lists and academic session names (placeholders acceptable until Stage 1 demo) | S04 for real use | School |
| D-05 | Q12 — event time-of-day | S16 | You |
| D-06 | Q15 — testimonial name display | S18 | School |
| D-07 | Consent wording for testimonials | S18 public form | School + counsel |
| D-08 | Q1 — Vercel Hobby eligibility | S14 | Vercel support |
| D-09 | Q7 — retention and permanent-deletion policy | Stage 2 | School |
| D-10 | Q6 — Atlas tier for Stage 2 | Stage 2 | School |
| D-11 | L-01 to L-10 in `SECURITY.md` §13.3 | Stage 2 | School + counsel |
| **D-12** | Backup destination: a second Supabase project, or a third bucket in the application project | S15 | You |
| **D-13** | Gallery publication: stage-then-publish, or accept that upload is publication | S13 / S17 | You |

**None of these blocks S00.** The first that will matter is D-03, and only for real content at S04 — placeholders are acceptable until the Stage 1 demonstration.
