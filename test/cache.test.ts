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
});
