# Security Policy

This project handles sensitive data — AI provider API keys and CMS credentials
(WordPress / Wix / Shopify). Please read this before deploying or contributing.

## Reporting a vulnerability

**Do not open a public GitHub issue for security problems.**

Report privately via **GitHub Security Advisories** → the repository's **Security**
tab → *Report a vulnerability*. We aim to acknowledge within a few business days.

When reporting, please include: affected version/commit, steps to reproduce, impact,
and any suggested fix.

## Security model (how the app protects data)

- **Credential encryption** — AI/CMS credentials are stored encrypted with
  **AES‑256‑GCM**; the key comes only from the environment (`ENCRYPTION_KEY`). They
  live in `.data/` (gitignored) and are never returned to the client.
- **Authentication & RBAC** — every API route checks permissions server‑side. The
  first account is the owner; staff roles (editor / viewer) are least‑privilege.
- **Passwords** — hashed with **scrypt + per‑user salt**; sessions use **httpOnly**
  cookies (set `Secure` behind HTTPS in production).
- **SSRF defense** — all outbound fetches (CMS calls, importing remote posts, fetching
  images) go through a guarded fetch that resolves DNS and blocks private/internal IP
  ranges, strips credentials, and disables automatic redirects.
- **No fabricated data** — AI output is forced through Zod schemas and parsed; prompts
  forbid inventing sources/URLs.
- **Rate limiting** — auth and publish endpoints are rate‑limited (in‑memory; use a
  shared store like Redis for multi‑instance deployments).

## Deployment hardening checklist

- [ ] Set a strong **`ENCRYPTION_KEY`** (32 bytes base64: `openssl rand -base64 32`).
      Rotating it makes previously stored credentials undecryptable — re‑enter them.
- [ ] Set a strong **`CRON_SECRET`** (`openssl rand -hex 16`) for the publish worker /
      `POST /api/jobs/run`.
- [ ] Serve over **HTTPS** (session cookies are marked `Secure` in production).
- [ ] Set **`DISABLE_SELF_REGISTRATION=true`** after creating the owner account.
- [ ] Keep `.data/` and `.env*` out of version control (already in `.gitignore`).
- [ ] For multiple instances, move file storage to Postgres and rate‑limiting to Redis.

## Supported versions

This is pre‑1.0 software; only the latest `main` receives security fixes.
