import type { BuildIndexOptions, KnowledgeIndex, KnowledgeChunk } from '../types.js';
import { chunkDocs } from './chunk.js';
import { validateIndex } from './validate.js';
import { SupportAgentError, toSafeError } from '../errors.js';
import { embed } from '../client.js';

export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
export const DEFAULT_EMBEDDING_DIMENSIONS = 768;
export const DEFAULT_EMBED_BATCH = 64;
/** About 5,300 tokens on a conservative count: inside the 8k input limit common to embedding models. */
export const DEFAULT_EMBED_BATCH_CHARS = 16_000;

async function embedRetry(
  client: any,
  model: string,
  input: string[],
  dimensions: number,
  signal?: AbortSignal,
  opts?: { maskPii?: boolean; batchFallback?: boolean },
): Promise<number[][]> {
  let lastError: any;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await embed(client, model, input, dimensions, signal, opts);
    } catch (err: any) {
      lastError = err;
      if (err?.name === 'AbortError' || signal?.aborted) throw err;
      const msg = err?.message || '';
      if (/503|temporarily unavailable|rate_limit|429/i.test(msg) && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

export async function buildKnowledgeIndex(opts: BuildIndexOptions): Promise<KnowledgeIndex> {
  const embeddingModel = opts.embeddingModel || DEFAULT_EMBEDDING_MODEL;
  const dimensions = opts.dimensions || DEFAULT_EMBEDDING_DIMENSIONS;
  const batchSize = opts.batchSize || DEFAULT_EMBED_BATCH;
  const maxBatchChars = opts.maxBatchChars || DEFAULT_EMBED_BATCH_CHARS;
  const maskPii = opts.maskPii;
  const skipBlocked = opts.skipBlocked ?? false;
  const reusable = opts.previousIndex && opts.previousIndex.embeddingModel === embeddingModel && opts.previousIndex.dimensions === dimensions
    ? new Map(opts.previousIndex.chunks.map(chunk => [chunk.id, chunk])) : new Map();

  if (opts.docs.length === 0) {
    const emptyIndex: KnowledgeIndex = {
      version: 1,
      embeddingModel,
      dimensions,
      createdAt: new Date().toISOString(),
      chunks: []
    };
    validateIndex(emptyIndex);
    return emptyIndex;
  }

  const baseChunks = chunkDocs(opts.docs);
  let chunks: KnowledgeChunk[] = [];
  const skippedDocUrls = new Set<string>();

  // A request is bounded by chunk count AND by text size: embedding models cap the
  // input of one request, and 64 full-size chunks is several times that cap.
  const ranges: Array<[number, number]> = [];
  for (let start = 0; start < baseChunks.length; ) {
    let end = start;
    let chars = 0;
    while (end < baseChunks.length && end - start < batchSize) {
      const size = baseChunks[end]!.content.length;
      if (end > start && chars + size > maxBatchChars) break;
      chars += size;
      end++;
    }
    ranges.push([start, end]);
    start = end;
  }

  for (const [from, to] of ranges) {
    if (opts.signal?.aborted) {
      throw new SupportAgentError('aborted', 'build aborted');
    }

    const rawBatch = baseChunks.slice(from, to);
    const batch = skipBlocked ? rawBatch.filter(c => !skippedDocUrls.has(c.url)) : rawBatch;
    if (batch.length === 0) {
      continue;
    }

    const pending: typeof batch = [];
    const vectorMap = new Map<string, number[]>();

    for (const b of batch) {
      const prior = reusable.get(b.id);
      if (prior && prior.content === b.content) {
        vectorMap.set(b.id, prior.embedding);
      } else {
        pending.push(b);
      }
    }

    if (pending.length > 0) {
      const input = pending.map(c => c.content);

      let vectors: number[][];
      try {
        vectors = await embedRetry(opts.client, embeddingModel, input, dimensions, opts.signal, { maskPii, batchFallback: (opts as any).batchFallback });
        for (let j = 0; j < pending.length; j++) {
          vectorMap.set(pending[j]!.id, vectors[j]!);
        }
      } catch (error: any) {
        if (error?.name === 'AbortError' || opts.signal?.aborted) {
          throw new SupportAgentError('aborted', 'build aborted');
        }
        const safe = toSafeError(error);
        if (safe.code !== 'guardrail_blocked') {
          throw error;
        }

        // Re-embed that batch ONE chunk at a time to find the refused chunks
        const refusedInBatch = new Map<string, { title: string; url: string; reason: string }>();
        const successfulInBatch: Array<{ chunk: (typeof batch)[0]; vector: number[] }> = [];

        for (const c of pending) {
          if (opts.signal?.aborted) {
            throw new SupportAgentError('aborted', 'build aborted');
          }
          try {
            const singleVec = await embedRetry(opts.client, embeddingModel, [c.content], dimensions, opts.signal, { maskPii, batchFallback: (opts as any).batchFallback });
            successfulInBatch.push({ chunk: c, vector: singleVec[0]! });
            vectorMap.set(c.id, singleVec[0]!);
          } catch (chunkErr: any) {
            if (chunkErr?.name === 'AbortError' || opts.signal?.aborted) {
              throw new SupportAgentError('aborted', 'build aborted');
            }
            const chunkSafe = toSafeError(chunkErr);
            if (chunkSafe.code === 'guardrail_blocked') {
              if (!refusedInBatch.has(c.url)) {
                refusedInBatch.set(c.url, { title: c.title, url: c.url, reason: chunkSafe.message });
              }
            } else {
              // Other errors propagate unchanged
              throw chunkErr;
            }
          }
        }

        if (refusedInBatch.size === 0) {
          throw error;
        }

        if (!skipBlocked) {
          const uniqueUrls = Array.from(refusedInBatch.keys());
          const listed = uniqueUrls.slice(0, 10).join(', ');
          throw new SupportAgentError(
            'guardrail_blocked',
            `the gateway refused ${uniqueUrls.length} document(s) under a guardrail: ${listed}`
          );
        }

        // skipBlocked is true: drop every chunk of a refused doc, call onSkip once per doc
        for (const [url, info] of refusedInBatch) {
          if (!skippedDocUrls.has(url)) {
            skippedDocUrls.add(url);
            opts.onSkip?.(info);
          }
        }

        // Drop every chunk of a refused doc from previously accumulated chunks
        chunks = chunks.filter(c => !skippedDocUrls.has(c.url));
      }
    }

    for (const b of batch) {
      if (skippedDocUrls.has(b.url)) continue;
      const embedding = vectorMap.get(b.id);
      if (embedding) {
        chunks.push({
          id: b.id,
          title: b.title,
          url: b.url,
          content: b.content,
          audiences: b.audiences,
          embedding
        });
      }
    }
  }

  const index: KnowledgeIndex = {
    version: 1,
    embeddingModel,
    dimensions,
    createdAt: new Date().toISOString(),
    chunks,
  };

  validateIndex(index);
  return index;
}
