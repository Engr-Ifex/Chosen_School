# Chosen School Website — Threat Model

**Document status:** Approved
**Version:** 1.0
**Date:** 24 October 2026
**Approved by:** project owner, 24 October 2026
**Companion:** `SECURITY.md` (controls), `ARCHITECTURE.md` (structure)

> A threat model of a system that does not exist yet. Its purpose is to decide what to build
> before building it, and to name the risks that will remain afterwards so they are accepted
> deliberately rather than discovered.

---

## 1. Method and scope

Lightweight STRIDE, applied to the approved architecture. The goal is not exhaustive enumeration;
it is to make sure no category of failure is missing and that each significant threat has a named
control or an explicit acceptance.

**In scope:** the public site, the administrator dashboard, the API, the database, object storage,
backups, and the deployment chain.

**Out of scope:** provider-internal compromise (a breach inside Vercel, Render, Cloudflare or
MongoDB), the school's own devices, and physical security of the school's premises. These are
recorded in §8 rather than modelled.

---

## 2. Assets

| Asset | Why it matters | Worst outcome |
|---|---|---|
| Admission applications | Names, dates of birth, addresses, phone numbers, health notes about children | Identification and targeting of children and families |
| Student photographs | Images of identifiable children | Irreversible exposure; cannot be un-published |
| Guardian contact details | Phone, email, home address | Fraud, harassment, phishing |
| Administrator credential | Full access to everything above | Total disclosure |
| Session tokens | Same, while valid | Total disclosure for up to 12 hours |
| Backups | A complete copy of everything | A single archive discloses the whole dataset |
| Audit records | Evidence of who did what | Loss of accountability |
| Public content | Reputation; consent status | Publication of a child's image without permission |
| Availability | Parents must be able to apply | Missed admission deadline; loss of trust |

---

## 3. Actors

| Actor | Motivation | Capability |
|---|---|---|
| Anonymous internet user | Curiosity, scraping, opportunism | Automated scanning, form flooding |
| Motivated attacker | Data theft, extortion | Targeted exploitation of known weaknesses |
| Automated bot | Spam, credential stuffing | High volume, low sophistication |
| Administrator (legitimate) | Doing their job | Full authorized access; also the most likely source of accidental disclosure |
| Developer (you) | Building and maintaining | Production access by necessity — the largest trusted party |
| Provider insider | Not modelled | Out of scope |
| Parent or applicant | Submitting data; possibly disputing it | Submitting false or malicious content |

**The developer is an insider risk and should be treated as one.** Access to production data
should be occasional, deliberate and logged, not routine. Testing uses synthetic data, so there is
no reason to look at a real child's record during development.

---

## 4. Trust boundaries

```
   Untrusted
      │
      ▼
 ┌─────────────┐        ┌──────────────────┐        ┌─────────────┐
 │  Browser    │──TLS──▶│ Vercel (public)  │        │  Attacker   │
 │  (public)   │        │  static bundle   │        │             │
 └─────────────┘        └────────┬─────────┘        └──────┬──────┘
                                 │ /api/* rewrite          │
                                 ▼                         │
                        ┌──────────────────┐               │
                        │ Render (Express) │◀──────────────┘
                        │  trusted server  │   (same surface
                        └───┬──────────┬───┘    as any client)
                            │          │
              ┌─────────────▼──┐   ┌───▼──────────────┐
              │ Atlas          │   │ R2 app buckets   │
              │ (data + auth)  │   │ private + public │
              └────────────────┘   └──────────────────┘
                            ▲
                            │ read-only, from developer machine
              ┌─────────────┴──────┐        ┌──────────────────┐
              │ Backup job (local) │───────▶│ R2 backups bucket│
              └────────────────────┘        └──────────────────┘
```

**Three boundaries carry all the risk:**

1. **Browser → Vercel.** Everything crossing is public. Nothing the browser sends about itself is
   trustworthy.
2. **Render → Atlas.** Holds the data. Protected by TLS, SCRAM and a broad network allowlist — the
   weakest link in the design.
3. **Developer machine → backups.** Holds a complete copy of everything. One stolen laptop with
   an unencrypted archive and the key on the same disk is a total breach.

---

## 5. Attack surface

| Entry point | Exposure | Notes |
|---|---|---|
| `POST /public/applications` | Anonymous, unauthenticated | Accepts a file. The highest-value target |
| `POST /public/enquiries`, `/visit-requests`, `/testimonials` | Anonymous | Flooding and spam |
| `POST /auth/login` | Anonymous | Credential stuffing |
| `/admin/*` | Session required | The prize |
| `GET /admin/applications/:id/photo` | Session required | Direct access to images of children |
| `GET /api/v1/health` | Anonymous | Must leak nothing |
| Atlas connection string | Network | Broad allowlist, password-only defence |
| Provider dashboards | Authenticated | Equivalent to every secret |
| Repository | Authenticated | Must contain no secrets |
| Backup archives | Offline | Complete dataset |

---

## 6. Threat catalogue

Likelihood and impact are judgements for this specific system, not generic scores.

| ID | Threat | STRIDE | Likelihood | Impact | Control | Residual | Verify |
|---|---|---|---|---|---|---|---|
| T-01 | Credential stuffing against the single admin account | Spoofing | High | Critical | Argon2id; per-IP and per-email limits; lockout; generic errors; MFA on provider accounts | Medium | SEC-02 |
| T-02 | Session theft via XSS | Spoofing | Low | Critical | `HttpOnly`; no `localStorage`; CSP; no third-party scripts; sanitised content | Low | CSP test |
| T-03 | Session fixation | Spoofing | Low | High | Token generated server-side at login, never accepted from client | Very low | Unit test |
| T-04 | CSRF on admin mutations | Tampering | Medium | High | `SameSite=Lax` + exact `Origin` check + per-session token | Low | API-A04/05 |
| T-05 | Accessing an application by guessing its id | Info disclosure | Low | Critical | Object-level check; `404` instead of `403` | Low | API-A01–A06 |
| T-06 | Private photograph reachable publicly | Info disclosure | Medium | Critical | Separate buckets; no public access config; UUID keys; streamed only via authenticated route | Low | SEC-03 |
| T-07 | Malicious upload — polyglot, SVG with script, zip bomb | Elevation | Medium | High | Magic-byte check; decode-and-re-encode; SVG and animation rejected; 5 MB cap | Low | SEC-04 |
| T-08 | EXIF/GPS in a child's photograph reveals home location | Info disclosure | High if unmitigated | High | Re-encode strips metadata | Very low | F-06 |
| T-09 | Stored XSS via announcement or page-content body | Elevation | Medium | Critical | Allowlist sanitiser on both surfaces; CSP; admin-only authoring | Low | Unit test |
| T-10 | NoSQL injection via query operators (`$ne`, `$gt`) | Tampering | Medium | Critical | Primitive coercion; strict schemas; never pass raw client objects into filters | Low | Integration test |
| T-11 | Mass assignment of `deletedAt`, `status`, `publishedAt` | Tampering | Medium | Medium | Immutable fields rejected with a validation error | Low | API-A11 |
| T-12 | Rate-limit bypass via forged `X-Forwarded-For` | Tampering | High | High | Correct `TRUST_PROXY_HOPS`; verified, not guessed | **Medium** | SEC-02 |
| T-13 | Account enumeration via differing errors or timing | Info disclosure | Medium | Low | Single generic error for every failure path | Low | API test |
| T-14 | Backup archive stolen and read | Info disclosure | Medium | Critical | Encrypted before upload; key held offline | Low | Drill |
| T-15 | Compromised API deletes the backups | Destruction | Medium | Critical | Backup token not present on the server | Low | Env review |
| T-16 | Dependency compromise | Elevation | Low | Critical | Lockfile; `npm ci`; minimal dependency surface; review before adding | **Medium** | `npm audit` |
| T-17 | Secret leaked via a `VITE_` variable or committed `.env` | Info disclosure | Medium | Critical | Prefix discipline; `.gitignore`; scan the built bundle | Low | SEC-06 |
| T-18 | Personal data written to logs | Info disclosure | High | High | No request-body logging; redaction; truncated IPs | **Medium** | Log review |
| T-19 | Atlas pauses after 30 days idle; site fails silently | DoS | Medium | High | Uptime monitor on `/health`; documented manual resume | **Medium** | Monitor |
| T-20 | Cold-start timeout: parent sees failure, record was saved | Integrity | High | Medium | Never treat timeout as success; honest retry UI; duplicates accepted by design | **Medium** | T2 |
| T-21 | Public forms flooded | DoS | High | Medium | Per-IP rate limits; body size caps | Medium | SEC-02 |
| T-22 | Developer reads real children's records | Info disclosure | Medium | Critical | Synthetic data in all non-production work; least privilege; audit trail | **Medium** | Process |
| T-23 | "Permanent" deletion leaves copies — revisions, photo, backups | Compliance | Medium | High | Defined delete order; audit entry; documented backup retention | **Medium** | Drill |
| T-24 | Provider dashboard account takeover | Elevation | Low | Critical | MFA; unique strong passwords; no shared accounts | Low | SEC-08 (Stage 2) |
| T-25 | Testimonial or photograph published without consent | Compliance | Medium | High | Approval gate; consent flag enforced in schema; publication is a separate action | Low | E2E-11/12 |
| T-26 | Bulk PDF emailed or left on a shared printer | Info disclosure | Medium | High | Health data excluded from bulk; `no-store` | **Medium** | API-A26 |
| T-27 | Origin spoofing via a crafted `Host` header | Spoofing | Low | Medium | Exact match against `APP_ORIGIN`, not the request host | Low | Unit test |
| T-28 | Oversized upload exhausts memory | DoS | Medium | Medium | 5 MB file cap; JSON body cap; streaming where possible | Low | F-03 |
| T-29 | Erasure request, but the record persists in an older backup | Compliance | High | Medium | Retention policy must state backup behaviour; documented restore-then-reapply procedure | **Medium** | Policy |
| T-30 | Phishing of the administrator's password | Spoofing | Medium | Critical | No email channel exists to phish through; provider MFA | Medium | Process |

### Residual risks that are accepted, not mitigated

Five residuals are **Medium** and cannot be reduced further within the free-tier constraint.
They should be accepted in writing, by the school, before Stage 2:

1. **T-12** — rate limiting depends on a proxy configuration that is only provable on the real
   deployment.
2. **T-16** — supply chain risk exists in any Node project; it is reduced, not eliminated.
3. **T-18** — logging discipline is a code-review property, not an enforced control.
4. **T-22** — the developer must have production access to operate the system.
5. **T-29** — backups inherently retain deleted data until they expire.

Add **T-19** and **T-20**: both are direct consequences of free-tier behaviour that cannot be
engineered away, only monitored and disclosed.

---

## 7. Abuse cases

Short narratives, because a table hides the sequence.

### AC-1 — "The scraper"

An automated client polls `/public/applications` looking for a listing. It gets `404`; the route
does not exist. It tries `/admin/applications` and gets `401`. It then probes for `/api/v1/admin/applications`
with various `X-Forwarded-For` values to see whether rate limiting can be evaded.

**What must hold:** no public route returns application data; `401` reveals nothing about whether
records exist; the rate limiter keys on the real client IP, not a header the client controls.

### AC-2 — "The impatient parent"

A parent submits the admission form during a Render cold start. The proxy times out after 40
seconds. The record was saved. The parent presses submit again.

**What must hold:** the timeout is never rendered as success. The retry either creates a second
record — acceptable, duplicates are handled manually by design — or the UI clearly states the
outcome is unknown. A success message on an unsaved record is the failure that matters.

### AC-3 — "The curious relative"

Someone knows a child applied. They guess at URLs: `/uploads/abc123.jpg`, `/media/applications/...`,
`/api/v1/admin/applications/<id>/photo`.

**What must hold:** the private bucket has no public route at all, so the first two are not merely
protected — they do not resolve. The third returns `401` without revealing whether that id exists.
The object key is a UUID, not a name or a sequential number.

### AC-4 — "The former administrator"

The school replaces the person who had dashboard access. The old password is still valid, and
there is a session open on a phone.

**What must hold:** a documented CLI procedure changes the password and **deletes all sessions**.
Without the second part, the old phone keeps working for up to 12 hours — which is exactly the
window that matters after a departure.

### AC-5 — "The helpful developer"

Under time pressure, the developer copies the production Atlas URI into a local `.env` to
reproduce a bug, then pushes a branch that accidentally includes it.

**What must hold:** `.gitignore` covers `.env`; the boot-time validator refuses to start against
a production URI when `NODE_ENV` is not `production`; and the repository is private. Any one of
these alone is thin; together they make the accident survivable rather than fatal.

---

## 8. Out of scope

Recorded so their absence is deliberate:

- Compromise inside a provider's infrastructure.
- The school's own devices, email account, or physical premises.
- Social engineering of the school by telephone.
- Nation-state actors.
- Denial of service at network scale — the providers absorb what they absorb; nothing here is
  designed to resist a volumetric attack.
- Legal compliance itself — modelled in `SECURITY.md` §13 as obligations, not as threats.

---

## 9. Review triggers

Re-open this model when any of the following happens:

1. A second administrator or any staff account is added — the single-role assumption disappears.
2. A custom domain is purchased — the cross-origin boundary changes.
3. The hosting provider, database tier, or storage provider changes.
4. Any new public form or upload surface is added.
5. A real data breach, or a near miss.
6. Before Stage 2, unconditionally.
7. Annually, or when the NDPC issues new guidance.

---

## 10. What this model does not establish

It does not establish that the system is secure. It establishes that the significant threats have
been named, that each has a control or a recorded acceptance, and that the controls have a test
that will show whether they work. **None of those tests has been run.**
