import type { AgentEvent } from './types.js';

export interface ResponseCacheOptions { ttlMs?: number; maxEntries?: number }
interface Entry { expiresAt: number; events: AgentEvent[] }

export function createResponseCache(options: ResponseCacheOptions = {}) {
  const ttlMs = options.ttlMs ?? 300_000;
  const maxEntries = options.maxEntries ?? 100;
  const entries = new Map<string, Entry>();
  return {
    get(key: string): AgentEvent[] | undefined {
      const entry = entries.get(key);
      if (!entry || entry.expiresAt <= Date.now()) { if (entry) entries.delete(key); return undefined; }
      entries.delete(key); entries.set(key, entry);
      return entry.events.map(event => ({ ...event }));
    },
    set(key: string, events: AgentEvent[]): void {
      if (events.some(event => event.type === 'error')) return;
      const replayable = events.filter(event => event.type !== 'cost');
      entries.delete(key); entries.set(key, { expiresAt: Date.now() + ttlMs, events: replayable.map(event => ({ ...event })) });
      while (entries.size > maxEntries) entries.delete(entries.keys().next().value as string);
    },
  };
}

export function responseCacheKey(req: unknown, ctx: unknown): string {
  return JSON.stringify({ req, ctx });
}
