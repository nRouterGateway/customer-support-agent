// Run after docs change (e.g. in the deploy ingestion job):
//   npm install pg
//   node --env-file=.env examples/quickstart/sync-postgres.mjs
import { existsSync } from 'node:fs';
import pg from 'pg';
import { nRouter } from '@nrouter_ai/sdk';
import { buildKnowledgeIndex, DEFAULT_EMBEDDING_DIMENSIONS, DEFAULT_EMBEDDING_MODEL } from '@nrouter_ai/support-agent';
import {
  loadKnowledgeIndex,
  readDocsDir,
  saveKnowledgeIndex,
  syncPostgresKnowledgeIndex,
} from '@nrouter_ai/support-agent/node';

const env = (name) => (process.env[name] ?? '').trim();
const apiKey = env('NROUTER_API_KEY');
const databaseUrl = env('DATABASE_URL');
const tenantId = env('TENANT_ID');
const docsDir = env('DOCS_DIR') || 'examples/quickstart/docs';
const kbPath = env('KB_PATH') || 'kb.json';
const skipBlockedDocs = env('DOCS_SKIP_BLOCKED') === 'true';
if (!apiKey || !databaseUrl || !tenantId) {
  throw new Error('Set NROUTER_API_KEY, DATABASE_URL, and TENANT_ID before indexing.');
}

const pool = new pg.Pool({ connectionString: databaseUrl });
try {
  const docs = await readDocsDir(docsDir, env('DOCS_BASE_URL') || undefined);
  if (docs.length === 0) throw new Error(`No Markdown or text documents found in ${docsDir}`);
  const previousIndex = existsSync(kbPath) ? await loadKnowledgeIndex(kbPath) : undefined;
  const index = await buildKnowledgeIndex({
    client: new nRouter({ apiKey, baseURL: env('NROUTER_BASE_URL') || undefined }),
    docs,
    embeddingModel: env('EMBEDDING_MODEL') || DEFAULT_EMBEDDING_MODEL,
    dimensions: Number(env('EMBEDDING_DIMENSIONS') || DEFAULT_EMBEDDING_DIMENSIONS),
    ...(previousIndex ? { previousIndex } : {}),
    skipBlocked: skipBlockedDocs,
    onSkip: (doc) => console.warn(`[docs:skipped] ${doc.url} (${doc.reason})`),
  });
  if (index.chunks.length === 0) {
    throw new Error('No document chunks were indexed; refusing to replace the active knowledge index.');
  }
  await saveKnowledgeIndex(kbPath, index);
  const result = await syncPostgresKnowledgeIndex(pool, tenantId, index);
  console.log(`Published ${result.chunkCount} chunks to the knowledge store.`);
} finally {
  await pool.end();
}
