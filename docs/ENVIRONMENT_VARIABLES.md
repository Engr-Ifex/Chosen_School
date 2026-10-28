# Chosen School Website — Environment Variables

**Document status:** Living record
**Version:** 1.0
**Last updated:** 24 October 2026
**Companion files:** `.env.example` (root), `.gitignore` (root)

> The authoritative register of every configuration value. If a variable is not in this document,
> it does not belong in the application. Adding one without recording it here is how secrets end
> up in places nobody audits.

---

## 1. Rules

1. **`.env` is never committed.** It is listed in `.gitignore`. Only `.env.example` is committed,
   with placeholder values.
2. **Only `VITE_`-prefixed variables reach the browser.** Vite inlines them into the bundle at
   build time, so they are public forever. No secret may use that prefix — not even briefly
   during debugging.
3. **Backend secrets never appear in client code.** The browser calls `/api/v1/...` relatively;
   it never learns the database URI, the storage keys, or the Render hostname.
4. **No real credential is written into this document, the repository, or a chat message.** If a
   value is ever pasted into a conversation, treat it as compromised and rotate it.
5. **The server validates its configuration at boot** and refuses to start if a required value is
   missing or malformed. Failing at startup is far better than failing on a parent's submission.
6. **Separate credentials for separate purposes.** The application token cannot reach the backup
   bucket; the backup token is never on the application server.

---

## 2. Server — Render

Consumed by the Express API at runtime.

| Name | Purpose | Secret | Required | Where to obtain | Validation |
|---|---|---|---|---|---|
| `MONGODB_URI` | Atlas connection string | **Yes** | Yes | Atlas → Connect → Drivers | Must start `mongodb+srv://`, contain `retryWrites=true` and `w=majority`, include a database user |
| `MONGODB_DB_NAME` | Database name | No | No (default `chosen_school`) | Chosen by us | Lowercase, `^[a-z][a-z0-9_]{2,38}$` |
| `NODE_ENV` | Runtime mode | No | Yes | — | Exactly `production` on Render |
| `PORT` | Listen port | No | Yes | Injected by Render | Integer 1–65535 |
| `APP_ORIGIN` | Exact frontend origin, used for origin and CSRF checks | No | Yes | The Vercel production URL | Absolute `https://` URL, **no trailing slash** |
| `SESSION_COOKIE_NAME` | Cookie name | No | No (default `__Host-cs_session`) | — | Must start `__Host-` in production |
| `TRUST_PROXY_HOPS` | How many proxies to trust for client IP | No | Yes | Determined by deployment | Integer 0–5. **Must be verified, not guessed** — see §6 |
| `LOG_LEVEL` | Logging verbosity | No | No (default `info`) | — | One of `error`, `warn`, `info`, `debug` |
| `R2_ACCOUNT_ID` | Cloudflare account identifier | No (identifier) | Yes | Cloudflare dashboard | 32 hex characters |
| `R2_ACCESS_KEY_ID` | R2 token access key | **Yes** | Yes | R2 → Manage API tokens | Non-empty |
| `R2_SECRET_ACCESS_KEY` | R2 token secret | **Yes** | Yes | Shown once at token creation | Non-empty. Cannot be retrieved later — if lost, rotate |
| `R2_BUCKET_PRIVATE` | Private photo bucket | No | Yes | Chosen at setup | `admissions-private` |
| `R2_BUCKET_PUBLIC` | Public gallery bucket | No | Yes | Chosen at setup | `gallery-public` |
| `R2_PUBLIC_BASE_URL` | Base URL for public gallery images | No | Yes | R2 bucket settings (public domain or custom) | Absolute `https://` URL, no trailing slash |

**Not needed, and deliberately absent:** `SESSION_SECRET` (sessions are random tokens stored
hashed — there is nothing to sign), `JWT_SECRET` (no JWTs), `CORS_ORIGIN` (the rewrite makes CORS
unnecessary), `SMTP_*` (no email service).

---

## 3. Client — Vercel

Bundled into the browser. **Public by definition.**

| Name | Purpose | Secret | Required | Where to obtain | Validation |
|---|---|---|---|---|---|
| `VITE_API_BASE_URL` | API base path | **No — public** | Yes | Set manually | Must be `"/api/v1"` in every deployed environment. A relative path is what keeps the rewrite and the cookie same-origin |

**If a value must not be readable in the browser, it cannot live here.** There is no such thing as
a private `VITE_` variable.

---

## 4. Local only — backup toolchain

Used by the nightly backup job on the developer machine. **None of these may be set on Render.**

| Name | Purpose | Secret | Required | Where to obtain | Validation |
|---|---|---|---|---|---|
| `BACKUP_MONGODB_URI` | Atlas URI for dumping | **Yes** | Yes | Atlas, ideally a read-only user | As `MONGODB_URI` |
| `BACKUP_R2_ENDPOINT` | R2 endpoint for the backup bucket | No | Yes | Cloudflare | Absolute `https://` URL |
| `BACKUP_R2_ACCESS_KEY_ID` | Backup-only token | **Yes** | Yes | Separate R2 token | Non-empty |
| `BACKUP_R2_SECRET_ACCESS_KEY` | Backup-only secret | **Yes** | Yes | Shown once at creation | Non-empty |
| `BACKUP_R2_BUCKET` | Backup bucket | No | Yes | Chosen at setup | `backups` |
| `AGE_RECIPIENT` | Public key used to encrypt | No (public key) | Yes | Generated locally | `age1...` |
| `AGE_IDENTITY_FILE` | **Path** to the private key | Path only | Yes | Offline storage | Must exist and be outside the repository |

Stored in `.env.backup`, which is gitignored. The `age` private key itself is never stored in any
file inside the project.

---

## 5. Environments

| Variable | Local development | Vercel preview | Production |
|---|---|---|---|
| `MONGODB_URI` | Local `mongod` or a separate dev M0 | — | Atlas |
| `APP_ORIGIN` | `http://localhost:5173` | Preview URL | Production URL |
| `TRUST_PROXY_HOPS` | `0` | `2` (verify) | `2` (verify) |
| `VITE_API_BASE_URL` | `/api/v1` (Vite dev proxy) | `/api/v1` | `/api/v1` |
| R2 variables | Dev bucket or local storage stub | — | Production buckets |

**Local development does not require any provider account.** MongoDB runs locally, and storage is
accessed through an interface with a local-filesystem implementation. This is what allows
implementation to proceed before your accounts exist — see `ROADMAP.md`.

---

## 6. `TRUST_PROXY_HOPS` — the one value that must be measured

Behind the Vercel rewrite, Express sees Vercel's address rather than the visitor's. If
`trust proxy` is wrong:

- **Too low:** every visitor shares one rate-limit key. Brute-force protection is effectively
  disabled, and one abusive client throttles everyone.
- **Too high:** a client can forge `X-Forwarded-For` and choose its own rate-limit identity.

The correct value depends on the real hop count between the browser and Express, which is only
knowable once the deployment exists. It is set to `2` as a starting hypothesis and **verified by
TEST_PLAN T3**: six failed logins from one client must produce a `429` for that client and not for
another. Until T3 passes, rate limiting is unproven.

---

## 7. Rotation

| Credential | How to rotate | Afterwards |
|---|---|---|
| Atlas user password | Atlas → Database Access → edit user | Update `MONGODB_URI` on Render; redeploy; delete old sessions |
| R2 application token | R2 → API tokens → roll | Update the three R2 variables; redeploy |
| R2 backup token | Same, separate token | Update `.env.backup`; run a test backup |
| `age` key pair | Generate a new pair | Old backups stay readable with the old key — **keep the old private key** until those archives expire |
| Admin password | CLI script | Deletes all sessions; audit entry written |

A rotation is not complete until the dependent operation has been re-run successfully. Updating a
value without proving it works leaves the system broken in a way that only surfaces later.

---

## 8. Boot-time validation

The server should check, before accepting traffic:

1. Every required variable is present and non-empty.
2. `MONGODB_URI` parses and its scheme is correct.
3. `APP_ORIGIN` is an absolute `https://` URL with no trailing slash.
4. `TRUST_PROXY_HOPS` is an integer in range.
5. `SESSION_COOKIE_NAME` starts with `__Host-` when `NODE_ENV=production`.
6. On startup, **log the names of the variables that are set, never their values** — so a missing
   variable is diagnosable without a secret appearing in the logs.

If any check fails, exit non-zero with a message naming the variable and the reason. Do not start
in a degraded state.
