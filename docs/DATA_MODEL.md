# Chosen School Website — Data Model

**Document status:** Approved
**Version:** 1.0
**Date:** 24 October 2026
**Approved by:** project owner, 24 October 2026
**Technology:** MongoDB Atlas (Free / M0) with Mongoose
**Baseline:** Approved `PRD.md`, `DESIGN.md`

> This replaces the earlier PostgreSQL/Prisma model. There are no tables, no SQL migrations,
> and no foreign-key constraints — MongoDB enforces none of those. Where a relational model
> would have relied on the database for integrity, this document states explicitly what the
> application must enforce instead.

---

## 1. Modelling approach

MongoDB does not enforce referential integrity, so the model is designed to minimise the number
of places where integrity can be lost:

- **Embed what is owned by one record and never queried alone.** A student's details belong to
  an application; they are never listed independently. They are embedded.
- **Reference what has its own lifecycle.** Categories, sessions and audit records are separate
  documents.
- **Denormalise deliberately, and record it.** Where a value is copied (e.g. a category name for
  display), the duplication is stated so it is not mistaken for a bug.
- **Every list query sorts on an indexed field.** Atlas Free caps in-memory sorts at 32 MB and
  will error rather than silently spill to disk.
- **No unbounded arrays.** An array that grows with usage is a document that eventually exceeds
  the 16 MB limit.

### 1.1 Collections proposed

| # | Collection | Justification |
|---|---|---|
| 1 | `admins` | One credential record. Separate so that password material is never loaded with business data |
| 2 | `sessions` | Server-side sessions with revocation (ARCHITECTURE §7.2) |
| 3 | `applications` | Core admission records, FR-007–FR-022 |
| 4 | `enquiries` | FR-023, FR-025 |
| 5 | `visitrequests` | FR-024, FR-025 |
| 6 | `announcements` | FR-026–FR-029, one collection with a `kind` discriminator |
| 7 | `galleryitems` | FR-030 |
| 8 | `galleryvideos` | FR-031 — YouTube links, managed separately from photo uploads |
| 9 | `categories` | Shared taxonomy for gallery and announcements |
| 10 | `faqs` | FR-004 |
| 11 | `testimonials` | FR-032, FR-033 |
| 12 | `settings` | Singleton for school information, contact details, placement options |
| 13 | `pagecontents` | FR-002, FR-003 — fixed school-information sections (ADR-030) |
| 14 | `auditlogs` | Security events and permanent deletions |

**Deliberately not created:** a `students` collection (a student has no identity outside an
application), a `users` collection (one administrator), a `media` collection (photo metadata is
embedded in the record that owns it), a `revisions` collection (revision history is bounded and
embedded), and a separate `events` collection (see §7).

### 1.2 Conventions

- `_id` is an ObjectId unless stated.
- Timestamps are stored as BSON `Date` in **UTC**. Display conversion happens in the client.
  Nigeria is UTC+1 with no daylight saving, but the storage rule does not depend on that.
- `createdAt` / `updatedAt` come from Mongoose `timestamps: true`.
- Soft deletion uses `deletedAt: Date | null`. A null/absent value means not deleted.
- Enumerated values are stored as short lowercase strings, validated in the schema **and**
  re-validated by Zod at the API boundary.

---

## 2. `admins`

**Purpose:** the single administrator credential. No registration path exists.

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | String | yes | Lowercased, trimmed, unique |
| `passwordHash` | String | yes | Argon2id output |
| `passwordAlgo` | String | yes | e.g. `argon2id` — allows future algorithm change |
| `passwordParams` | Object | yes | `{ memoryCost, timeCost, parallelism }` recorded with the hash |
| `passwordUpdatedAt` | Date | yes | |
| `failedLoginCount` | Number | yes | Default 0 |
| `lockedUntil` | Date \| null | no | Temporary lockout |
| `lastLoginAt` | Date \| null | no | |

**Indexes:** unique on `email`.

**Sensitivity:** high. `passwordHash` and `passwordParams` must never be returned by any
endpoint — the schema marks them `select: false` and a `toJSON` transform removes them as a
second guard.

**Retention:** one record for the life of the site. Never deleted while the site operates.

---

## 3. `sessions`

**Purpose:** server-side session records enabling immediate revocation.

| Field | Type | Required | Notes |
|---|---|---|---|
| `tokenHash` | String | yes | SHA-256 of the cookie token. The raw token is never stored |
| `adminId` | ObjectId → `admins` | yes | |
| `createdAt` | Date | yes | |
| `lastSeenAt` | Date | yes | Updated on each authenticated request |
| `expiresAt` | Date | yes | `createdAt + 12h` — absolute ceiling **[OWNER]** |
| `idleExpiresAt` | Date | yes | `lastSeenAt + 60m` — sliding **[APPROVED]** |
| `revokedAt` | Date \| null | no | Set on logout or forced revocation |
| `ip` | String | no | Truncated; personal data, never logged in full |
| `userAgent` | String | no | Truncated to 255 chars |

**Indexes:**
- unique on `tokenHash`
- TTL on `expiresAt` with `expireAfterSeconds: 0`
- compound `{ adminId: 1, revokedAt: 1 }`

**Important:** the TTL monitor runs roughly once a minute, so an expired session may still exist
briefly. **The application must check `expiresAt` and `idleExpiresAt` on every request** and must
not rely on the TTL index for correctness. The index is housekeeping only.

**Deletion:** hard delete on logout. A password change deletes all sessions for the admin.
`revokedAt` is retained briefly for audit before deletion.

---

## 4. `applications`

**Purpose:** the admission application record (FR-007–FR-022).

### 4.1 Structure

```text
applications
├── student        (embedded object)
├── guardian       (embedded object)
├── placement      (embedded object)
├── signature      (embedded object)
├── healthInformation  (optional, sensitive)
├── photo          (embedded object or null)
├── revisions[]    (bounded array)
├── search         (derived, for querying)
└── deletedAt      (soft delete / Trash)
```

### 4.2 Fields

**`student`**

| Field | Type | Required | Validation |
|---|---|---|---|
| `surname` | String | yes | 1–80 chars, trimmed |
| `firstName` | String | yes | 1–80 chars, trimmed |
| `middleName` | String | no | ≤80 chars |
| `dateOfBirth` | Date | yes | Must be in the past; rejected if more than 100 years ago. **No age-eligibility rule is enforced** — the PRD defines none, and inventing one would be inventing school policy |
| `gender` | String | yes | `male` \| `female` — **approved 24 October 2026** (ADR-031, D-02) |
| `religion` | String | no | ≤60 chars |
| `ethnicity` | String | no | ≤60 chars |
| `stateOfOrigin` | String | no | ≤60 chars |
| `previousSchool` | String | no | ≤120 chars |
| `lastClassAttended` | String | no | ≤60 chars |

**`guardian`**

| Field | Type | Required | Validation |
|---|---|---|---|
| `name` | String | yes | 1–120 chars |
| `homeAddress` | String | yes | 1–300 chars |
| `phone` | String | yes | Normalised to digits; 7–15 digits (E.164 range). Stored normalised, displayed formatted |
| `email` | String | no | Valid email if present |
| `occupation` | String | no | ≤80 chars |
| `officeAddress` | String | no | ≤300 chars |

**`placement`**

| Field | Type | Required | Validation |
|---|---|---|---|
| `section` | String | yes | `primary` \| `secondary` |
| `classApplyingFor` | String | yes | Must be a member of `settings.placement.primaryClasses` or `secondaryClasses` for the chosen section. **Enforced server-side** |
| `academicSession` | String | yes | Must be a member of `settings.placement.academicSessions` |

Validating the class and session against the settings list is what prevents an invented class
name entering the database. The lists themselves are school-supplied and admin-managed, so no
school policy is hardcoded.

**`signature`**

| Field | Type | Required | Notes |
|---|---|---|---|
| `typedName` | String | yes | PRD §7 proposes required; **final requiredness is open** |
| `signedAt` | Date | yes | Server-set. Never client-supplied |

The record makes no claim about legal validity. The UI wording must not either.

**Other fields**

| Field | Type | Required | Notes |
|---|---|---|---|
| `healthInformation` | String | no | ≤1000 chars. **Sensitive.** Excluded from every list projection |
| `photo` | Object \| null | no | `{ key, contentType, width, height, bytes, uploadedAt }` — `key` is the object key in Supabase `admissions-private` |
| `submittedAt` | Date | yes | Server-set at insert |
| `revisions` | Array | no | See §4.4 |
| `deletedAt` | Date \| null | no | Set when moved to Trash |
| `deletedBy` | ObjectId \| null | no | |
| `search` | Object | yes | Derived; see §4.3 |

**No admission-outcome field exists.** The PRD explicitly excludes Pending/Accepted/Not
Accepted. Adding one later is a scope change.

### 4.3 Derived search fields

Search must cover "applicant name or parent/guardian phone" (PRD FR-018). Storing derived,
normalised values is what makes that query indexable:

- `search.studentName` — lowercased `surname + ' ' + firstName + ' ' + middleName`
- `search.guardianPhone` — digits only

These are written by a pre-save hook and are never accepted from the client.

**Query approach:** prefix-anchored case-insensitive regex on `search.studentName`
(`/^ade/i`), exact match on `search.guardianPhone`. Both use their indexes. A substring regex
would not. At 500 records/year this is comfortably fast either way, but the anchored form keeps
it that way.

### 4.4 `revisions` — bounded edit history

PRD FR-019 requires recording that the administrator edited a record and preserving original
values "where practical". This model interprets that as a bounded field-level history:

| Field | Type | Notes |
|---|---|---|
| `at` | Date | When the edit was saved |
| `by` | ObjectId → `admins` | Who |
| `changedFields` | [String] | Dotted paths, e.g. `guardian.phone` |
| `before` | Object | Only the changed fields' previous values |
| `after` | Object | Only the changed fields' new values |

Bounded to the **most recent 50 revisions**; older entries are dropped. This keeps the document
far below 16 MB while satisfying the requirement. A full immutable history would need its own
collection — **not proposed**, because the requirement says "where practical".

**Sensitive handling:** if a revision captures `healthInformation`, the previous value is stored
too. That is a second copy of sensitive data, and it is covered by the same retention and
deletion rules as the live field. Permanent deletion must remove revisions as well.

### 4.5 Indexes

| Index | Serves |
|---|---|
| `{ deletedAt: 1, submittedAt: -1 }` | Default list, newest first |
| `{ deletedAt: 1, 'placement.section': 1, 'placement.classApplyingFor': 1, 'placement.academicSession': 1, submittedAt: -1 }` | Filtered list |
| `{ 'search.studentName': 1 }` | Name search |
| `{ 'search.guardianPhone': 1 }` | Phone search |

Every list query sorts on `submittedAt`, which appears in the compound index, so Atlas never
needs an in-memory sort.

### 4.6 Deletion lifecycle

| Action | Effect |
|---|---|
| Move to Trash | `deletedAt = now`, `deletedBy = admin`. Record disappears from normal lists; appears in Trash |
| Restore | `deletedAt = null`. The original `submittedAt` is preserved, so ordering is unaffected |
| Permanent delete | Document removed, **and** the private photo object removed from Supabase Storage, **and** an `auditlogs` entry written |

The order matters: delete the database document last. If the object delete fails, the record is
still present and the operation can be retried. Deleting the record first would orphan an
unreachable photograph with no way to find it.

---

## 5. `enquiries`

| Field | Type | Required | Validation |
|---|---|---|---|
| `name` | String | yes | 1–120 chars |
| `phone` | String | yes | Normalised digits |
| `email` | String | no | Valid if present |
| `section` | String | yes | `primary` \| `secondary` |
| `message` | String | yes | 1–2000 chars |
| `status` | String | yes | `new` \| `reviewed` \| `responded`, default `new` |
| `statusUpdatedAt` | Date \| null | no | |
| `archivedAt` | Date \| null | no | Archive, not delete |
| `createdAt` | Date | yes | |

**Indexes:** `{ archivedAt: 1, createdAt: -1 }`, `{ status: 1, archivedAt: 1 }`.

**Deletion:** archiving only. There is no Trash for enquiries — settled (Q11), not open. Trash,
restore and permanent deletion apply to applications only. If the school later wants permanent
deletion of enquiries, that is a scope addition requiring a new decision.

---

## 6. `visitrequests`

| Field | Type | Required | Validation |
|---|---|---|---|
| `name` | String | yes | 1–120 chars |
| `phone` | String | yes | Normalised digits |
| `email` | String | no | Valid if present |
| `section` | String | yes | `primary` \| `secondary` |
| `preferredDate` | Date | yes | Not in the past (server-checked against UTC date) |
| `preferredTime` | String | yes | `HH:mm`, 24-hour. **Free-text times are rejected** |
| `message` | String | no | ≤1000 chars |
| `status` | String | yes | `new` \| `reviewed` \| `responded` |
| `archivedAt` | Date \| null | no | |
| `createdAt` | Date | yes | |

**No confirmation field.** The PRD is explicit that a request is not a booking, and the only
statuses are New/Reviewed/Responded to. Adding a "confirmed" state would be inventing a product
decision and would make it possible for the UI to imply a confirmed appointment.

**Indexes:** `{ archivedAt: 1, preferredDate: 1 }`, `{ status: 1, archivedAt: 1 }`.

---

## 7. `announcements` — one collection, two kinds

**Why one collection rather than `announcements` + `events`:** both share the draft/publish
workflow, category, expiry, and the same admin editor (`DESIGN.md` §6.7). Two collections would
duplicate every one of those rules and force the public "News & Events" page to merge two
result sets. A discriminator is the simpler model.

| Field | Type | Required | Notes |
|---|---|---|---|
| `kind` | String | yes | `announcement` \| `event` |
| `title` | String | yes | 1–160 chars |
| `categoryId` | ObjectId → `categories` | no | Scope must be `announcement` |
| `body` | String | yes | Sanitised limited HTML from the structured editor |
| `isUrgent` | Boolean | yes | Default false. Affects presentation only — **no publishing bypass** |
| `status` | String | yes | `draft` \| `published` |
| `publishedAt` | Date \| null | no | Set on first publish |
| `expiresAt` | Date \| null | no | Auto-hides after this instant |
| `event` | Object \| null | conditional | Required when `kind = 'event'` |
| `event.startDate` | Date | conditional | |
| `event.endDate` | Date | conditional | Must be ≥ `startDate` |
| `createdAt` / `updatedAt` | Date | yes | |

**Validation:** a schema-level validator enforces that `event` is present exactly when
`kind = 'event'`. A conditional requirement like this cannot be expressed as "required" on the
field alone, so it needs an explicit validator.

**Public visibility rule** (one place, one definition):

```
status = 'published'
AND (expiresAt is null OR expiresAt > now)
```

**Indexes:** `{ status: 1, kind: 1, publishedAt: -1 }`,
`{ status: 1, kind: 1, 'event.startDate': 1 }`, `{ expiresAt: 1 }`.

**Open:** whether events carry a time of day. The PRD specifies start and end dates; the design
flags date/time handling as unresolved (Q12). Only dates are modelled until that is settled.

---

## 8. Gallery — images and video links

Photos and videos are stored separately because they are fundamentally different: one is an
uploaded object with a lifecycle, the other is a reference to content hosted elsewhere. They
share only an admin screen.

### 8.1 `galleryitems`

| Field | Type | Required | Notes |
|---|---|---|---|
| `storageKey` | String | yes | UUID key in Supabase `gallery-public` |
| `contentType` | String | yes | `image/webp` |
| `width` / `height` | Number | yes | Intrinsic dimensions, prevents layout shift |
| `bytes` | Number | yes | |
| `altText` | String | yes | Required — `DESIGN.md` §8 requires alternative text for informative images |
| `caption` | String | no | ≤200 chars |
| `categoryId` | ObjectId → `categories` | no | |
| `order` | Number | yes | Manual ordering |
| `isPublic` | Boolean | yes | **Default false** |
| `publishedAt` | Date \| null | no | Set when made public |
| `deletedAt` | Date \| null | no | Trash |
| `createdAt` / `updatedAt` | Date | yes | |

**The visibility rule:** an uploaded image has `isPublic = false` and `publishedAt = null`. It
becomes public only through an explicit administrator action. This is the single control that
keeps an upload from appearing on the public site by accident.

**Indexes:** `{ isPublic: 1, categoryId: 1, order: 1 }`, `{ deletedAt: 1 }`.

**Relationship to admission photos:** none. They live in different buckets, different
collections, and there is no code path that moves one into the other. An admission photograph
cannot become a gallery image except by being uploaded again deliberately.

### 8.2 `galleryvideos`

FR-031 requires the administrator to add, edit and remove YouTube links. No video is ever
uploaded to this system.

| Field | Type | Required | Notes |
|---|---|---|---|
| `youtubeId` | String | yes | The 11-character video id, unique |
| `title` | String | yes | 1–120 chars |
| `order` | Number | yes | |
| `isPublic` | Boolean | yes | Default false |
| `publishedAt` | Date \| null | no | |
| `deletedAt` | Date \| null | no | |
| `createdAt` / `updatedAt` | Date | yes | |

**Only the video id is stored — never the submitted URL.** Storing a raw URL means storing
attacker-influenced text that will eventually be rendered as a link or an `iframe src`; an id
validated against `/^[A-Za-z0-9_-]{11}$/` cannot carry a payload. The URL is parsed once, at the
API boundary, and discarded.

**Indexes:** unique on `youtubeId`; `{ isPublic: 1, order: 1 }`.

**Public rendering:** the client embeds `youtube-nocookie.com` behind a click-to-load
placeholder, so no third-party script or cookie is loaded until a visitor asks for the video.
This follows `discovery.md` §11's instruction to avoid unnecessary third-party scripts.

**Deletion:** hard delete — there is no stored object to clean up.

---

## 9. `categories`

| Field | Type | Required | Notes |
|---|---|---|---|
| `scope` | String | yes | `gallery` \| `announcement` |
| `name` | String | yes | 1–60 chars |
| `slug` | String | yes | Lowercase, hyphenated, generated from `name` |
| `order` | Number | yes | |

**Indexes:** unique compound `{ scope: 1, slug: 1 }`.

**Why a collection rather than a list in settings:** renaming a category would otherwise require
rewriting every document that references it by name. With a stable `_id`, a rename is one write.

**Deletion:** blocked if referenced, with a `409` and the usage count. The administrator must
reassign the affected items before the category can be removed. Silent orphaning of content is
worse than an extra click. Approved 24 October 2026.

---

## 10. `faqs`

| Field | Type | Required | Notes |
|---|---|---|---|
| `question` | String | yes | 1–300 chars |
| `answer` | String | yes | Sanitised HTML |
| `order` | Number | yes | |
| `isPublished` | Boolean | yes | Default false |
| `deletedAt` | Date \| null | no | |
| `createdAt` / `updatedAt` | Date | yes | |

**Indexes:** `{ isPublished: 1, order: 1 }`, `{ deletedAt: 1 }`.

---

## 11. `testimonials`

| Field | Type | Required | Notes |
|---|---|---|---|
| `authorName` | String | yes | 1–100 chars |
| `text` | String | yes | 1–1500 chars, plain text only |
| `source` | String | yes | `public` \| `admin` |
| `consentGiven` | Boolean | yes | Must be `true` when `source = 'public'` |
| `consentAt` | Date \| null | no | |
| `status` | String | yes | `pending` \| `approved` \| `rejected` |
| `publishedAt` | Date \| null | no | Null = not public |
| `adminNotes` | String | no | **Private.** Never returned publicly |
| `createdAt` / `updatedAt` | Date | yes | |

**Validation:** a schema validator rejects `source = 'public'` unless `consentGiven` is true.
This is the machine-checkable part of the consent requirement; the wording of the consent
itself is still an open PRD item.

**Public visibility:** `status = 'approved'` **and** `publishedAt` is set. Both conditions are
required, so approval alone never publishes.

**Indexes:** `{ status: 1, publishedAt: -1 }`, `{ createdAt: -1 }`.

**Retention:** rejected submissions are retained for a short period for accountability, then
purged. Period is **open**.

---

## 12. `settings` — singleton

A single document with a fixed `key: 'site'`, created by a seed step. Queries use `findOne`, and
a unique index on `key` prevents a second document from existing.

| Field | Type | Notes |
|---|---|---|
| `key` | String | Always `'site'`, unique |
| `school.name` | String | Official name, school-supplied |
| `school.shortName` | String | |
| `school.address` | String | School-supplied |
| `school.phone` | String | |
| `school.email` | String \| null | |
| `school.whatsapp` | String \| null | Digits, for the `wa.me` link |
| `school.mapUrl` | String \| null | A link, not an embedded map — avoids third-party scripts |
| `social[]` | Array | `{ platform, url }`, bounded to 10 |
| `branding.logoKey` | String \| null | Public bucket key |
| `placement.primaryClasses[]` | [String] | School-supplied, admin-managed |
| `placement.secondaryClasses[]` | [String] | School-supplied, admin-managed |
| `placement.academicSessions[]` | [String] | e.g. `2026/2027` — format is school-supplied |
| `placement.currentSession` | String \| null | Default for the public form |
| `updatedAt` / `updatedBy` | | |

**Superseded for classes (S04 correction, 3 Nov 2026).** `primaryClasses` and `secondaryClasses`
are no longer read for validation or for the public form. The approved class list is fixed school
data in `server/src/config/school.ts`, so the admission form works before anything is seeded. The
fields remain in the schema to avoid a data migration and are still written by the seed; remove
them in a future schema change. `academicSessions` / `currentSession` remain administrator-
controlled and are still read.

**Why placement options live here:** `discovery.md` leaves the class list and academic session
naming open, and the PRD forbids inventing them. Storing them as admin-managed data means the
form can be correct without hardcoding a single class name. The server validates submissions
against these lists (§4.2).

**Sensitivity:** public by design — this is the contact information shown on the public site.
The exception is `branding.logoKey`, which is only a storage key.

---

## 13. `pagecontents` — fixed school-information sections

**Purpose:** FR-002 and FR-003. The long-form text of the About, Academics and Admissions pages,
editable by the administrator within a structure fixed in code (ADR-030).

| Field | Type | Required | Notes |
|---|---|---|---|
| `page` | String | yes | `about` \| `academics-primary` \| `academics-secondary` \| `admissions` |
| `sections` | Array | yes | Fixed keys per page |
| `sections[].key` | String | yes | Must belong to that page's fixed set |
| `sections[].body` | String | yes | Sanitised HTML. An empty string is valid until the school supplies text |
| `sections[].updatedAt` | Date | yes | |
| `updatedAt` / `updatedBy` | | yes | |

**Fixed section keys**

| Page | Keys |
|---|---|
| `about` | `history`, `mission`, `vision` |
| `academics-primary` | `introduction`, `classesOffered`, `teachingApproach`, `facilities`, `extracurricularActivities` |
| `academics-secondary` | same as primary |
| `admissions` | `requirements`, `process` |

**Validation**
- `page` must be one of the four values.
- Every key in that page's set must appear **exactly once**. A missing key is a validation error,
  so a public page can never render a half-built document.
- An unknown key is **rejected, not ignored** — silently dropping it would let a client believe it
  had saved something.
- `body` is sanitised against the same allowlist as announcement bodies.

**Indexes:** unique on `page`. Four documents in total.

**Visibility:** public read. This is school-facing marketing text, not personal data.

**Why a collection rather than fields on `settings`:** `settings` is a singleton of contact and
configuration values. Page content is four documents that change independently, edited on a
different screen. Keeping them apart means editing the About page cannot accidentally change the
school's phone number.

**Why the keys are fixed in code:** the PRD forbids the administrator from changing page structure.
A key set the school could edit would be exactly that.

**Deletion:** none. The documents are seeded once and edited, never removed.

**Content responsibility:** an empty `body` means the school has not supplied that section. The
public page must show an honest "information not yet available" state. No text is ever generated
on the school's behalf.

---

## 14. `auditlogs`

**Purpose:** a trace for security-relevant events, in particular the permanent deletion of a
child's record.

| Field | Type | Required | Notes |
|---|---|---|---|
| `at` | Date | yes | |
| `actorId` | ObjectId \| null | no | Null for failed logins against unknown accounts |
| `action` | String | yes | Enumerated; see below |
| `targetType` | String \| null | no | e.g. `application` |
| `targetId` | ObjectId \| null | no | |
| `ip` | String | no | Truncated |
| `userAgent` | String | no | Truncated |
| `meta` | Object | no | Small, non-sensitive detail (e.g. counts) |

**Actions:** `auth.login.success`, `auth.login.failure`, `auth.logout`,
`auth.password.changed`, `application.permanently_deleted`, `gallery.image_unpublished`,
`settings.updated`.

**Indexes:** `{ at: -1 }`, `{ action: 1, at: -1 }`.

**Never stored:** passwords, tokens, form contents, health information, photograph data. A
permanent-deletion entry records *that* a record was deleted and its type — not the personal
data that was in it, or the audit log becomes a shadow copy that outlives the deletion.

**Retention — proposed 12 months**, then purged. This is a decision, not a default; it interacts
with the retention policy that is still open.

---

## 15. Sensitive data map

| Classification | Where | Handling |
|---|---|---|
| **High — children's data** | `applications.student`, `.healthInformation`, `.photo`, `.guardian` | Admin-only. Never in list projections. Never in logs or URLs. Photo only via authenticated stream |
| **High — credentials** | `admins.passwordHash`, `sessions.tokenHash` | `select: false`, never serialised, never logged |
| **Moderate — contact data** | `enquiries`, `visitrequests` | Admin-only |
| **Public by design** | published `announcements`, `galleryitems`, `faqs`, approved `testimonials`, `settings`, `pagecontents` | Served by public endpoints |
| **Internal** | `auditlogs` | Admin-only, never public |

**Field projections are explicit.** Every list endpoint names the fields it returns rather than
returning whole documents, so a new sensitive field added later is not exposed by default.

---

## 16. Retention and deletion summary

| Collection | Trash? | Permanent deletion | Retention rule |
|---|---|---|---|
| `applications` | Yes | Admin-confirmed, removes photo + revisions + writes audit entry | **Open** — school must approve |
| `enquiries` | No — archive only | Not in PRD | **Open** |
| `visitrequests` | No — archive only | Not in PRD | **Open** |
| `announcements` | Draft/unpublish | Hard delete | Retained for administrative reference after expiry |
| `galleryitems` | Yes | Removes the Supabase object | **Open** |
| `faqs` | Yes | Hard delete | n/a |
| `testimonials` | Reject/unpublish | Hard delete | Rejected: short period, **open** |
| `sessions` | n/a | Hard delete / TTL | 12h max |
| `pagecontents` | No | Never deleted — four seeded documents, edited in place | Retained for the life of the site |
| `auditlogs` | n/a | Not deletable by the admin | Proposed 12 months |

**Nothing may be permanently deleted automatically until the school approves a retention
policy.** No scheduled purge job should be written before that decision, because its existence
would imply a policy that has not been agreed.

---

## 17. What MongoDB does not give you, and where the application must compensate

| Relational guarantee | Here |
|---|---|
| Foreign keys | Application-level checks on every write that sets `categoryId` |
| `ON DELETE CASCADE` | Explicit: permanent deletion of an application removes its photo object and its revisions in a defined order (§4.6) |
| Unique constraint on a business key | Unique indexes (`admins.email`, `sessions.tokenHash`, `categories.{scope,slug}`, `settings.key`) |
| `NOT NULL` | Mongoose `required` plus Zod at the API boundary — two independent checks |
| Check constraints | Schema validators (event block, consent flag, end date ≥ start date) |
| Transactions | Available because Atlas Free is a replica set, but used only where a single-document write is genuinely insufficient — which, by design, is nowhere in this model |

**Multi-document atomicity is deliberately avoided.** Every write path is designed to be a
single-document update, so a crash mid-request cannot leave two documents inconsistent.
