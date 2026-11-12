# @nrouter_ai/support-agent

Documentation-grounded customer support agent built on [nRouter](https://nrouter.ai).
Provides a streaming chat endpoint with source citations, optional web search fallback, and meeting hand-offs. Uses an in-memory JSON index by default or PostgreSQL/pgvector for shared tenant-scoped production deployments.

## Quick Example

Requires Node.js 22.18+ and an nRouter API key ([create one](https://app.nrouter.ai)).

```bash
git clone https://github.com/nRouterGateway/customer-support-agent.git
cd customer-support-agent
npm install
cp .env.example .env        # add NROUTER_API_KEY
npm run example             # http://127.0.0.1:4175
```

The sample server indexes `examples/quickstart/docs/` to `kb.json`. See [`examples/quickstart/server.mjs`](examples/quickstart/server.mjs), [`examples/quickstart/index.html`](examples/quickstart/index.html), and [`.env.example`](.env.example).

## Installation

```bash
npm install github:nRouterGateway/customer-support-agent
```

## Quick Start

1. **Build a knowledge base:**
```bash
NROUTER_API_KEY=sk-nrouter-... npx support-agent build-kb --docs ./docs --out index.json
```

2. **Serve the agent (Next.js App Router):**
```typescript
// app/api/chat/route.ts
import { createSupportAgent } from '@nrouter_ai/support-agent';
import { loadKnowledgeIndex } from '@nrouter_ai/support-agent/node';

// Load the index once at startup
const knowledge = await loadKnowledgeIndex('./index.json');

const agent = createSupportAgent({
  apiKey: process.env.NROUTER_API_KEY!,
  model: 'claude-haiku-4-5-20251001',
  knowledge,
});

export async function POST(req: Request) {
  // Tenancy and identity come strictly from host TrustedContext, never client payloads
  const ctx = { identity: { email: 'user@example.com' }, audiences: ['public'] };
  const body = await req.json();
  return new Response(agent.chatSSE(body, ctx), {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}
```

- `chat(req, ctx)`: returns `AsyncIterable<AgentEvent>`. `req` is untrusted client JSON; `ctx` is host `TrustedContext`.
- `chatSSE(req, ctx)`: returns `ReadableStream<Uint8Array>` formatted as Server-Sent Events.

## Configuration

| Option | Description |
|---|---|
| `apiKey` | nRouter virtual key (`sk-nrouter-...`) |
| `model` | Primary model ID or array of up to 3 fallbacks (see [Model Fallback](#model-fallback)) |
| `knowledge` | `KnowledgeStore` or `KnowledgeIndex` JSON |
| `knowledgeStrategy` | `rag` (default) or `cag` with static `knowledgeCorpus: SourceDoc[]` (`cagMaxContextChars` default 50,000) |
| `webSearch` | Optional web search provider when docs lack a confident answer |
| `booking` | `{ url, label? }` to emit meeting links via `action` events |
| `suggestions` | `true` or `{ max }` (1–5, default 3) to emit follow-up questions |
| `memoryStore` | Optional `(sessionId) => MemoryStore` from `@nrouter_ai/sdk` |
| `maskPii` | Mask emails and phone numbers before egress (default `true`) |
| `responseCache` | In-memory cache `{ ttlMs, maxEntries }` (default 5m, 100 entries; pass `false` to disable) |
| `tools`, `maxToolSteps` | Optional host tools (`AgentTool` from `@nrouter_ai/sdk`, default 4 steps/turn) |
| `agentName`, `instructions` | Agent name (default `Support`) and appended house rules |
| `topK`, `maxTokens`, `confidence` | Retrieval depth (5), max output tokens (1024), similarity thresholds (0.55/0.40) |
| `limits`, `hooks`, `baseURL` | Request ceilings, lifecycle callbacks, or gateway base URL override |

### `build-kb` options
```bash
support-agent build-kb --docs <dir> [--seed-url <u>]... --out <file> [--model m] [--dimensions n] [--incremental] [--skip-blocked | --skip-blocked-chunks] [--no-mask-pii]
```

## PostgreSQL Knowledge Store

For shared production indices, apply [`migrations/001_support_agent_pgvector.sql`](migrations/001_support_agent_pgvector.sql) (pgvector HNSW cosine search, 768-d). Run `examples/quickstart/sync-postgres.mjs` to rebuild and sync.

```typescript
import pg from 'pg';
import { createSupportAgent, DEFAULT_EMBEDDING_MODEL, DEFAULT_EMBEDDING_DIMENSIONS } from '@nrouter_ai/support-agent';
import { createPostgresKnowledgeStore } from '@nrouter_ai/support-agent/node';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const knowledge = createPostgresKnowledgeStore(pool, {
  embeddingModel: DEFAULT_EMBEDDING_MODEL,
  dimensions: DEFAULT_EMBEDDING_DIMENSIONS,
});
const agent = createSupportAgent({
  apiKey: process.env.NROUTER_API_KEY!,
  model: 'nrouter/auto',
  knowledge,
  userDataProvider: {
    async load({ tenantId, userId }) {
      const res = await pool.query('SELECT plan, status FROM accounts WHERE tenant_id = $1 AND user_id = $2', [tenantId, userId]);
      return res.rows[0] ? JSON.stringify(res.rows[0]) : null;
    },
  },
});
```

Tenant ID and user ID must come from server-side session `TrustedContext`, never client payloads.

## Web Search

Fallback web search runs when doc retrieval has low confidence or misses the answer:

```typescript
import { createSupportAgent, createNRouterWebSearch } from '@nrouter_ai/support-agent';

const agent = createSupportAgent({
  apiKey: process.env.NROUTER_API_KEY!,
  model: 'nrouter/auto',
  knowledge,
  webSearch: createNRouterWebSearch({
    apiKey: process.env.NROUTER_API_KEY!,
    allowedDomains: ['example.com'], // Restrict search to verified domains
    requireTerms: ['acme'],          // Search only when question contains term
    timeoutMs: 30_000,
  }),
});
```

Web search is a second billed call reflected in `cost` events (`costUsd`, `chatCostUsd`, `searchCostUsd`). Citations emit via `citations` events.

## Events, Fallback & Hooks

Frames stream as SSE `data: <json>\n\n`. Order: `token`… → `suggestions` → `action` → `cost` → `[DONE]`.

| Event | SSE JSON | Condition |
|---|---|---|
| `suggestions` | `{"nrouter_event":"suggestions","questions":["…"]}` | Generated from matching doc titles on completion |
| `action` | `{"nrouter_event":"action","action":"book_meeting","url":"…","label":"…"}` | Meeting requested or low confidence |
| `cost` | `{"nrouter_event":"cost","costUsd":0.002,"actualModel":"…","routingChain":"…"}` | Emitted per turn |

### Model Fallback
Pass `model: ['primary', 'backup']`. Moves to backup only on HTTP 404, 503, or 429 quota refusal before streaming starts. Never falls back on auth, budget, or guardrail blocks.

### Hooks
| Hook | Receives |
|---|---|
| `onGap` | Question docs could not answer confidently |
| `onCost` | What the turn cost, with `actualModel` and `routingChain` |
| `onTurnMetrics` | Per-turn `{ strategy, cacheHit, knowledgeMs, answerMs, totalMs, contextChars }` |
| `onFeedback` | Rating passed to `agent.feedback()` |
| `onToolCall` | Step progress for host tools (`running`, `done`, `error`) |
| `onEscalation` | Escalation needed (`human_requested`, `low_confidence`, `unresolved`) |
| `onError` | Non-fatal hook errors and internal issues |

## PII, Security & Limits

- **PII Masking:** Enabled by default (`maskPii: true`). Emails and phone numbers are masked before gateway calls.
- **KB Guardrail Recovery:** During `build-kb`, gateway guardrail blocks can be handled with `--skip-blocked` (skips refused doc) or `--skip-blocked-chunks` (skips specific chunk).
- **Security Boundary:** API key stays server-side. Request body `req` is untrusted; tenancy/identity strictly from server `ctx: TrustedContext`.
- **Limits:** Defaults: `maxMessages: 12`, `maxMessageChars: 4000`, `maxPageContextChars: 1000`.

## Development

Develop on `development` (`origin/development`); `main` only via PR (Rule #20).
