# Contributing

Thanks for your interest in improving the SEO·GEO Platform! This guide covers local
setup, the checks every change must pass, and the project's hard rules.

> The source of truth for architecture and conventions is **[CLAUDE.md](CLAUDE.md)**.
> Read it before making non‑trivial changes.

## Local setup

```bash
git clone <your-fork-url>
cd SEO-GEO
cp .env.example .env.local      # then fill in values
npm install
npm run dev                     # http://localhost:3000
```

The app runs **without a database** — data is stored as JSON under `.data/`
(gitignored). AI and CMS credentials are entered in the UI and stored encrypted, so you
need a real `ENCRYPTION_KEY` in `.env.local` (`openssl rand -base64 32`).

To exercise scheduled publishing locally, also set `CRON_SECRET` and run the worker:

```bash
npm run worker
```

## Quality gates (must pass before a PR)

Run all four — CI runs them on every push/PR:

```bash
npm run typecheck     # tsc --noEmit (strict; no `any` without justification)
npm run lint          # ESLint + Prettier
npm run check:i18n    # 10 locale message files must be in sync
npm test              # Vitest unit tests
```

A change is not "done" until all four are green.

## Internationalization rule (strict)

The UI ships in **10 languages**: `vi en zh ja ko fr de id hi th`.

- **Never hardcode UI strings.** All user‑facing text goes through `t('key')`; the
  strings live in `src/messages/{locale}.json`.
- **Adding/changing/removing a key means doing it in all 10 files**, with the same key
  set, structure, and ICU placeholders (`{n}`, `{date}`, …). `vi` and `en` are the
  hand‑written sources; the other 8 are translated to match.
- `npm run check:i18n` enforces this and must pass.

## Code conventions

- **TypeScript strict.** Avoid `any` (annotate the reason if unavoidable).
- File names `kebab-case`, components `PascalCase`, functions `camelCase`.
- Keep side effects (AI calls, CMS calls, DB/file writes) **out of render components** —
  put them in `src/lib/**` or API routes.
- Validate every API input at the boundary with **Zod**; never trust the client.
- Force AI output through a **Zod schema** and parse it; do not trust free‑form output.
- UI: use **Shopify Polaris** components; icons are **SVG** (Polaris Icons / Lucide),
  never emoji or Unicode glyphs.

## Project layout

| Path | Purpose |
|------|---------|
| `src/app/[locale]/` | Polaris UI pages (per‑locale routing) |
| `src/app/api/` | REST API routes |
| `src/lib/ai/` | AI providers, prompts, schema‑validated parsing |
| `src/lib/seo` · `aeo` · `geo` | Scoring engines |
| `src/lib/cms/` | WordPress / Wix / Shopify adapters (one interface) |
| `src/lib/publish/` | Publish core + scheduled‑job runner |
| `src/lib/store/` · `data/` | File‑based storage (`.data/`) + repo abstraction |
| `src/messages/` | i18n message files (10 locales) |
| `tests/` | Vitest unit tests |

## Pull requests

- Keep PRs focused; describe the change and how you tested it.
- Add/adjust tests for scoring, parsers, and CMS adapters (mock HTTP).
- If your change touches UI strings, update all 10 locales in the same PR.
- Never commit secrets, `.env.local`, or anything under `.data/`.

## Security

Found a vulnerability? Please follow **[SECURITY.md](SECURITY.md)** — report privately,
do not open a public issue.

By contributing, you agree your contributions are licensed under the project's
[MIT License](LICENSE).
