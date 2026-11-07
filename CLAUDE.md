# CLAUDE.md — customer-support-agent

Public repo (`github.com/nRouterGateway/customer-support-agent`). Never commit secrets, keys, or internal endpoints. Develop on `development`; `main` only via PR (Rule #20).
Streaming customer-support agent on nRouter (Rule #19). Pinned dep `@nrouter_ai/sdk` (no raw fetch); calls `https://api.dev.nrouter.ai` or local `:4000`.
- **Core & Zero-DB:** Edge-safe core (`src/index.ts` has no `node:` imports; `src/node.ts`/`src/cli.ts` isolated). In-memory cosine search over JSON index (`support-agent build-kb`); optional pgvector.
- **Trust & Billing:** Tenancy/identity strictly from host `TrustedContext`. Web search is second billed call; costs stream via `cost` events.

## Commands
```bash
npm ci && npm test         # offline vitest (no network, no key)
npm run typecheck && npm run build
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
- `~/nr/nrouter-brain/sdlc/rules/21-owner-feature-review.md`
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
