# AGENTS.md

**Status:** Approved by project owner, 24 October 2026.

Instructions for any AI agent working in this repository. Short by design — detail lives in `docs/`.

## 1. Repository state — read this first

**One public endpoint exists; the product does not.** ROADMAP slices S00–S03 are complete:/n`GET /api/v1/health`, `POST /api/v1/public/applications`, configuration validation, the error
envelope, request logging, four Mongoose models with a synthetic seed. There are no admin routes,
no authentication and no real pages yet.

Verified by inspection on 28 October 2026:

- `client/` and `server/` exist as npm workspaces with a single lockfile at the root.
- Git repository initialised; default branch `main`.
- Toolchain: **Node 22.22.2, npm 10.9.7**. No `pnpm`.
- TypeScript is pinned to **6.0.3** because `typescript-eslint` requires `<6.1.0`. Do not move to
  7.x without checking that constraint first.

Commands and their verification status are in §5.

## 2. Purpose and architecture

A public website and a private single-administrator dashboard for Chosen School (Primary and
Secondary). It will hold children's and parents' personal data, so correctness and privacy
outrank speed.

React + Vite + TypeScript + Tailwind on Vercel · Express + TypeScript on Render · MongoDB Atlas
with Mongoose · Supabase Storage for private photographs, public gallery images and backups. The
Vercel rewrite makes the API same-origin to the browser, which is what makes the session cookie
work. Full detail: `docs/ARCHITECTURE.md`.

## 3. Read before changing anything

| File | Why |
|---|---|
| `docs/DECISIONS.md` | What is already settled. Do not reopen an Accepted decision without a new reason; never delete a superseded one |
| `docs/ARCHITECTURE.md` §15 | What is still open, and what is blocked |
| `docs/ROADMAP.md` | Build order and what is waiting on the owner |

`README.md` indexes every document. Do not restate planning content in code comments or in new
files — link to it.

## 4. Layout and ownership

| Path | Contents | Created by | Notes |
|---|---|---|---|
| `client/` | React application | Developer | Not created yet. Root directory for the Vercel build |
| `server/` | Express API | Developer | Not created yet. Root directory for the Render service |
| `docs/` | Approved planning documents | Shared | Source of truth. Changes follow §11 |
| `.env.example` | Configuration template | Developer | Placeholders only, never real values |
| `AGENTS.md` | This file | Shared | Root-level rules only |

Two top-level apps, no monorepo tooling, no `apps/` directory — that layout is settled (ADR-007).

## 5. Commands

Run everything from the **repository root**. Both apps are npm workspaces with one lockfile at the
root, so installing inside `client/` or `server/` is wrong.

Verified on **28 October 2026**:

| Task | Command | Result |
|---|---|---|
| Install | `npm install` | 157 packages, 0 vulnerabilities |
| Development | `npm run dev` (client, `:5173`) · `npm run dev:server` (API) | Client served `HTTP 200` |
| Tests | `npm test` | 68 tests in 10 files — 54 pass, 14 skipped (database integration, opt-in) |
| Tests (with DB) | `RUN_DB_TESTS=1 npm test --workspace server` | 68 pass, requires a `mongod` binary |
| Seed | `npm run seed --workspace server` | 20 synthetic applications; refuses in production |
| Indexes | `npm run sync-indexes --workspace server` | Creates declared indexes; `autoIndex` is off by design |
| Lint | `npm run lint` | 0 problems |
| Type check | `npm run typecheck` | Both workspaces clean |
| Build | `npm run build` | Client bundle + server `dist/` |

**`npm ci` is not verified.** It aborted with this machine's bulk-delete guard
(`SAFE_DELETE_BULK_CONFIRM_REQUIRED`, 51 targets against a threshold of 50) and the partial
deletion had to be repaired with `npm install`. `npm ci --dry-run` resolves the lockfile without
error. Confirm it on CI or a clean machine before depending on it.

**Three conventions that will bite if forgotten:**

- The server uses ESM (`"type": "module"`, `module: nodenext`). **Relative imports need a `.js`
  extension** even though the source is `.ts` — `import { start } from './index.js'`.
- Only `client/src` and `server/src` are compiled. New top-level source directories need adding
  to the relevant `tsconfig.json`.
- **`typescript`, `@types/node` and `@types/express` are `dependencies`, not `devDependencies`.**
  Render may build from a production-only install, where devDependencies are absent and the build
  fails with `TS2688`. Do not move them back without also changing the build environment. Test-only
  packages stay in `devDependencies`, and `server/tsconfig.json` excludes `*.test.ts` so the build
  never needs them. Rationale: `docs/ARCHITECTURE.md` §11.1.

## 6. Coding conventions

- TypeScript `strict`. No `any` across a module boundary; if you need it, the type is wrong.
- **Validate at the boundary.** Zod on every request body and query. TypeScript types do not
  validate untrusted HTTP input, and trusting them is how invalid data reaches the database.
- Controllers stay thin: parse, call a service, shape the response. Business rules live in
  services, not in route handlers.
- **Explicit projections on every query.** Never return a whole Mongoose document to a client —
  a field added later would be exposed by default.
- Errors follow the envelope in `docs/API_SPEC.md` §1.4. Never leak a stack trace, a query, a
  connection string, or a submitted value.
- Store dates in UTC. Format at the edge. The school is UTC+1 with no daylight saving.
- No new dependency without stating in the change what it is for and why the existing stack
  cannot do it.

## 7. Security and secret handling

- `.env` is never committed. `.env.example` carries placeholders only.
- Nothing secret may use the `VITE_` prefix. Those values are inlined into the public bundle.
- The server enforces authorization on every `/admin` route. Client-side guards are usability,
  never security.
- **No real child, parent or guardian data outside production** — not in development, not in
  tests, not in a screenshot, not in a demo.
- A Supabase service-role key **cannot be scoped** — it opens every bucket in its project. Backups
  therefore live in a **separate project** whose key never reaches the server (D-12). Breaking that
  separation makes backups deletable by the system they protect.
- No personal data in logs, URLs, query strings or error messages.
- Full control set: `docs/SECURITY.md`. Threat analysis: `docs/THREAT_MODEL.md`.

## 8. Data and schema changes

- **MongoDB's flexible schema does not migrate anything.** Adding a field to a Mongoose schema
  changes what *new* writes look like; existing documents keep whatever shape they already had.
  There is no automatic backfill and nothing rewrites historical records.
- **Structural changes therefore need explicit work.** Adding a required field, renaming one,
  changing a type, or splitting a collection requires a **versioned migration script**, tests run
  against realistic data, a **fresh backup taken first**, and the owner's approval. Treat it as a
  release, not an edit.
- Schema changes go in the model and in `docs/DATA_MODEL.md` in the same change. Migration scripts
  are committed and numbered — never run ad hoc from a shell and then forgotten.
- **Never call `syncIndexes()` or enable `autoIndex` on boot in production.** Index changes run
  as an explicit, reviewed script.
- Removing or renaming a field is a data decision, not a refactor: it needs a backfill plan and
  the owner's approval.
- Permanent deletion follows the order in `docs/DATA_MODEL.md` §4.6 — object, then document, then
  audit entry. Reversing it orphans a photograph that can no longer be found.
- A new collection, or a new field holding personal data, requires updating `DATA_MODEL.md` and
  `DECISIONS.md` first.

## 9. Tests and definition of done

Work is done when **all** of the following hold:

1. Type check and lint pass.
2. Tests pass, at the level `docs/TEST_PLAN.md` names for that behaviour.
3. No secret, credential or real personal data appears in the diff.
4. The affected planning documents are updated in the same change.
5. The report distinguishes what was **verified** from what was merely written.

Areas that always need a specific test, because a silent failure is unrecoverable: authentication,
authorization on each admin route, file upload validation, private file access, and permanent
deletion. The IDs are in `docs/TEST_PLAN.md`.

## 10. Requires approval before changing

- Any decision marked **Accepted** in `docs/DECISIONS.md`.
- Scope boundaries in `docs/PRD.md` §4.2 — no parent accounts, payments, email, analytics, search.
- Security controls in `docs/SECURITY.md`.
- Any provider, hosting tier, or storage choice.
- Anything that costs money, including a provider's paid add-on.
- Any new collection, or any new field holding personal data.
- The repository layout.

## 11. When a decision changes

In this order, in one change:

1. `docs/DECISIONS.md` — new ADR, or mark the old one superseded with the reason.
2. The affected planning documents.
3. `docs/INTEGRATIONS.md`, `docs/ENVIRONMENT_VARIABLES.md`, `docs/ROADMAP.md`.
4. Then the code.

Updating the code first and the documents "later" means the documents describe a system that no
longer exists, and the next agent will believe them.

## 12. Integrations, MCP and blocked actions

- **No MCP connector is installed** in this environment, and no official connector exists for
  Atlas, Vercel, Render or Supabase (checked 29 October 2026). Do not claim access you do
  not have.
- Account creation, billing and dashboard configuration are **owner actions**. Never ask for a
  credential in a message; point to `docs/INTEGRATIONS.md` for where it belongs.
- When blocked, report exactly: what is needed, the provider and page, the plan or permission
  required, where the value should be stored, how it will be verified afterwards, and whether the
  rest of the task is unblocked. Then continue with whatever is independent.

## 13. Subsystem instruction files

None yet. Add `client/AGENTS.md` or `server/AGENTS.md` only when a subsystem has rules that do not
generalise — and keep root rules here rather than copying them down.
