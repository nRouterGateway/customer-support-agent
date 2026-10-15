# @nrouter_ai/support-agent

A support agent that answers from your own documentation, built on [nRouter](https://nrouter.ai).
You bring a folder of docs and one API key; it gives you a streaming chat endpoint with source
links, an optional web search for what the docs miss, and a "book a meeting" hand-off. The default
knowledge index is one JSON file; production deployments can use the optional PostgreSQL/pgvector
store when they need a shared, tenant-scoped index.

It works for any product or team: a SaaS help centre, an internal IT or HR desk, a course, an
open-source project, a shop's returns and shipping questions.

## Run the example (5 minutes)

You need Node.js 22.18 or newer and an nRouter API key ([create one](https://app.nrouter.ai)).

```bash
git clone https://github.com/nRouterGateway/customer-support-agent.git
cd customer-support-agent
npm install
cp .env.example .env        # then put your key in NROUTER_API_KEY
npm run example             # http://127.0.0.1:4175
```

The first start indexes the sample docs in `examples/quickstart/docs/` and writes `kb.json`. Ask it
"how do I get a refund?" and it answers from those files, with the source linked.

For the nRouter support deployment, point `DOCS_DIR` at a synced copy of the public MDX docs in
`nrouter-frontend-ui/resources/web/content/docs` and set `DOCS_BASE_URL=https://nrouter.ai/docs`.
That source currently includes the account, dashboard guides, API references, frameworks, and SDK
guides. Keep this larger corpus on RAG; CAG is for small corpora that fit entirely in the model
context. The deployment must receive updated docs when the frontend docs change, then rebuild the
knowledge index before serving traffic.

Everything is in two files you can read in a few minutes:
[`examples/quickstart/server.mjs`](examples/quickstart/server.mjs) (the agent and its endpoint) and
[`examples/quickstart/index.html`](examples/quickstart/index.html) (a chat page that reads the stream).
Every setting is explained in [`.env.example`](.env.example).

## Build your own

1. **Point it at your docs.** Set `DOCS_DIR` to a folder of `.md`, `.mdx` or `.txt` files and
   `DOCS_BASE_URL` to where they are published (that is what the source links point to). A `title:`
   in a file's frontmatter becomes the source name. Public pages can be indexed alongside the folder:
   `npx support-agent build-kb --docs ./docs --seed-url https://example.com/help --out kb.json`.
   Restart after docs change; the example refreshes the index and reuses embeddings for unchanged
   chunks. In a production deployment, run that refresh as part of the docs publishing/deploy flow.
2. **Give it a name and house rules.** `AGENT_NAME` and `AGENT_INSTRUCTIONS` (tone, what to do when
   it cannot help, what never to promise). The agent already answers only from your docs, cites
   them, and treats page and web text as data, never as instructions.
3. **Pick a model.** `MODEL` is any model id your key can call. A small, fast model is usually
   right for support; pass a list in code to add fallbacks (see [Model Fallback](#model-fallback)).
4. **Decide what happens when the docs miss.** Leave `WEB_SEARCH_DOMAINS` empty and the agent says
   it does not know. Set it to your own sites and it searches those first (see [Web Search](#web-search)).
   Set `BOOKING_URL` and it offers a meeting link when a visitor asks for sales or a demo, or when
   it has no confident answer.
5. **Put it in your app.** Install the package into your own project and copy the handful of lines
   from `server.mjs`; a Next.js route is shown under [Quick Start](#quick-start).

   ```bash
   npm install github:nRouterGateway/customer-support-agent
   ```

6. **Connect your chat UI.** Send `POST { "messages": [{ "role": "user", "content": "…" }] }` and
   read the stream; the frames are listed under [Events & Wire Format](#events--wire-format).
   `index.html` is a complete reader in about 60 lines.
7. **Learn from it.** The `onGap` hook receives every question the docs could not answer: that
   list is what to write next. `onCost` receives what each turn cost; `onFeedback` receives ratings;
   `onEscalation` tells you when a visitor needs a person (see [Hooks](#hooks)).

### Before you go live

The example is a local demo. An endpoint that spends your API key needs, at minimum:

- **A rate limit and a bot check** on the route. Anyone who can reach it can spend your credits.
- **A key of its own, with a budget.** Create a separate nRouter key for the agent and set a spend
  limit on it in the dashboard, so the worst case is a number you chose.
- **Your login, not the request body, for identity.** Pass who the visitor is through the second
  argument (`ctx`); see [Security](#security).
- **The key on the server only.** Never ship it to the browser.

## Installation

```bash
npm install github:nRouterGateway/customer-support-agent
```

This builds the package from source on install, so it needs Node.js 22.18 or newer.

## Quick Start

1. **Build a knowledge base**
```bash
NROUTER_API_KEY=sk-nrouter-... npx support-agent build-kb --docs ./docs --out index.json
```

2. **Serve the agent (Next.js App Router)**
```typescript
// app/api/chat/route.ts
import { createSupportAgent } from '@nrouter_ai/support-agent';
import { loadKnowledgeIndex } from '@nrouter_ai/support-agent/node';

// Load the index once at startup
const knowledge = await loadKnowledgeIndex('./index.json');

const agent = createSupportAgent({
  apiKey: process.env.NROUTER_API_KEY!,
  model: 'claude-haiku-4-5-20251001',
  knowledge
});

export async function POST(req: Request) {
  // IMPORTANT: The host must authenticate and rate-limit this route.
  const ctx = { identity: { email: 'user@example.com' }, audiences: ['public'] };
  const body = await req.json();
  return new Response(agent.chatSSE(body, ctx), {
    headers: { 'Content-Type': 'text/event-stream' }
  });
}
```

## Configuration

| Option | Description |
|---|---|
| `apiKey` | nRouter virtual key (`sk-nrouter-...`) |
| `model` | The chat model ID, or an ordered list of up to three: the first is the primary, later entries are fallbacks (see [Model Fallback](#model-fallback)) |
| `defaultHeaders` | Optional extra headers sent on every gateway call. None are added by default. Ignored when you pass your own `client` |
| `booking` | Optional `{ url, label? }`. Offers a booking link through the `action` event. `url` must be `https:` and at most 2048 characters; `label` is at most 60 characters and defaults to `Book a meeting` |
| `suggestions` | Optional `true` or `{ max }` (1 to 5, default 3). Emits related follow-up questions through the `suggestions` event. Off by default |
| `knowledge` | `KnowledgeStore` or `KnowledgeIndex` JSON |
| `knowledgeStrategy`, `knowledgeCorpus` | Keep `rag` (default) for embedding retrieval, or opt into `cag` by supplying the complete approved static `SourceDoc[]` corpus. CAG places every eligible document in each prompt; it is intended for small corpora and does not support tenant-private docs in the shared corpus |
| `cagMaxContextChars` | Maximum total characters in the CAG corpus (default 50,000); startup fails instead of silently truncating docs |
| `webSearch` | Optional web search provider, used only when the knowledge base has no confident answer. `createNRouterWebSearch({ apiKey })` searches through the gateway with the same key (see [Web Search](#web-search)) |
| `memoryStore` | Optional `(sessionId) => MemoryStore` from `@nrouter_ai/sdk`. When set and the host passes `ctx.sessionId`, the stored history is authoritative: only the latest user turn from the request is appended, and earlier turns in the request body are ignored |
| `maskPii` | Mask emails and phone numbers before text leaves the process (default `true`) |
| `responseCache` | In-memory cache that replays the events of an identical request (same body and same `ctx`). On by default: `{ ttlMs, maxEntries }`, defaults 5 minutes and 100 entries. A replayed turn makes no gateway call. Pass `false` to turn it off |
| `agentName`, `instructions` | The agent's name (default `Support`) and house rules appended to the built-in system prompt |
| `topK`, `maxTokens`, `confidence` | Retrieval depth (default 5), answer length (default 1024) and the similarity thresholds for `high` / `medium` confidence (defaults 0.55 / 0.40) |
| `tools`, `maxToolSteps` | Optional host tools (`AgentTool` from `@nrouter_ai/sdk`) and the most tool steps per turn (default 4) |
| `limits` | Request size limits (see [Limits](#limits)) |
| `hooks` | Host callbacks (see [Hooks](#hooks)) |
| `baseURL`, `client` | Override the gateway base URL, or pass an SDK client you already hold |

### `build-kb` options

```
support-agent build-kb --docs <dir> [--seed-url <u>]... --out <file>
    [--model m] [--dimensions n] [--base-url u] [--base-docs-url u]
    [--incremental] [--skip-blocked] [--no-mask-pii]
```

`--incremental` reuses the vectors of unchanged chunks from the existing `--out` file, so only new or changed text is embedded again.

## PostgreSQL knowledge store

The JSON index remains the zero-database option. For a shared production index, the Node entry
exports `createPostgresKnowledgeStore` and `syncPostgresKnowledgeIndex`; install `pg` in the host
application and apply [`migrations/001_support_agent_pgvector.sql`](migrations/001_support_agent_pgvector.sql)
once to a PostgreSQL database with permission to enable the `vector` extension. The migration uses
pgvector HNSW cosine search with the default 768-dimension embedding model.

Run `examples/quickstart/sync-postgres.mjs` from a deploy job after documentation changes. It rebuilds
the index, reuses embeddings for unchanged chunks from `kb.json`, and publishes a complete snapshot
for the selected tenant. Publication uses a transaction and swaps the active generation atomically;
failed ingestion leaves the previous index available. Deleted documents disappear on the next
successful full sync. Set `NROUTER_API_KEY`, `DATABASE_URL`, and `TENANT_ID` for the job.

### Automatic nRouter dashboard-doc ingestion

The support-agent repository includes a manual ingestion workflow at
`.github/workflows/ingest-dashboard-docs.yml`. Add the workflow
`.github/workflows/dispatch-support-agent-doc-ingest.yml` from the frontend repository to dispatch it
when docs under `resources/web/content/docs/` change on `main`. Configure these GitHub Actions
secrets:

- In `Diptesh2006/customer-support-agent`: `NROUTER_API_KEY`, `DATABASE_URL`, and `TENANT_ID`.
- Also in `Diptesh2006/customer-support-agent`: `FRONTEND_DOCS_READ_TOKEN`, a fine-grained token
  with Contents read access to the private `nRouterGateway/nrouter-frontend-ui` repository.
- In `nRouterGateway/nrouter-frontend-ui`: `SUPPORT_AGENT_DISPATCH_TOKEN`, a fine-grained token with
  Actions write access to `Diptesh2006/customer-support-agent`.

Apply `migrations/001_support_agent_pgvector.sql` to the target database once before enabling the
workflow. The ingestion job checks out the exact frontend commit that triggered it, restores the
previous public-doc embedding index from the Actions cache, incrementally re-embeds changed chunks,
and publishes the complete tenant index transactionally. It logs and skips only docs rejected by
the gateway's embedding guardrails; review those logged URLs if the docs corpus changes materially.
The workflow never logs the tenant ID or database URL. The deployed agent must use the same database
and tenant ID through `createPostgresKnowledgeStore`; this workflow publishes the index but does not
deploy or reconfigure the agent service. A manual dispatch can also re-sync a chosen frontend commit.

At runtime, construct the store using the same embedding model and dimensions, then pass the
organization ID from the backend's verified login session as `TrustedContext.tenantId`:

```typescript
import pg from 'pg';
import { createSupportAgent, DEFAULT_EMBEDDING_MODEL, DEFAULT_EMBEDDING_DIMENSIONS } from '@nrouter_ai/support-agent';
import { createPostgresKnowledgeStore } from '@nrouter_ai/support-agent/node';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const knowledge = createPostgresKnowledgeStore(pool, {
  embeddingModel: DEFAULT_EMBEDDING_MODEL,
  dimensions: DEFAULT_EMBEDDING_DIMENSIONS,
});
const agent = createSupportAgent({ apiKey: process.env.NROUTER_API_KEY!, model: process.env.MODEL!, knowledge });

// In your authenticated route, derive this from your server-side session:
// agent.chatSSE(body, { tenantId: session.organizationId, sessionId: session.id });
```

Never take `tenantId` or `userId` from the chat body or browser page context. The store requires the
tenant ID and scopes every vector search to it. To add private account facts, configure a server-side
provider that queries only records matching both authenticated IDs. For example, add this to the
agent config (adapt table and column names to your app):

```typescript
userDataProvider: {
  async load({ tenantId, userId }) {
    const result = await pool.query(
      'SELECT plan, status, credit_balance FROM accounts WHERE tenant_id = $1 AND user_id = $2',
      [tenantId, userId],
    );
    return result.rows[0] ? JSON.stringify(result.rows[0]) : null;
  },
}
```

The authenticated route must call `agent.chatSSE(body, { tenantId: session.organizationId, userId: session.userId })`.
Account data is loaded on the server for each turn and added to the prompt alongside vector search
results. Dynamic account lookups bypass response caching so stale account data is not replayed. Keep
account-specific records in their application tables; do not place private account records in the
shared documentation index. If a lookup fails, the agent returns an error instead of answering
without account context.

## Web Search

When retrieval over your docs is not confident, the agent can search the web before it answers.
`createNRouterWebSearch` does that through the gateway's own search grounding: one SDK call on the
key you already have, no second vendor.

```typescript
import { createSupportAgent, createNRouterWebSearch } from '@nrouter_ai/support-agent';

const agent = createSupportAgent({
  apiKey: process.env.NROUTER_API_KEY!,
  model: 'nrouter/auto',
  knowledge,
  webSearch: createNRouterWebSearch({
    apiKey: process.env.NROUTER_API_KEY!,
    model: 'nrouter/auto',   // the default; any model your gateway serves with web search
    timeoutMs: 30_000,       // 1000 to 60000, default 8000
  }),
});
```

The pages the search cites arrive in the `citations` event, ahead of the doc matches on a turn that
searched. A search that fails or runs out of time contributes no sources and the answer still streams.

The search is a second billed call, and the `cost` event counts it: on a searched turn `costUsd` is
the answer plus the search, with `chatCostUsd` and `searchCostUsd` showing the parts. If either part
is unknown (an unpriced model, or a search that was sent and never reported back) the total is
`unpriced` and the unknown part is `null`; it is never a partial sum and never zero. The total does
not include the question's embedding call.

### When the search runs

Docs first. The search runs in two cases:

- retrieval found nothing close (low confidence), before the answer is written;
- retrieval found pages that look related but do not answer the question. The model is told to say
  so with a marker instead of writing "that is not in the docs"; the marker is never shown, the
  search runs, and the answer is written again from what it found. That first reply is a billed
  call and is counted in `cost`. This second case is off when you pass host `tools`, so they never
  run twice.

A greeting is not a question. A message that is only "hi", "thanks", "ok" or a sign-off matches
nothing in any docs, yet there is nothing to look up: it is answered in one line with no search, no
`onGap` report and no booking offer. "Hi, how do I get a refund?" is a question and is treated as one.

### Keeping the search on your own sites

By default the search covers the open web. A support agent usually should not: give it your sites,
and optionally the words a question must contain before a search is worth paying for.

```typescript
webSearch: createNRouterWebSearch({
  apiKey: process.env.NROUTER_API_KEY!,
  allowedDomains: ['example.com'],   // bare hostnames; subdomains included
  requireTerms: ['acme'],            // optional: search only when the question names one
}),
```

- `allowedDomains` is enforced on what comes back. Every cited page is checked by its real address
  (the search engine's redirect links are resolved with one un-followed request each, never trusted
  by their label), and the citations you get carry that real address. If any cited page is outside
  the list, or the answer cites nothing, the whole result is discarded and the agent answers from
  your docs alone. The engine is asked to stay on those sites, but that request is not the control;
  the check on the result is. A discarded search was still made, so it is still charged and reported.
- `requireTerms` is a cheap gate, not a boundary: a question that mentions the word passes it. It
  exists to skip the search, and its charge, for plainly unrelated questions. A skipped search sends
  nothing and the visitor is not told one ran.
- An empty or malformed `allowedDomains` is refused when the provider is created.

Any object with a `label` and a `search(query, { maxResults, signal })` method works as a provider,
and may define `shouldSearch(query)` to gate its own searches.
It may return a plain list of sources, or `{ sources, cost }` and set `reportsCost: true` if it knows
what each search costs.

## Usage

### FAQ cache first, RAG for the long tail

The agent checks a small, reviewed cache of common nRouter questions before it
retrieves documents or calls a model. A recognized FAQ returns its documented
answer and citation directly, with no embedding, retrieval, or generation call.
Questions that do not confidently match one of the FAQ intents continue through
the configured knowledge strategy—RAG over the full nRouter documentation corpus
by default. Keep FAQ answers aligned with their linked docs; do not add account-
specific facts to this shared cache.

### `chat(req, ctx)`
Returns an `AsyncIterable<AgentEvent>` for custom handling. `req` is the untrusted input (e.g., the JSON request body containing messages). `ctx` is the `TrustedContext` supplied by the host's authentication, containing user identity and audiences.

### `chatSSE(req, ctx)`
Returns a `ReadableStream<Uint8Array>` formatted as Server-Sent Events, directly usable in HTTP responses. Parameters are the same as `chat`.

## Events & Wire Format
The agent streams events as Server-Sent Events (`text/event-stream`). Events include `tool_call`, `confidence`, `citations`, `token`, `suggestions`, `action`, `cost`, `error`, and `done`.

Each frame is `data: <json>\n\n`. Within one response the order is `token`… → `suggestions` → `action` → `cost` → `[DONE]`; `suggestions` and `action` are optional and neither is sent on an errored response.

| Event | SSE JSON | When |
|---|---|---|
| `suggestions` | `{"nrouter_event":"suggestions","questions":["…"]}` | `suggestions` is configured and the answer completed. Questions are built from the titles of the other retrieved documents |
| `action` | `{"nrouter_event":"action","action":"book_meeting","url":"…","label":"…"}` | `booking` is configured and either the visitor's latest message asks for a meeting, a demo, sales or commercial terms, or confidence is `low` |

The `cost` event carries `costUsd` and `status` (`exact` or `unpriced`), and, when the gateway reports them, `actualModel` (the model that served the answer) and `routingChain` (`direct` or `fallback:<n>`).

`suggestions` and `action` are deterministic and make no extra model call. The booking URL comes only from your config: the model never sees or produces it. Suggestion text is derived from document titles, so treat it as untrusted and render it as plain text.

## Model Fallback
Pass `model: ['primary', 'backup']` to name fallbacks. The agent moves to the next entry only when the gateway refuses the call as unavailable (HTTP 404 `model_not_found`, HTTP 503, or HTTP 429 `insufficient_quota`) before any token has been streamed and before any of your `tools` has run. It never falls back on an authentication, credit, budget, ordinary rate-limit or guardrail refusal, or on an abort, so a fallback cannot change who pays or how. At most `model.length - 1` fallbacks happen per request. The `cost` event's `actualModel` names the model that answered.

## Hooks
Configure `hooks` to observe a turn. The package stores nothing; the host persists what it wants. A hook that throws is reported to `onError` and never breaks the answer.

| Hook | Receives |
|---|---|
| `onGap` | A question the docs could not answer confidently |
| `onCost` | What the turn cost, with `actualModel` and `routingChain` when known |
| `onTurnMetrics` | Per-turn `{ strategy, cacheHit, knowledgeMs, answerMs, totalMs, contextChars }`; use the same eval set under RAG and CAG to compare latency/context size. CAG still incurs model input cost and its confidence score is not a semantic similarity score |
| `onFeedback` | A rating passed to `agent.feedback()` |
| `onToolCall` | Each tool step (`running`, `done`, `error`) |
| `onEscalation` | A turn that needs a person, with a `reason`: `human_requested` (the visitor asked for a human), `low_confidence` (no confident answer), or `unresolved` (a thumbs-down rating) |
| `onError` | Errors from other hooks and non-fatal internal failures |

## PII and Gateway Guardrails

When a virtual key enforces a PII redact guardrail, the gateway refuses pre-call content containing PII (pre-call redact == refuse). To ensure reliable operation:

- **Automatic Pre-call Masking:** Enabled by default (`maskPii: true`). Email addresses are masked as `[email]` and phone numbers (7+ digits with standard delimiters) are masked as `[phone]` at the gateway egress boundary (`streamChat` and `embed`). Non-PII numbers such as ISO dates, versions (e.g. `1.2.3`), prices, and short numbers (e.g. `402`, `7731`) are preserved.
- **Knowledge Base Build Recovery:** During `build-kb`, if the gateway refuses an embeddings batch with `guardrail_blocked`:
  - **Refuse-and-Name (default):** Re-embeds one chunk at a time to identify the offending documents and throws `SupportAgentError('guardrail_blocked', 'the gateway refused N document(s) under a guardrail: <url1>, <url2>')`, naming up to 10 unique document URLs.
  - **Skip Blocked (`--skip-blocked`):** Drops all chunks belonging to refused documents, invokes `onSkip({ title, url, reason })` once per skipped document, and builds the index from the remaining documents.
- **Disabling Masking:** Set `maskPii: false` in config or pass `--no-mask-pii` to the `build-kb` CLI if pre-call masking is not desired.

## Knowledge per Organisation
Maintain one index and one agent per organisation. Audiences are entitlement tags from the host's auth via `TrustedContext`, never the body. Audiences are never a tenancy boundary.

## Security
- **API key stays server-side:** the API key is never exposed to the client.
- **Untrusted vs Trusted Input:** `req` is untrusted; `ctx` is trusted. 
- **Fenced Data:** Retrieved and web text is fenced as data.
- **SSRF Guard:** The SSRF guard checks hostnames and IP literals, but it does not resolve DNS. Therefore, run `build-kb` where fetching the configured seed URLs is acceptable.
- **Host Responsibilities:** The host authenticates and rate-limits its route.

## Limits
Defaults: `maxMessages: 12`, `maxMessageChars: 4000`, `maxPageContextChars: 1000`. Customize via `limits` config.
