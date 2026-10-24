# CLAUDE.md — customer-support-agent

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> 📍 `github.com/nRouterGateway/customer-support-agent` (**public**).
> Everything committed here is world-readable. Treat every file as published. Never commit
> internal keys, project IDs, or internal endpoints. `AGENTS.md`/`GEMINI.md` are symlinks to this file.

## What this repo is

The in-process npm package `@nrouter_ai/support-agent` (**Rule #19**): a streaming customer-support agent library. It takes
an nRouter API key, a model and a static JSON knowledge index, and returns a stream of events. Retrieval is an
in-memory cosine search over the static JSON index built by `support-agent build-kb`; there is **zero database dependency** (no `pgvector`, no SQL migrations, no ORM, no database connection strings).

## Layout

| Path | Holds |
|---|---|
| `src/index.ts`, `src/node.ts` | Public entries `.` (the export list is the API) and `./node` (file-system helpers) |
| `src/cli.ts`, `bin/support-agent.mjs` | `support-agent build-kb` (`support-agent help` prints the flags); the bin loads `dist/`, so build first |
| `src/agent.ts` | The turn loop: small talk, retrieval, web search, booking and escalation offers, response cache |
| `src/knowledge/` | Chunk, fetch seed pages, build (full or `--incremental`), validate and store the index |
| `src/client.ts`, `src/cost.ts`, `src/errors.ts`, `src/pii.ts` | SDK client, cost event, safe errors and redaction, PII masking |
| `src/types.ts` | Config, events and host hooks (`onGap`, `onEscalation`) |
| `test/` | One `*.test.ts` per module; `test/guards.test.ts` holds the repository guards |
| `evals/` | `run-evals.ts` (the scorer, unit-tested offline) and `run.mjs` (live runner; see `evals/README.md`) |
| `examples/quickstart/`, `.env.example`, `e2e/` | The runnable example and its settings; the Playwright spec and its demo server |

## Invariants

- **One runtime dependency: `@nrouter_ai/sdk`, exact-pinned.** Every gateway call goes through the
  SDK client in `src/client.ts`; no raw `fetch` to the gateway — the one `fetch` in `src/` is the
  seed-page fetcher `src/knowledge/fetch.ts`. CI and `test/guards.test.ts` enforce both.
- **`src/index.ts` is edge-safe.** No `node:` import is reachable from it; only `src/node.ts` and
  `src/cli.ts` may import `node:` modules.
- **Nothing private in the tree.** `test/guards.test.ts` fails on a key-shaped string or a private
  infrastructure identifier in `src/`, `test/`, `examples/`, `evals/`, `bin/`, `README.md` or
  `package.json`. Other files (this one included) are not scanned — keep them clean by hand.
- **A web search is a second billed call**, made through the gateway on the same key; it is off
  unless the host configures it.
- **Trusted fields come from the host.** Audiences, identity and session id are read only from the
  `TrustedContext` the host passes, never from the request body.
- **A host is the host's concern.** This package documents no particular host's routes or deployments.

## Commands

```bash
npm ci
npm test            # vitest, offline: no network, no key
npm run typecheck   # tsc --noEmit
npm run build       # compiles to dist/
npx vitest run test/agent.test.ts   # one test file
npm run example     # build + examples/quickstart/server.mjs; reads .env (cp .env.example .env), billed
npm run e2e         # build + Playwright; needs NROUTER_API_KEY and a browser, never a default path
node evals/run.mjs  # live evals after a build; needs KB_PATH and NROUTER_API_KEY, billed
```

This package uses **npm** (`package-lock.json`), not pnpm. The Node floor is `engines.node` in
`package.json`. CI (`.github/workflows/ci.yml`) runs test, typecheck, build and the dependency check;
the key-needing paths (`example`, `e2e`, `evals/run.mjs`) never run there.

<!-- BEGIN GENERATED: permanent-rules-pointer (bootstrap.sh) -->

## The Permanent Rules — for Codex, Gemini CLI and Antigravity

You are reading this through `AGENTS.md` or `GEMINI.md`, which symlink to this file.
Claude Code receives the rules below automatically via `@import`; **your harness does
not**. They are mandatory all the same. Read the ones relevant to what you are about to
touch BEFORE editing — each path resolves from your home directory (`~/`).

**They are listed in READING ORDER, not alphabetically.** The first two are the
authority and apply to everything; the rest are path-scoped detail that matters only
when you touch that area. If you read nothing else, read the first one.

- `~/nr/nrouter-brain/sdlc/rules/00-permanent-rules.md`
- `~/nr/nrouter-brain/sdlc/rules/00-workspace-repos.md`
- `~/nr/nrouter-brain/sdlc/rules/10-testing.md`
- `~/nr/nrouter-brain/sdlc/rules/19-soc2-new-feature-checklist.md`
- `~/nr/nrouter-brain/sdlc/rules/20-tdd-and-fleet.md`
- `~/nr/nrouter-brain/nrouter-app/rules/02-multi-tenancy.md`
- `~/nr/nrouter-brain/nrouter-app/rules/03-credit-safety.md`
- `~/nr/nrouter-brain/nrouter-app/rules/05-frontend-standards.md`
- `~/nr/nrouter-brain/nrouter-app/rules/07-stripe-integration.md`
- `~/nr/nrouter-brain/nrouter-app/rules/11-api-routes.md`
- `~/nr/nrouter-brain/nrouter-app/rules/13-enterprise-features.md`
- `~/nr/nrouter-brain/nrouter-app/rules/17-virtual-keys.md`
- `~/nr/nrouter-brain/nrouter-app/rules/30-email-templates.md`
- `~/nr/nrouter-brain/nrouter-cortex/rules/00-cortex-rules.md`
- `~/nr/nrouter-brain/nrouter-frontend-ui/rules/40-image-blog-standards.md`
- `~/nr/nrouter-brain/nrouter-frontend-ui/rules/41-seo-geo-aeo-page-checklist.md`
- `~/nr/nrouter-brain/nrouter-frontend-ui/rules/42-homepage-design.md`
- `~/nr/nrouter-brain/nrouter-infra-cicd/rules/08-database.md`
- `~/nr/nrouter-brain/nrouter-infra-cicd/rules/15-startup-health.md`
- `~/nr/nrouter-brain/nrouter-infra-cicd/rules/16-infrastructure.md`
- `~/nr/nrouter-brain/nrouter-rust-gateway/rules/00-gateway-rules.md`
- `~/nr/nrouter-brain/nrouter-rust-gateway/rules/01-provider-contract.md`

`00-permanent-rules.md` is the authority: it carries the full prose of all
the rules, the Rule→Skill map, and the enforcement map showing which rules
auto-block versus which rely on discipline. Start there if you only read one.

<!-- END GENERATED: permanent-rules-pointer -->
