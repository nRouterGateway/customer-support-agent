import { describe, expect, it, vi } from 'vitest';
import { createResponseCache, responseCacheKey } from '../src/cache.js';

describe('response cache', () => {
  it('stores completed answer events but never replays billing events', () => {
    const cache = createResponseCache();
    cache.set('q', [
      { type: 'token', text: 'answer' },
      { type: 'cost', costUsd: 0.01, status: 'exact' },
      { type: 'done' },
    ]);
    expect(cache.get('q')).toEqual([{ type: 'token', text: 'answer' }, { type: 'done' }]);
  });

  it('expires entries', () => {
    vi.useFakeTimers();
    const cache = createResponseCache({ ttlMs: 100 });
    cache.set('q', [{ type: 'done' }]);
    vi.advanceTimersByTime(101);
    expect(cache.get('q')).toBeUndefined();
    vi.useRealTimers();
  });

  it('creates a stable key from request and trusted context', () => {
    expect(responseCacheKey({ messages: [{ role: 'user', content: 'Hi' }] }, { audiences: ['public'] }))
      .toContain('public');
  });

  it('never caches error events', () => {
    const cache = createResponseCache();
    cache.set('err', [
      { type: 'token', text: 'hi' },
      { type: 'error', code: 'internal_error', message: 'fail' },
      { type: 'done' },
    ]);
    expect(cache.get('err')).toBeUndefined();
  });

  it('evicts oldest entries when maxEntries is exceeded', () => {
    const cache = createResponseCache({ maxEntries: 2 });
    cache.set('a', [{ type: 'done' }]);
    cache.set('b', [{ type: 'done' }]);
    cache.set('c', [{ type: 'done' }]);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeDefined();
    expect(cache.get('c')).toBeDefined();
  });

  it('ignores AbortSignal when generating cache key', () => {
    const ac = new AbortController();
    const key1 = responseCacheKey({ messages: [{ role: 'user', content: 'Hi' }], signal: ac.signal }, { audiences: ['public'] });
    const key2 = responseCacheKey({ messages: [{ role: 'user', content: 'Hi' }] }, { audiences: ['public'] });
    expect(key1).toEqual(key2);
  });
});
