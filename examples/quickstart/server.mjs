// A complete support agent in one file: builds the knowledge index from a docs
// folder on first start, then serves a chat page and a streaming chat endpoint.
//
//   cp .env.example .env      # add your NROUTER_API_KEY
//   npm run example           # http://127.0.0.1:4175
//
// This is a local demo. Before you put an endpoint like this on the internet,
// read "Before you go live" in the README: it has no login, rate limit or bot check.
import http from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { nRouter } from '@nrouter_ai/sdk';
import { buildKnowledgeIndex, createNRouterWebSearch, createSupportAgent } from '@nrouter_ai/support-agent';
import { loadKnowledgeIndex, readDocsDir, saveKnowledgeIndex } from '@nrouter_ai/support-agent/node';

const env = (name, fallback = '') => (process.env[name] ?? '').trim() || fallback;

const apiKey = env('NROUTER_API_KEY');
if (!apiKey) {
  console.error('NROUTER_API_KEY is not set. Copy .env.example to .env and add your key.');
  process.exit(1);
}
const baseURL = env('NROUTER_BASE_URL') || undefined;
const docsDir = env('DOCS_DIR', 'examples/quickstart/docs');
const kbPath = env('KB_PATH', 'kb.json');
const port = Number(env('PORT', '4175'));
const searchDomains = env('WEB_SEARCH_DOMAINS').split(',').map((d) => d.trim()).filter(Boolean);
const bookingUrl = env('BOOKING_URL');

// 1. The knowledge index: built once from your docs, then reused from disk.
async function loadOrBuildKnowledge() {
  const previousIndex = existsSync(kbPath) ? await loadKnowledgeIndex(kbPath) : undefined;
  console.log(`${previousIndex ? 'Refreshing' : 'Building'} the knowledge index from ${docsDir} ...`);
  const docs = await readDocsDir(docsDir, env('DOCS_BASE_URL') || undefined);
  if (docs.length === 0) throw new Error(`No .md, .mdx or .txt files found in ${docsDir}`);
  const index = await buildKnowledgeIndex({ client: new nRouter({ apiKey, baseURL }), docs, previousIndex });
  await saveKnowledgeIndex(kbPath, index);
  console.log(`${previousIndex ? 'Refreshed' : 'Indexed'} ${docs.length} documents as ${index.chunks.length} chunks -> ${kbPath}`);
  return index;
}

// 2. The agent.
const agent = createSupportAgent({
  apiKey,
  baseURL,
  model: env('MODEL', 'claude-haiku-4-5-20251001'),
  knowledge: await loadOrBuildKnowledge(),
  agentName: env('AGENT_NAME', 'Support'),
  instructions: env('AGENT_INSTRUCTIONS'),
  suggestions: true,
  ...(bookingUrl ? { booking: { url: bookingUrl } } : {}),
  ...(searchDomains.length > 0
    ? { webSearch: createNRouterWebSearch({ apiKey, baseURL, allowedDomains: searchDomains, label: searchDomains[0], timeoutMs: 30_000 }) }
    : {}),
  hooks: {
    // Questions your docs could not answer: the list of what to write next.
    onGap: (gap) => console.log(`[gap] ${gap.question}`),
    onCost: (cost) => console.log(`[cost] ${cost.status === 'exact' ? `$${cost.costUsd}` : 'unpriced'}`),
  },
});

// 3. The endpoint. `ctx` is what YOUR login knows about the visitor; nothing in
// the request body is trusted for identity.
const page = fileURLToPath(new URL('./index.html', import.meta.url));
const MAX_BODY_BYTES = 64 * 1024;

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('body too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
}

const server = http.createServer(async (req, res) => {
  try {
    const origin = req.headers.origin;
    if (origin === 'http://localhost:3000' || origin === 'http://127.0.0.1:3000') {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(await readFile(page));
      return;
    }
    if (req.method === 'POST' && (req.url === '/api/chat' || req.url === '/api/public/ask')) {
      const body = await readJson(req);
      const ctx = {}; // e.g. { identity: { name, plan }, audiences: ['customers'], sessionId }
      const reader = agent.chatSSE({ messages: body.messages }, ctx).getReader();
      req.on('close', () => { reader.cancel().catch(() => {}); });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform' });
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  } catch {
    if (!res.headersSent) res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'bad_request' }));
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Support agent ready: http://127.0.0.1:${port}`);
});
