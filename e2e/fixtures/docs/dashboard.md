# nRouter Dashboards

The nRouter web dashboard is accessible at `https://app.nrouter.ai` (or `http://localhost:5001` in local development). It provides self-serve multi-tenant management for API virtual keys, spend analytics, live request tracing, MCP servers, and model catalog exploration.

## Organization & Workspace Navigation

Every resource belongs to an Organization workspace accessible via `/[org]/...`:
- `/[org]/keys`: Virtual key lifecycle, rate limits, and spend ceilings.
- `/[org]/logs`: Real-time request log stream and exact list-price spend tracking.
- `/[org]/debug`: Interactive Request Debug & Trace Canvas and Answer Inspector.
- `/[org]/mcp-hub`: Centralized Model Context Protocol (MCP) server registry.
- `/[org]/tools-hub`: Catalog of exposed tools and schema introspection.
- `/[org]/models`: Live model catalog and benchmarks.
- `/[org]/playground`: Interactive multi-model prompt testing.
- `/[org]/billing`: Usage allowances, prepaid credits, and subscription tiers.

## Virtual Keys Management (`/[org]/keys`)

Virtual keys allow organizations to safely distribute access to developers, applications, or end-users while keeping total budget control:
- **Key Format:** Every key carries the prefix `sk-nrouter-...`.
- **Spend Ceilings:** Configure a hard spend limit in USD (e.g. $10, $50, $250). When the ceiling is reached, subsequent requests are refused with HTTP 402 without incurring overage.
- **Model Restrictions:** Restrict a virtual key to specific allowed models (e.g. allow only `gemini-3.8-flash` or `claude-haiku-4-5`, while blocking expensive models).
- **Rate Limits:** Enforce per-key and per-org requests-per-minute (RPM) and tokens-per-minute (TPM) ceilings, plus per-key requests per second (RPS) and requests per day (RPD) set by the plan.
- **CIDR & IP Allowlist:** Restrict key usage to specific corporate IP addresses or CIDR blocks.
- **Fallback Chains:** Pinned secondary models ensure seamless fallback when upstream providers return 429 quota exhaustion.

## Spend Logs & Cost Accounting (`/[org]/logs`)

The spend logs surface transparent accounting for every inference call:
- **Exact List-Price Settlement:** Billed at the exact list price of the served model.
- **Disjoint Token Breakdown:** Separates input, output, cache-read, cache-write (5m/1h), and reasoning tokens.
- **Cost Status:** Indicates `exact` for verified list pricing, or `unpriced` if unknown (costs are never reported as $0.00 unless explicitly free).
- **Latency & Observability:** Track time-to-first-token (TTFT), total duration, HTTP status code, and export logs to CSV.

## Request Debug & Trace Canvas (`/[org]/debug`)

The trace canvas provides high-precision debugging for every request:
- **Pipeline Canvas:** An interactive node graph detailing the request path across Edge WAF, safety checks, Cortex scoring, credit reservation, upstream dispatch, and settlement.
- **Timeline Gantt:** High-precision waterfall trace showing the 7 canonical execution stages:
  1. Edge WAF: Pre-auth size, method, and URI validation.
  2. Gate 0: Platform and tenant emergency safety hold evaluation.
  3. Phase 1: In-memory model access ACLs and virtual key validation.
  4. Phase 2: RPM, TPM, RPS, and RPD rate limit token bucket consumption.
  5. Phase 3: Cortex moderation and prompt injection classification over mTLS.
  6. Phase 4: Two-tier credit reservation and plan allowance hold.
  7. Phase 5: Upstream provider execution, streaming response, and spend settlement.
- **Answer Inspector:** Deep inspection drawer showing prompt transformations, system prompt injection checks, and response headers (`x-nr-request-id`, `x-nr-request-cost`).
