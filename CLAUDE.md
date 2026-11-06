# CLAUDE.md — customer-support-agent

Public repository (`github.com/nRouterGateway/customer-support-agent`). Never commit secrets, keys, or internal endpoints.

## Package: `@nrouter_ai/support-agent`
Streaming customer-support agent library built on nRouter (Rule #19).
- **In-process support agent:** Calls gateway via standard gateway client (`@nrouter_ai/sdk`). Configurable against `https://api.dev.nrouter.ai` or local `:4000`.
- **Zero-DB default:** In-memory cosine search over static JSON index (`support-agent build-kb`); optional pgvector store.
- **Pinned SDK dependency:** Single runtime dep `@nrouter_ai/sdk`. All gateway calls route through SDK; zero raw fetch.
- **Edge-safe core:** `src/index.ts` has no `node:` imports; Node/CLI helpers isolated in `src/node.ts` and `src/cli.ts`.
- **Host trust boundary:** Identity and tenancy come strictly from host `TrustedContext`, never untrusted client payloads.
- **Gateway integration:** Web search is a second billed gateway call; turn costs stream via `cost` events.
- **Branching (Rule #20):** Develops on `development` (`origin/development`), `main` locked down (PR only).

## Commands
```bash
npm ci && npm test         # offline vitest (no network, no key)
npm run typecheck          # tsc --noEmit
npm run build              # compile to dist/
npx vitest run <file>      # single test file
```


<!-- BEGIN GENERATED: permanent-rules-pointer (bootstrap.sh) -->
## The Permanent Rules — for Codex, Gemini CLI and Antigravity
Read in order before editing (`00-permanent-rules.md` is authority for all the rules):
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
<!-- END GENERATED: permanent-rules-pointer -->
