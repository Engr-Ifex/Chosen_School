# Chosen School Website — Integration Register

**Document status:** Living record
**Version:** 1.0
**Last updated:** 29 October 2026
**Owner of this document:** technical planning

> Every external service the product depends on, with its current status. A service is only
> **Verified** when a real connection has been made and the result recorded here. Nothing in this
> register has been connected yet — no accounts exist, and no credentials have been created.

---

## 1. Status vocabulary

| Status | Meaning |
|---|---|
| **Not assessed** | Not yet looked at |
| **Planned** | Required, approach decided, no setup done |
| **Awaiting my action** | Blocked on the project owner creating an account, granting access, or making a decision |
| **Configured** | Credentials and settings in place, **connection not yet proven** |
| **Verified** | A real connection or operation succeeded, with the evidence recorded below |
| **Failed** | Attempted and did not work; reason recorded |
| **Blocked** | Cannot proceed for a reason outside our control |
| **Deferred** | Deliberately postponed; not needed for the current stage |

**Configured is not Verified.** A key pasted into a dashboard proves nothing until something
connects with it and succeeds.

---

## 2. Summary

| # | Service | Purpose | Requirement | Status |
|---|---|---|---|---|
| I-01 | GitHub | Source control, deploy trigger | Required | Awaiting my action |
| I-02 | MongoDB Atlas | Primary database | Required | Awaiting my action |
| I-03 | Vercel | Frontend hosting | Required | Awaiting my action |
| I-04 | Render | API hosting | Required | Awaiting my action |
| I-05 | Supabase Storage | Private admission files and public gallery images | Required | Awaiting my action |
| I-06 | Supabase Storage (backup project) | Off-site encrypted backups | Required | Awaiting my action — **D-12** |
| I-07 | Local backup toolchain | `mongodump` + `age` + upload script | Required | Planned |
| I-08 | Uptime monitoring | Availability alerting | Required for Stage 1 launch | Deferred |
| I-09 | Custom domain + DNS | Stable hostname | Optional | Deferred |
| I-10 | Error tracking | Exception reporting | Optional | Deferred |

**Explicitly not integrated.** Documented so they are not added by accident:

| Capability | Why there is no integration |
|---|---|
| Email sending | Password reset is developer-assisted via CLI. No transactional email service |
| Payments | Out of scope per `PRD.md` §4.2 |
| AI APIs | No AI feature in scope |
| Analytics | Out of scope per `discovery.md` §2 |
| WhatsApp | `wa.me` link only. No API, no credentials, no message is ever sent by the site |
| YouTube | Administrator-supplied links, embedded client-side. No API key |
| Maps | A link to the school's confirmed location. No map SDK, no API key |
| SMS | Not in scope |
| CDN / WAF | Not needed at this scale; the hosts provide basic protection |

---

## 3. Required integrations

### I-01 — GitHub

| Field | Detail |
|---|---|
| **Provider** | GitHub |
| **Purpose** | Source control and the deploy trigger for both Vercel and Render |
| **Affected features** | All. No deployment is possible without a repository |
| **Status** | Awaiting my action |
| **Connection method** | Git over HTTPS or SSH from the developer machine; provider-to-repo authorisation inside Vercel and Render |
| **Documentation** | https://docs.github.com |
| **Prerequisites** | GitHub account. A repository named for the project |
| **Permissions** | Repository read/write for the developer. Vercel and Render need read access — grant them the **single repository**, not the whole account |
| **Credentials** | Developer SSH key or personal access token, held locally. **No GitHub credential belongs in any application environment variable** |
| **Environment variables** | None |
| **Environments** | Development, staging, production (branch-based) |
| **Security** | Private repository recommended — it contains no secrets, but it does describe the security design. Never commit `.env`. Enable branch protection on the default branch before Stage 2 |
| **Setup steps** | 1. Create the repository. 2. Add a `.gitignore` (provided). 3. Push the documentation. 4. Authorise Vercel and Render against this repository only |
| **Verification** | `git remote -v` shows the expected remote; a push succeeds; both hosts show a connected repository |
| **Failure handling** | A deploy that never triggers is almost always a missing repository authorisation on the host, not a code fault |
| **Cost limits** | Free for public and private repositories at this scale |
| **Blockers** | None |
| **Responsible** | Owner creates the repository and grants host access; developer does everything after |

---

### I-02 — MongoDB Atlas

| Field | Detail |
|---|---|
| **Provider** | MongoDB Atlas, Free tier (M0) |
| **Purpose** | System of record: applications, enquiries, visits, content, sessions, audit |
| **Affected features** | Every feature that reads or writes data — effectively all of them |
| **Status** | Awaiting my action |
| **Connection method** | Mongoose over the `mongodb+srv://` connection string, TLS required |
| **Documentation** | https://www.mongodb.com/docs/atlas/ · https://www.mongodb.com/docs/atlas/driver-connection/ |
| **Prerequisites** | Atlas account. One M0 cluster. A database user. A network access rule |
| **Permissions** | Application user: `readWrite` on the application database only — **not** `atlasAdmin`, **not** `readWriteAnyDatabase` |
| **Credentials** | Database username and password. Password generated, not chosen, stored in a password manager |
| **Environment variables** | `MONGODB_URI` (secret), `MONGODB_DB_NAME` (non-secret) |
| **Environments** | Development (local `mongod` or a second M0 cluster), production |
| **Security** | See §5.1 — the network access rule is a genuine weakness of this combination |
| **Setup steps** | 1. Create the cluster. 2. Create the application user. 3. Configure network access. 4. Build the connection string. 5. Store it in the Render dashboard, never in the repository |
| **Verification** | A script connects, writes one document to a scratch collection, reads it back, deletes it. Record the actual output in §7 |
| **Failure handling** | Cluster paused (30 days idle) → connections refused, data intact, manual resume required. Atlas unreachable → the API returns `503`, never a stack trace |
| **Cost limits** | 0.5 GB, 500 connections, 100 ops/sec, 32 MB in-memory sort. Free tier is documented by MongoDB as being for learning, with no SLA |
| **Blockers** | Stage 2 tier decision (SG-02) |
| **Responsible** | Owner creates account and cluster; developer writes and runs the verification |

---

### I-03 — Vercel

| Field | Detail |
|---|---|
| **Provider** | Vercel, Hobby plan |
| **Purpose** | Serves the React build and proxies `/api/*` to Render |
| **Affected features** | Entire public site and dashboard UI; also the same-origin authentication design |
| **Status** | Awaiting my action — **and blocked on eligibility (Q1)** |
| **Connection method** | Git integration, build on push |
| **Documentation** | https://vercel.com/docs · https://vercel.com/docs/rewrites |
| **Prerequisites** | Vercel account, repository connected, project created |
| **Permissions** | Repository read access. No elevated account permissions needed |
| **Credentials** | None required for the application. The rewrite target URL is configuration, not a secret |
| **Environment variables** | `VITE_API_BASE_URL` (non-secret, `"/api/v1"`) |
| **Environments** | Preview (per branch) and production |
| **Security** | `VITE_`-prefixed variables are **bundled into the browser build**. Nothing secret may use that prefix. The rewrite means the browser never learns the Render hostname |
| **Setup steps** | 1. Create the project from the repository. 2. Set the root directory to `client/`. 3. Add the rewrite to the Render URL. 4. Set `VITE_API_BASE_URL` |
| **Verification** | Preview deployment loads; `/api/v1/health` returns through the Vercel origin; the response carries no `Access-Control-Allow-Origin` |
| **Failure handling** | Build failure → previous deployment stays live. Rewrite target down → the proxy returns an error the client must render as an honest failure |
| **Cost limits** | Hobby: 100 GB transfer, 1M function invocations, commercial use **not** permitted |
| **Blockers** | **Q1 — eligibility.** Hobby is restricted to non-commercial personal use; a school advertising admissions may fall outside it. Low traffic does not change this. Must be confirmed with Vercel in writing (SG-01) |
| **Responsible** | Owner creates the account and sends the eligibility question; developer configures |

---

### I-04 — Render

| Field | Detail |
|---|---|
| **Provider** | Render, free web service |
| **Purpose** | Runs the Express API |
| **Affected features** | All API functionality; authentication; file handling; PDF generation |
| **Status** | Awaiting my action |
| **Connection method** | Git integration; Node runtime; `npm ci && npm run build`, then `npm start` |
| **Documentation** | https://render.com/docs · https://render.com/docs/environment-variables |
| **Prerequisites** | Render account, repository connected, web service created |
| **Permissions** | Repository read access |
| **Credentials** | None for deployment. All secrets are set in the Render dashboard |
| **Environment variables** | The full server set — see `ENVIRONMENT_VARIABLES.md` |
| **Environments** | Production. A free second service for staging would consume the 750-hour allowance twice over, so staging is local |
| **Security** | Dashboard access is equivalent to holding every secret. Enable MFA on the Render account. Variables are visible to anyone with project access |
| **Setup steps** | 1. Create the web service from the repository, root `server/`. 2. Set the start command. 3. Add environment variables. 4. Deploy |
| **Verification** | `GET /api/v1/health` returns `200` with no internal detail; the response time after an idle period is recorded (§7) |
| **Failure handling** | Spins down after 15 minutes idle, ~1 minute to wake. Ephemeral disk — **nothing permanent may be written to it**. May restart at any time, so no state in process memory |
| **Cost limits** | 750 instance hours/month, monthly build minutes and bandwidth. Provider documents free instances as not for production |
| **Blockers** | Cold-start behaviour through the Vercel proxy is unverified (Q2) |
| **Responsible** | Owner creates account and service; developer configures and measures |

---

### I-05 — Supabase Storage (application storage)

| Field | Detail |
|---|---|
| **Provider** | Supabase Storage — **file storage only**, not Supabase Database |
| **Purpose** | Private admission photographs and approved private admission files; public gallery images |
| **Affected features** | FR-007–FR-013 (upload), FR-019–FR-022 (admin viewing), FR-030 (gallery) |
| **Status** | Awaiting my action — **selected** (ADR-032); no project, bucket or key exists yet |
| **Connection method** | `@supabase/supabase-js` from the Express server, `storage.from(bucket)` |
| **Documentation** | https://supabase.com/docs/guides/storage |
| **Prerequisites** | Supabase account and one project. Two buckets |
| **Permissions** | The `service_role` key **bypasses row-level security entirely and cannot be scoped to a bucket**. Backend only |
| **Credentials** | Project URL and service-role key |
| **Environment variables** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET_PRIVATE`, `SUPABASE_BUCKET_PUBLIC` |
| **Environments** | Development (local stub, or a dev bucket in a spare project), production |
| **Security** | Private bucket has no public URL; files reach the browser only through the authenticated API. Public bucket is world-readable by design and written only by the server. The service key must never reach the client — see `ENVIRONMENT_VARIABLES.md` §9 |
| **Setup steps** | 1. Create the project. 2. Create `admissions-private` (private) and `gallery-public` (public). 3. Set per-bucket file-size and MIME restrictions. 4. Copy the project URL and service-role key |
| **Verification** | Upload with the service key; read back; confirm an unauthenticated request to the private bucket is refused |
| **Failure handling** | Upload failure → the application record is **not** saved with a dangling reference (§5.5) |
| **Cost limits** | Free: **1 GB** storage, 5 GB + 5 GB cached egress, **50 MB** per file, **project pauses after 1 week idle**, **no backups** |
| **Blockers** | None |
| **Responsible** | Owner creates the project, buckets and key; developer configures and verifies |

---

### I-06 — Supabase Storage (backup project)

| Field | Detail |
|---|---|
| **Provider** | Supabase Storage, in a **second project** — proposed, see **D-12** |
| **Purpose** | Off-site storage of encrypted database and file archives |
| **Affected features** | FR-039–FR-041 (backup and recovery) |
| **Status** | Awaiting my action — selected (ADR-032); **D-12 still needs your decision** |
| **Connection method** | A Node backup script using `@supabase/supabase-js`, run from the developer machine |
| **Documentation** | https://supabase.com/docs/guides/storage |
| **Prerequisites** | A second Supabase project (the free plan allows two active projects), one private bucket |
| **Permissions** | That project's own `service_role` key |
| **Credentials** | Separate URL and key. `age` private key held offline |
| **Environment variables** | None on Render. Local only — see `ENVIRONMENT_VARIABLES.md` §4 |
| **Environments** | Backups run from the developer machine |
| **Security** | **The application server must not hold the backup project's key.** A Supabase service key cannot be bucket-scoped, so project separation is the only way to keep backups unreachable from a compromised API |
| **Setup steps** | 1. Create the backup project. 2. Create `backups` (private). 3. Copy its URL and key. 4. Generate an `age` pair, store the private key offline |
| **Verification** | Dump → encrypt → upload → download → decrypt → restore into a scratch Atlas cluster (§7) |
| **Failure handling** | Missing key → abort; never upload plaintext |
| **Cost limits** | Its own free allowance: another 1 GB and another 7-day pause clock. A paused backup project means the nightly job fails |
| **Blockers** | **D-12** — same project or a second one |
| **Responsible** | Owner creates the project and bucket, and holds the offline key |

---

### I-07 — Local backup toolchain

| Field | Detail |
|---|---|
| **Provider** | None — local tooling |
| **Purpose** | `mongodump` → `age` → upload to the backup project, nightly |
| **Affected features** | FR-039–FR-041 |
| **Status** | Planned |
| **Connection method** | `mongodump`, `age`, and a Node script using `@supabase/supabase-js` |
| **Documentation** | MongoDB database tools; age; https://supabase.com/docs/guides/storage |
| **Prerequisites** | Tools installed on the developer machine. A read-only Atlas user for backups is preferable to reusing the application user |
| **Permissions** | Read on the application database; write on the backup project's bucket |
| **Credentials** | Atlas read credentials, backup project key, `age` private key |
| **Environment variables** | Local file only (`.env.backup`), never in Render |
| **Environments** | Developer machine |
| **Security** | The `age` private key is stored offline — password manager plus a written copy. It is never committed, never uploaded, never on Render |
| **Setup steps** | Write the script; document the runbook; schedule it |
| **Verification** | TEST_PLAN §10 drill, performed and timed |
| **Failure handling** | Missing key → abort. Upload failure → keep the local archive and alert |
| **Cost limits** | None |
| **Blockers** | Requires I-02 and I-06 |
| **Responsible** | Developer |

---

## 4. Deferred integrations

### I-08 — Uptime monitoring — **Deferred**

Needed before Stage 1 launch, not before then. A free external monitor polls `/api/v1/health`
every 5 minutes and alerts on failure. It also detects an Atlas pause, which is otherwise silent.
No credentials required; the health endpoint is public and leaks nothing. Selection postponed
until the health endpoint exists and can be polled.

### I-09 — Custom domain and DNS — **Deferred**

Not required for Stage 1. A domain would fix two things at once: it removes the cross-origin
proxy from the authentication design (same-site subdomains), and it removes the Hobby eligibility
ambiguity from the hosting discussion. It costs money, so it stays deferred pending owner
approval.

### I-10 — Error tracking — **Deferred**

Sentry or equivalent has a free tier. Not required for Stage 1; server logs plus the health check
are sufficient initially. If added, the DSN is a non-secret write key, but the SDK must be
configured not to capture request bodies — those contain children's data.

---

## 5. Cross-cutting security notes

### 5.1 Atlas network access — a documented weakness

Render's free web service has **no static outbound IP addresses**, so the Atlas access list
cannot be narrowed to the application's egress. The practical options are:

- Allow broad ranges (in the limit `0.0.0.0/0`), relying on a strong generated password, SCRAM
  authentication and TLS. **This is what the free combination forces, and it should be stated
  plainly rather than presented as acceptable.**
- Add a paid static-egress option, which breaks the no-cost constraint.

This belongs in the Stage 2 security review (SG-02). It is not a detail to be discovered later.

### 5.2 Credential separation

| Credential | Lives where | Must never appear in |
|---|---|---|
| Atlas application user | Render environment | Repository, client bundle, logs |
| Atlas backup user | Developer machine | Render |
| Supabase service-role key (application project) | Render environment | Repository, client bundle, logs |
| Supabase service-role key (backup project) | Developer machine | Render |
| `age` private key | Offline only | Any machine that runs the application |
| Admin password | Argon2id hash in the database | Anywhere in plaintext, ever |

### 5.3 Processor agreements

Under NDPA 2023 **s.29**, the controller must ensure each processor complies with the Act, assists
with data-subject rights, and implements appropriate technical and organisational measures. The
Act states that these measures **include a written agreement** between controller and processor.

Vercel, Render, Supabase and MongoDB all act as **processors** of children's and parents' data
in this architecture. Written terms with each are therefore a Stage 2 requirement (S2-03 in
`SECURITY.md` §18), and the school — not the developer — is the controller that must satisfy
itself they are adequate.

This is a legal obligation, not a configuration step. It cannot be discharged by accepting a
provider's standard terms without reading them, and it is recorded here so it is not forgotten
while the technical work proceeds.

### 5.4 What must never cross into the browser

Only `VITE_`-prefixed variables reach the bundle, and Vite inlines them at build time. They are
public. No database URI, API key, or bucket secret may use that prefix — not even temporarily.
There is no `VITE_SUPABASE_*`: the browser never holds a Supabase credential.

### 5.5 Upload failure, orphans and replacement

Supabase Storage is a second system of record, and the two cannot be updated atomically. The
ordering rules below exist so that no failure leaves a record pointing at a file that is not
there, or a file that no record points to.

| Situation | Handling |
|---|---|
| **Upload succeeds, database write fails** | Delete the just-uploaded object, then return the error. An orphan is better than a broken record, but neither should be left behind silently |
| **Upload fails** | Save nothing. The application record is not created with a dangling reference |
| **Database write succeeds, object delete fails (permanent delete)** | Abort the delete and report it. The record stays, so the operation can be retried — see `DATA_MODEL.md` §4.6 |
| **File replacement (edit)** | Upload the new object under a new key, update the record, **then** delete the old key. Deleting first loses the photo if the update fails |
| **Orphan detected** | A periodic reconciliation compares object keys against stored references and reports mismatches. It reports; it does not auto-delete, because a false positive would destroy a child's photograph |

**There is no transaction across the two systems.** Every path above is written so the recoverable
failure is the one that happens.

---

## 6. Available tooling — honest assessment

Checked on 24 October 2026.

| Capability | Available here? | Consequence |
|---|---|---|
| Installed connectors | **None** | Nothing can be driven through a connector today |
| Official MCP connector for Atlas, Vercel, Render or Supabase | **None found** | These must be set up manually in each provider's dashboard |
| GitHub connector | Available, not installed | Could clone and manage the repository. Not needed yet — local `git` is sufficient until the repo exists |
| Provider CLIs | Not installed | `mongosh`, `wrangler`, `vercel`, `render` could be installed locally later if useful |
| Web research | Available | Used for all provider claims in `ARCHITECTURE.md` §6 |
| Account creation, billing, dashboard configuration | **Not available** | Only you can do these |

**Conclusion:** every integration in §3 is a manual setup step on your side. I can write and run
verification scripts once credentials exist, but I cannot create accounts, and I will not ask you
to paste secrets into this conversation.

---

## 7. Verification log

Nothing has been verified. This table is filled in as each check is actually run.

| # | Check | Command / method | Expected | Actual | Date |
|---|---|---|---|---|---|
| V-01 | Atlas connection | scratch write/read/delete script | Document round-trips | **Not run** — no credentials | — |
| V-02 | Atlas rejects bad credentials | connect with wrong password | Auth error, no data leak | **Not run** | — |
| V-03 | Private bucket is not public | unauthenticated `GET` on the public-path form of a private object | `400`/`403`/`404` — never the file | **Not run** | — |
| V-04 | Public bucket serves gallery images | unauthenticated `GET` on a public object URL | `200` with the image | **Not run** | — |
| V-05 | Render health endpoint | `GET /api/v1/health` | `200`, no internal detail | **Not run** | — |
| V-06 | Cold start through Vercel proxy | idle 20 min, then request | Success, or honest failure; latency recorded | **Not run** | — |
| V-07 | Cookie is first-party on Vercel origin | DevTools → Cookies | Attributed to Vercel origin, `__Host-` accepted | **Not run** | — |
| V-08 | No CORS header required | inspect response | No `Access-Control-Allow-Origin` | **Not run** | — |
| V-09 | Backup restore | full drill per TEST_PLAN §10 | Counts and checksums match | **Not run** | — |

**Do not mark an integration Verified on the basis that code was written or a key was saved.**
Only V-01 through V-09, actually executed, count.
