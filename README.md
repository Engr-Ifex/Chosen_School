# Chosen School Website

Public website and private administrator dashboard for Chosen School (Primary and Secondary).

**Status:** planning complete and approved. The repository scaffold exists (ROADMAP slice S00).
No product behaviour is implemented yet.

## Structure

```text
chosen-school/
├── client/            React + Vite + TypeScript + Tailwind
├── server/            Express + TypeScript + Mongoose
├── docs/              Planning and technical documentation
├── package.json       npm workspaces root; install and run commands from here
├── tsconfig.base.json Shared strict TypeScript options
├── eslint.config.js   One flat config for both workspaces
├── .env.example       Configuration template — placeholders only
├── .gitignore
├── AGENTS.md
└── README.md
```

Both apps are npm workspaces with a **single lockfile at the root**. Install from the repository
root, not from inside `client/` or `server/`.

## Documentation

| Document | Purpose | Status |
|---|---|---|
| [docs/discovery.md](docs/discovery.md) | Product discovery: goals, audiences, scope, constraints | Approved 22 Oct 2026 |
| [docs/PRD.md](docs/PRD.md) | Functional and non-functional requirements | Approved 22 Oct 2026 |
| [docs/DESIGN.md](docs/DESIGN.md) | UX, information architecture, interaction patterns | Approved 22 Oct 2026 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System structure, hosting, security, backups | Approved 24 Oct 2026 |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | MongoDB collections and Mongoose schemas | Approved 24 Oct 2026 |
| [docs/API_SPEC.md](docs/API_SPEC.md) | HTTP API contract | Approved 24 Oct 2026 |
| [docs/TEST_PLAN.md](docs/TEST_PLAN.md) | Test levels, cases, and pass conditions | Approved 24 Oct 2026 |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Decision log, including rejected and superseded options | Living record, baseline approved 24 Oct 2026 |
| [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) | External services, credentials, status, verification log | Living record |
| [docs/SECURITY.md](docs/SECURITY.md) | Security controls, data protection, Nigerian legal obligations | Approved 24 Oct 2026 |
| [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) | Threats, abuse cases, residual risk | Approved 24 Oct 2026 |
| [docs/ENVIRONMENT_VARIABLES.md](docs/ENVIRONMENT_VARIABLES.md) | Every configuration value, secret or not | Living record |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Build order, owner actions, blockers | Approved 24 Oct 2026 (living) |
| [AGENTS.md](AGENTS.md) | Rules for AI agents working in this repository | Approved 24 Oct 2026 |

## Delivery stages

**Stage 1** — demonstration and familiarisation. Public site and dashboard, **no real admission
data**.

**Stage 2** — official production use with real personal data. Gated by `PRD.md` §4.4 (SG-01 to
SG-12) and `ARCHITECTURE.md` §12.2.

## Technology

React · Vite · TypeScript · Tailwind CSS · Express · Mongoose · MongoDB Atlas (Free) ·
Supabase Storage (selected, not yet provisioned) · Vercel (frontend) · Render (API)

## Before you deploy anything

Read `docs/ARCHITECTURE.md` §6 (verified provider limits) and §15 (question status). Two items can
block launch on their own:

- Frontend hosting plan eligibility for a school website (SG-01 / Q1).
- The database tier's suitability for production data (SG-02 / Q6).

No credentials, connection strings, or provider secrets belong in this repository.
