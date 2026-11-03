# Chosen School Website — Environment Variables

**Document status:** Living record
**Version:** 1.0
**Last updated:** 29 October 2026
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
| `SUPABASE_URL` | Supabase project URL | No (identifier) | Yes | Supabase dashboard → Project Settings → API | Absolute `https://` URL, no trailing slash, form `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Storage access key | **Yes** | Yes | Supabase → Project Settings → API → `service_role` | Non-empty. **Bypasses row-level security entirely** — see §9 |
| `SUPABASE_BUCKET_PRIVATE` | Private admission-file bucket | No | Yes | Chosen at setup | `admissions-private` |
| `SUPABASE_BUCKET_PUBLIC` | Public gallery bucket | No | Yes | Chosen at setup | `gallery-public` |

**Not needed, and deliberately absent:** `SESSION_SECRET` (sessions are random tokens stored
hashed — there is nothing to sign), `JWT_SECRET` (no JWTs), `CORS_ORIGIN` (the rewrite makes CORS
unnecessary), `SMTP_*` (no email service), `SUPABASE_ANON_KEY` (the browser never talks to Supabase
directly), `SUPABASE_PUBLIC_BASE_URL` (derived from `SUPABASE_URL` and the bucket name — see §8).

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
| `BACKUP_SUPABASE_URL` | Supabase project URL holding backups | No | Yes | Supabase dashboard | Absolute `https://` URL |
| `BACKUP_SUPABASE_SERVICE_ROLE_KEY` | Service key for the **backup** project | **Yes** | Yes | Supabase → API → `service_role` | Non-empty. Must belong to a **different project** from the application's key — see §9 |
| `BACKUP_SUPABASE_BUCKET` | Backup bucket | No | Yes | Chosen at setup | `backups` |
| `AGE_RECIPIENT` | Public key used to encrypt | No (public key) | Yes | Generated locally | `age1...` |
| `AGE_IDENTITY_FILE` | **Path** to the private key | Path only | Yes | Offline storage | Must exist and be outside the repository |

Stored in `.env.backup`, which is gitignored. The `age` private key itself is never stored in any
file inside the project.

**Why `BACKUP_SUPABASE_URL` must point at a different project.** A Supabase `service_role` key is
project-wide and bypasses row-level security — it cannot be scoped to one bucket. If backups lived
in the application's own project, the application's key could delete them, which is exactly the
failure the previous provider separation prevented. The free plan allows two active projects, so a
separate backup project preserves the separation. This is **D-12**, still awaiting your approval.

---

## 5. Environments

| Variable | Local development | Vercel preview | Production |
|---|---|---|---|
| `MONGODB_URI` | Local `mongod` or a separate dev M0 | — | Atlas |
| `APP_ORIGIN` | `http://localhost:5173` | Preview URL | Production URL |
| `TRUST_PROXY_HOPS` | `0` | `2` (verify) | `2` (verify) |
| `VITE_API_BASE_URL` | `/api/v1` (Vite dev proxy) | `/api/v1` | `/api/v1` |
| `ALLOW_REMOTE_DEV_DB` | `false` | `false` | not used |
| Supabase variables | Local storage stub, or a dev bucket in a spare project | — | Application project |

### 5.1 Which file, and when

| Where | Files | Loaded by |
|---|---|---|
| Local development | `server/.env` then `server/.env.development` | `npm run dev:server` |
| Local database operations | `server/.env` only | `seed`, `sync-indexes`, `provision-admin` |
| Production | **no file** | `npm start` = `node dist/index.js`; Render supplies the environment |
| Deployment register | `.env.example` (root) | nothing — it documents the Render and Vercel variables |

`server/.env.development` contains **only** `NODE_ENV=development` and
`APP_ORIGIN=http://localhost:5173`. It holds no secrets, so it is committed. Node applies later
`--env-file` flags over earlier ones, which is what makes this a two-line override rather than a
second configuration file to keep in sync.

`server/.env` is gitignored along with `.env.*`, except `.env.development`.

### 5.2 Development and production share one Atlas database

`MONGODB_DB_NAME` is the same locally as in production, so **local work reads and writes live
school data**. That is a deliberate choice, not an oversight: it keeps one database and one set of
credentials. The trade-off is that a mistaken `seed` or `deleteMany` run locally reaches real
records.

Mitigations that exist today: `seed` refuses to run when `NODE_ENV=production`; `provision-admin`
refuses the same; `npm run dev:server` sets `NODE_ENV=development` but the database is unchanged.

**To confirm which database a running process is on**, read the `database_connected` log line — it
carries `host`, `database` and `environment`, and never a credential.

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
| Supabase service-role key | Supabase → Project Settings → API → rotate JWT secret | Update `SUPABASE_SERVICE_ROLE_KEY`; redeploy; verify upload and read |
| Backup project service-role key | Same, in the backup project | Update `.env.backup`; run a test backup |
| `age` key pair | Generate a new pair | Old backups stay readable with the old key — **keep the old private key** until those archives expire |
| Admin password | CLI script | Deletes all sessions; audit entry written |

**Rotating the Supabase JWT secret invalidates every key in that project**, including the `anon`
key. Nothing in this application uses `anon`, but any other tool pointing at the project will
break. Note also that **signed URLs are not invalidated by a key rotation** — Supabase signs them
with a separate internal key. See `SECURITY.md` §14.4.

A rotation is not complete until the dependent operation has been re-run successfully. Updating a
value without proving it works leaves the system broken in a way that only surfaces later.

---

## 8. Derived values

These are computed, not configured. Documenting them prevents someone adding a variable that
should not exist.

| Value | Formula |
|---|---|
| Public gallery URL base | `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET_PUBLIC}/` |
| Public object URL | base + object key |

The API returns absolute URLs built this way, which is why the client needs no Supabase variable.

---

## 9. The service-role key is the most dangerous value in the system

A Supabase `service_role` key **bypasses row-level security entirely** — Supabase's own
documentation states it grants unrestricted access to all Storage APIs. Consequences:

- It cannot be scoped to a single bucket. One key opens `admissions-private` and `gallery-public`
  alike.
- Anyone holding it can read, overwrite or delete every admission photograph.
- It must never reach the browser, a log, an error message, or a screenshot.

This is why the backup project uses a **separate** project with a separate key (D-12): it is the
only way to keep the "a compromised API cannot delete the backups" property that the previous
provider's bucket-scoped tokens provided.

---

## 10. Boot-time validation

The server should check, before accepting traffic:

1. Every required variable is present and non-empty.
2. `MONGODB_URI` parses and its scheme is correct.
3. `APP_ORIGIN` is an absolute `https://` URL with no trailing slash.
4. `TRUST_PROXY_HOPS` is an integer in range.
5. `SESSION_COOKIE_NAME` starts with `__Host-` when `NODE_ENV=production`.
6. `SUPABASE_URL` is an absolute `https://` URL, and the two bucket names are non-empty and
   different from each other.
7. On startup, **log the names of the variables that are set, never their values** — so a missing
   variable is diagnosable without a secret appearing in the logs.

If any check fails, exit non-zero with a message naming the variable and the reason. Do not start
in a degraded state.

**Validation is staged by slice.** The server validates only the variables it currently uses. As of
S01 that is `NODE_ENV`, `PORT`, `MONGODB_URI`, `MONGODB_DB_NAME`, `APP_ORIGIN`,
`SESSION_COOKIE_NAME`, `TRUST_PROXY_HOPS` and `LOG_LEVEL`. The Supabase variables become required at
S13, when storage is wired in — requiring them earlier would force credentials before anything
reads them.

**A missing database does not stop the process.** Bad configuration exits; an unreachable database
is logged and the process keeps serving, so `/health` can report `503` honestly. Reconnection after
a failed initial connect is not implemented yet (S14).
