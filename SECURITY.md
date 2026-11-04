# Security Policy

Bunminer is a web-based database manager with full access to the databases it connects to.
Please read this before reporting a problem.

## Reporting a vulnerability

**Do not open a public issue for a vulnerability** — that would disclose it before a fix
exists. Report it privately instead.

Preferred channel — **GitHub private vulnerability reporting**:

1. Open the repository → **Security** tab → **Advisories** → **Report a vulnerability**.
2. Describe the issue, the affected version, and steps to reproduce.

Fallback email: **`security@example.com`** *(replace with a real address — we keep the
primary channel as GitHub's private reporting so no email infrastructure is required).*

## What to expect

- We'll acknowledge your report within **72 hours**.
- We'll confirm whether it's a valid vulnerability and give an estimated fix timeline.
- We use **coordinated disclosure**: please give us a reasonable window (typically 90 days)
  to ship a fix before you publish details.
- We'll credit you in the release notes and fix commit, unless you ask to stay anonymous.

## Supported versions

| Version | Supported |
|---------|-----------|
| `main` (latest) | ✅ yes |
| older tags / releases | ❌ no — please upgrade and re-test first |

We only patch the latest code. If an issue reproduces only on an old tag, upgrade and
confirm it still exists before reporting.

## Security model (important — read first)

- Bunminer is **not an authentication product**. It grants exactly the access that the
  database accounts it logs in with have. It authenticates using the **passwords of the
  remote databases it connects to** — there is intentionally no built-in two-factor
  authentication or passkeys.
- Because of that, a Bunminer deployment should not be exposed directly to the public
  internet without the hardening in `INSTALL.md` (TLS, firewall, least-privilege database
  accounts, IP allowlist). See `FORTIFICATION.md` for the full threat model.
- The SQLite engine ships **disabled** (`config/config.js` → `sqlite.enabled`), because
  SQLite files carry no password of their own.

## In scope

The Bunminer application code in this repository.

## Out of scope

- Vulnerabilities in deployments that are misconfigured or missing the `INSTALL.md` hardening.
- Anything that already requires an authenticated database session — a logged-in user with
  database access can run arbitrary SQL **by design**; that is the product's purpose, not a bug.
- The databases themselves, and any third-party service in front of Bunminer
  (nginx, Cloudflare, a CDN), unless the flaw is in how Bunminer itself is written.
- Denial-of-service caused by the database server or by exhausting the host's own resources,
  rather than by the application code.

## For maintainers

- Keep GitHub's **secret scanning** and **CodeQL** enabled on the repository (Settings →
  Code security). Both are free for public repos.
- CI runs `bun audit` (dependency CVE check), a secret-pattern scan, and a syntax check on
  every push — see `.github/workflows/ci.yml`.
- Never commit `data/secret.key` or any database password; both are excluded by `.gitignore`
  / entered at login respectively.
