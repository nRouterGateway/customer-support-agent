import { describe, it, expect, vi } from 'vitest';
import { buildKnowledgeIndex } from '../src/knowledge/build.js';
import type { SourceDoc } from '../src/types.js';

vi.mock('../src/knowledge/chunk.js', () => ({
  chunkDocs: (docs: SourceDoc[]) => docs.map((d, i) => ({
    id: `chunk-${i}`,
    title: d.title,
    url: d.url,
    content: d.content,
    audiences: d.audiences
  }))
}));

describe('buildKnowledgeIndex', () => {
  it('handles zero docs without calling embed', async () => {
    const client = { embeddings: { create: vi.fn() } } as any;
    const index = await buildKnowledgeIndex({ docs: [], client });
    
    expect(client.embeddings.create).not.toHaveBeenCalled();
    expect(index.chunks).toHaveLength(0);
    expect(index.version).toBe(1);
    expect(index.embeddingModel).toBe('text-embedding-3-small');
  });

  it('batches requests according to batchSize', async () => {
    const batches: number[] = [];
    const client = {
      embeddings: {
        create: vi.fn().mockImplementation(async (opts) => {
          batches.push(opts.input.length);
          return {
            data: opts.input.map(() => ({ embedding: [0.1, 0.2] }))
          };
        })
      }
    } as any;

    const docs = Array.from({ length: 5 }, (_, i) => ({
      title: `Doc ${i}`,
      url: `http://example.com/${i}`,
      content: `Content ${i}`
    }));

    const index = await buildKnowledgeIndex({
      docs,
      client,
      batchSize: 2,
      dimensions: 2
    });

    expect(index.chunks).toHaveLength(5);
    expect(batches).toEqual([2, 2, 1]);
  });

  it('keeps each request under a text budget, so a large doc set does not exceed the model input limit', async () => {
    const sizes: number[] = [];
    const client = {
      embeddings: {
        create: vi.fn().mockImplementation(async (opts) => {
          sizes.push(opts.input.reduce((n: number, s: string) => n + s.length, 0));
          return { data: opts.input.map(() => ({ embedding: [0.1, 0.2] })) };
        })
      }
    } as any;

    const docs = Array.from({ length: 6 }, (_, i) => ({ title: `Doc ${i}`, url: `http://example.com/${i}`, content: 'word '.repeat(180) }));
    const index = await buildKnowledgeIndex({ docs, client, dimensions: 2, maxBatchChars: 2000 });

    expect(index.chunks).toHaveLength(6);
    expect(sizes.length).toBeGreaterThan(1);
    for (const size of sizes) expect(size).toBeLessThanOrEqual(2000);
  });

  it('by default stays well inside an 8k-token embedding input limit', async () => {
    const sizes: number[] = [];
    const client = {
      embeddings: {
        create: vi.fn().mockImplementation(async (opts) => {
          sizes.push(opts.input.reduce((n: number, s: string) => n + s.length, 0));
          return { data: opts.input.map(() => ({ embedding: [0.1, 0.2] })) };
        })
      }
    } as any;
    const docs = Array.from({ length: 40 }, (_, i) => ({ title: `Doc ${i}`, url: `http://example.com/${i}`, content: 'word '.repeat(230) }));
    await buildKnowledgeIndex({ docs, client, dimensions: 2 });
    // ~3 characters a token on a conservative count: 16,000 characters is about 5,300 tokens.
    for (const size of sizes) expect(size).toBeLessThanOrEqual(16_000);
  });

  it('propagates abort signal (before embed)', async () => {
    const client = { embeddings: { create: vi.fn() } } as any;
    const controller = new AbortController();
    controller.abort();

    await expect(buildKnowledgeIndex({
      docs: [{ title: 'Doc', url: 'url', content: 'content' }],
      client,
      signal: controller.signal
    })).rejects.toThrow('build aborted');

    expect(client.embeddings.create).not.toHaveBeenCalled();
  });

  it('propagates abort signal (during embed)', async () => {
    const controller = new AbortController();
    const client = {
      embeddings: {
        create: vi.fn().mockImplementation(async () => {
          controller.abort(); // abort during the request
          const err = new Error('AbortError');
          err.name = 'AbortError';
          throw err;
        })
      }
    } as any;

    await expect(buildKnowledgeIndex({
      docs: [{ title: 'Doc', url: 'url', content: 'content' }],
      client,
      signal: controller.signal
    })).rejects.toThrow('build aborted');
  });

  it('throws upstream error if embeddings length mismatches', async () => {
    const client = {
      embeddings: {
        create: vi.fn().mockImplementation(async () => ({
          data: [{ embedding: [0] }] // Only 1 returned for a batch of 2
        }))
      }
    } as any;

    const docs = Array.from({ length: 2 }, (_, i) => ({
      title: `Doc ${i}`,
      url: `http://example.com/${i}`,
      content: `Content ${i}`
    }));

    await expect(buildKnowledgeIndex({ docs, client }))
      .rejects.toThrow('Embedding count mismatch');
  });

  it('assigns correct vector when out-of-order', async () => {
    const client = {
      embeddings: {
        create: vi.fn().mockImplementation(async () => {
          return {
            data: [
              { index: 1, embedding: [0.2, 0.2] },
              { index: 0, embedding: [0.1, 0.1] }
            ]
          };
        })
      }
    } as any;

    const docs = [
      { title: 'Doc 0', url: 'http://0', content: '0' },
      { title: 'Doc 1', url: 'http://1', content: '1' }
    ];

    const index = await buildKnowledgeIndex({ docs, client, batchSize: 2, dimensions: 2 });
    expect(index.chunks[0]?.embedding).toEqual([0.1, 0.1]);
    expect(index.chunks[1]?.embedding).toEqual([0.2, 0.2]);
  });

  it('guardrail refusal with skipBlocked: false re-embeds 1-by-1 and throws naming refused doc', async () => {
    const client = {
      embeddings: {
        create: vi.fn().mockImplementation(async (opts: any) => {
          // If batch contains bad content, throw guardrail error
          if (opts.input.length > 1) {
            const err = new Error('request blocked by a guardrail: PII detected');
            (err as any).status = 400;
            throw err;
          }
          // Individual chunk calls:
          if (opts.input[0] === 'Bad Content') {
            const err = new Error('request blocked by a guardrail: PII detected');
            (err as any).status = 400;
            throw err;
          }
          return { data: [{ index: 0, embedding: [0.5, 0.5] }] };
        })
      }
    } as any;

    const docs = [
      { title: 'Good Doc', url: 'http://example.com/good', content: 'Good Content' },
      { title: 'Bad Doc', url: 'http://example.com/bad', content: 'Bad Content' }
    ];

    await expect(buildKnowledgeIndex({ docs, client, dimensions: 2, skipBlocked: false }))
      .rejects.toThrow('the gateway refused 1 document(s) under a guardrail: http://example.com/bad');
  });

  it('guardrail refusal with skipBlocked: true drops refused doc and calls onSkip', async () => {
    const client = {
      embeddings: {
        create: vi.fn().mockImplementation(async (opts: any) => {
          if (opts.input.length > 1) {
            const err = new Error('request blocked by a guardrail: PII detected');
            (err as any).status = 400;
            throw err;
          }
          if (opts.input[0] === 'Bad Content') {
            const err = new Error('request blocked by a guardrail: PII detected');
            (err as any).status = 400;
            throw err;
          }
          return { data: [{ index: 0, embedding: [0.5, 0.5] }] };
        })
      }
    } as any;

    const docs = [
      { title: 'Good Doc', url: 'http://example.com/good', content: 'Good Content' },
      { title: 'Bad Doc', url: 'http://example.com/bad', content: 'Bad Content' }
    ];

    const skipped: any[] = [];
    const index = await buildKnowledgeIndex({
      docs,
      client,
      dimensions: 2,
      skipBlocked: true,
      onSkip: (d) => skipped.push(d)
    });

    expect(skipped).toEqual([
      {
        title: 'Bad Doc',
        url: 'http://example.com/bad',
        reason: 'request blocked by a guardrail: PII detected'
      }
    ]);
    expect(index.chunks).toHaveLength(1);
    expect(index.chunks[0]?.url).toBe('http://example.com/good');
  });

  it('passes maskPii option to embed calls', async () => {
    let capturedOpts: any;
    const client = {
      embeddings: {
        create: vi.fn().mockImplementation(async (opts: any) => {
          capturedOpts = opts;
          return { data: [{ index: 0, embedding: [0.1, 0.1] }] };
        })
      }
    } as any;

    const docs = [{ title: 'Doc', url: 'http://example.com', content: 'Contact me at test@example.com' }];
    await buildKnowledgeIndex({ docs, client, dimensions: 2, maskPii: false });
    // When maskPii is false, input is not masked
    expect(capturedOpts.input).toEqual(['Contact me at test@example.com']);
  });

  describe('incremental rebuilds', () => {
    it('reuses embeddings from previousIndex for unchanged chunks without calling client', async () => {
      const client = {
        embeddings: {
          create: vi.fn(),
        },
      } as any;

      const previousIndex = {
        version: 1 as const,
        embeddingModel: 'text-embedding-3-small',
        dimensions: 2,
        createdAt: '2026-09-01T00:00:00Z',
        chunks: [
          { id: 'chunk-0', title: 'Old Title', url: 'http://example.com/0', content: 'Content 0', embedding: [0.1, 0.2] },
          { id: 'chunk-1', title: 'Old Title 1', url: 'http://example.com/1', content: 'Content 1', embedding: [0.3, 0.4] },
        ],
      };

      const docs = [
        { title: 'New Title 0', url: 'http://example.com/0', content: 'Content 0' },
        { title: 'New Title 1', url: 'http://example.com/1', content: 'Content 1' },
      ];

      const index = await buildKnowledgeIndex({
        docs,
        client,
        previousIndex,
        dimensions: 2,
      });

      expect(client.embeddings.create).not.toHaveBeenCalled();
      expect(index.chunks).toHaveLength(2);
      expect(index.chunks[0]).toEqual({
        id: 'chunk-0',
        title: 'New Title 0',
        url: 'http://example.com/0',
        content: 'Content 0',
        audiences: undefined,
        embedding: [0.1, 0.2],
      });
      expect(index.chunks[1]).toEqual({
        id: 'chunk-1',
        title: 'New Title 1',
        url: 'http://example.com/1',
        content: 'Content 1',
        audiences: undefined,
        embedding: [0.3, 0.4],
      });
    });

    it('re-embeds only changed chunks and preserves original chunk order', async () => {
      const client = {
        embeddings: {
          create: vi.fn().mockImplementation(async (opts) => ({
            data: opts.input.map(() => ({ embedding: [0.9, 0.9] })),
          })),
        },
      } as any;

      const previousIndex = {
        version: 1 as const,
        embeddingModel: 'text-embedding-3-small',
        dimensions: 2,
        createdAt: '2026-09-01T00:00:00Z',
        chunks: [
          { id: 'chunk-0', title: 'Doc 0', url: 'http://example.com/0', content: 'Unchanged 0', embedding: [0.1, 0.1] },
          { id: 'chunk-1', title: 'Doc 1', url: 'http://example.com/1', content: 'Old Content 1', embedding: [0.2, 0.2] },
          { id: 'chunk-2', title: 'Doc 2', url: 'http://example.com/2', content: 'Unchanged 2', embedding: [0.3, 0.3] },
        ],
      };

      const docs = [
        { title: 'Doc 0', url: 'http://example.com/0', content: 'Unchanged 0' },
        { title: 'Doc 1', url: 'http://example.com/1', content: 'NEW Content 1' },
        { title: 'Doc 2', url: 'http://example.com/2', content: 'Unchanged 2' },
      ];

      const index = await buildKnowledgeIndex({
        docs,
        client,
        previousIndex,
        dimensions: 2,
      });

      // Only chunk-1 should be passed to embed
      expect(client.embeddings.create).toHaveBeenCalledTimes(1);
      expect(client.embeddings.create).toHaveBeenCalledWith(
        expect.objectContaining({ input: ['NEW Content 1'] }),
        expect.objectContaining({ signal: undefined })
      );

      // Order should remain Doc 0, Doc 1, Doc 2
      expect(index.chunks).toHaveLength(3);
      expect(index.chunks[0]?.id).toBe('chunk-0');
      expect(index.chunks[0]?.embedding).toEqual([0.1, 0.1]);
      expect(index.chunks[1]?.id).toBe('chunk-1');
      expect(index.chunks[1]?.embedding).toEqual([0.9, 0.9]);
      expect(index.chunks[2]?.id).toBe('chunk-2');
      expect(index.chunks[2]?.embedding).toEqual([0.3, 0.3]);
    });

    it('ignores previousIndex if model or dimensions differ', async () => {
      const client = {
        embeddings: {
          create: vi.fn().mockImplementation(async (opts) => ({
            data: opts.input.map(() => ({ embedding: [0.5, 0.5, 0.5] })),
          })),
        },
      } as any;

      const previousIndex = {
        version: 1 as const,
        embeddingModel: 'text-embedding-3-small',
        dimensions: 2,
        createdAt: '2026-09-01T00:00:00Z',
        chunks: [
          { id: 'chunk-0', title: 'Doc 0', url: 'http://example.com/0', content: 'Content', embedding: [0.1, 0.1] },
        ],
      };

      const docs = [{ title: 'Doc 0', url: 'http://example.com/0', content: 'Content' }];

      // Requesting dimensions: 3 when previousIndex was dimensions: 2
      const index = await buildKnowledgeIndex({
        docs,
        client,
        previousIndex,
        dimensions: 3,
      });

      expect(client.embeddings.create).toHaveBeenCalledTimes(1);
      expect(index.chunks[0]?.embedding).toEqual([0.5, 0.5, 0.5]);
    });
  });
});
