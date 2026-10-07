import { createMemory } from '@nrouter_ai/sdk';
import type { SupportAgent, SupportAgentConfig, ChatRequest, AgentEvent, ChatTurn, CostEvent, FeedbackInput } from './types.js';
import { resolveConfig } from './config.js';
import { validateChatRequest, validateTrustedContext } from './limits.js';
import { latestQuestion, normalizeQuestion } from './gaps.js';
import { retrieve } from './retrieval.js';
import { scoreConfidence } from './confidence.js';
import { runWebSearchDetailed, searchAllowed } from './web-search.js';
import { addSearchCost, sumChatCosts } from './cost.js';

/** What the model replies, and nothing else, when the docs it was given do not answer the question. */
export const MISS_MARKER = '[[NOT_IN_DOCS]]';
import { buildCitations, buildSystemPrompt } from './prompt.js';
import { sanitizePageContext } from './page-context.js';
import { runToolPhase } from './tools.js';
import { streamChat } from './client.js';
import { callHook } from './hooks.js';
import { toSafeError, isModelFallbackEligible } from './errors.js';
import { toSSE } from './sse.js';
import { validateFeedback } from './feedback.js';
import { maskPii, maskMessageContent } from './pii.js';
import { matchesBookingIntent } from './booking.js';
import { buildSuggestions } from './suggestions.js';
import { isSmallTalk } from './small-talk.js';
import { responseCacheKey } from './cache.js';

export function createSupportAgent(config: SupportAgentConfig): SupportAgent {
  const cfg = resolveConfig(config);

  async function* uncachedChat(req: unknown, ctx?: import('./types.js').TrustedContext): AsyncIterable<AgentEvent> {
    try {
      const validatedReq = validateChatRequest(req, cfg.limits);
      const validatedCtx = ctx ? validateTrustedContext(ctx) : {};
      const question = latestQuestion(validatedReq.messages);
      
      const chunks = await retrieve(cfg, question, { audiences: validatedCtx.audiences, signal: validatedReq.signal });
      const conf = scoreConfidence(chunks, cfg.confidence);
      
      let webSources;
      let webSearched = false;
      let searchCost: CostEvent | 'unknown' | undefined;
      // "hi" matches nothing in the docs, yet there is nothing to look up: it is
      // answered without a search, a gap report or a booking offer.
      const smallTalk = isSmallTalk(question);
      if (!smallTalk && conf.level === 'low' && cfg.webSearch && searchAllowed(cfg.webSearch, question)) {
        webSearched = true;
        yield { type: 'tool_call', tool: 'web_search', title: 'Searched ' + cfg.webSearch.label, status: 'running' };
        try {
          const searched = await runWebSearchDetailed(cfg.webSearch, question, { signal: validatedReq.signal, timeoutMs: cfg.webSearch.timeoutMs });
          webSources = searched.sources;
          searchCost = searched.cost;
          yield { type: 'tool_call', tool: 'web_search', title: 'Searched ' + cfg.webSearch.label, status: 'done' };
        } catch (err) {
          yield { type: 'tool_call', tool: 'web_search', title: 'Searched ' + cfg.webSearch.label, status: 'error' };
        }
      }
      
      let citations = buildCitations(chunks, webSources);
      yield { type: 'confidence', level: conf.level, score: conf.score, webSearched };
      if (citations.length > 0) {
        yield { type: 'citations', citations };
      }
      
      // Similar-looking docs can still not answer the question. When a search is
      // available and has not run, the model is asked to say so with a marker, and
      // the search runs then. Not with host tools: a second answer would run them twice.
      const detectMiss = !smallTalk && !webSearched && !!cfg.webSearch && cfg.tools.length === 0;
      const system = buildSystemPrompt({
        agentName: cfg.agentName,
        instructions: cfg.instructions,
        identity: validatedCtx.identity,
        pageContext: sanitizePageContext(validatedReq.pageContext, cfg.limits.maxPageContextChars),
        chunks,
        webSources,
        ...(detectMiss ? { missMarker: MISS_MARKER } : {})
      });
      
      let history: ChatTurn[] = validatedReq.messages;
      let mem;
      if (validatedCtx.sessionId && cfg.memoryStore) {
        mem = createMemory({ store: cfg.memoryStore(validatedCtx.sessionId) });
        const latestUserMsg = validatedReq.messages[validatedReq.messages.length - 1];
        await mem.add(latestUserMsg as unknown as import('@nrouter_ai/sdk').ChatMessage);
        const past = await mem.messages();
        history = past.map(m => ({ role: m.role as 'user'|'assistant', content: m.content as any }));
      }
      
      let fullResponse = '';
      let costEvent: CostEvent | undefined;
      // Answers the visitor never saw (the model said the docs do not cover it) were still billed.
      const unseenAnswerCosts: CostEvent[] = [];
      let docsMissed = false;
      // A second attempt (next model, or the guardrail retry) is only safe while
      // the visitor has seen no token and no host tool has run.
      let tokensEmitted = false;
      let hostToolRan = false;
      let modelIndex = 0;
      
      async function executePhase(sysPrompt: string, model: string) {
         let msgs = [{ role: 'system' as const, content: sysPrompt }, ...history];
         if (cfg.maskPii) {
           msgs = msgs.map(m => ({
             ...m,
             content: maskMessageContent(m.content) as any
           }));
         }
         const phaseEvents: AgentEvent[] = [];
         const tResult = await runToolPhase(cfg, msgs as unknown as import('@nrouter_ai/sdk').ChatMessage[], (ev) => {
            hostToolRan = true;
            phaseEvents.push({ type: 'tool_call', tool: ev.tool, title: ev.title, status: ev.status });
            if (cfg.hooks.onToolCall) callHook(cfg.hooks, 'onToolCall', ev);
         }, validatedReq.signal, model);
         
         if (cfg.tools && cfg.tools.length > 0) {
           return {
             phaseEvents,
             sResult: {
               chunks: (async function* () {
                 if (tResult.text) yield tResult.text;
               })(),
               cost: tResult.cost
             }
           };
         }
         
         const sResult = await streamChat(cfg.client, {
            model,
            messages: tResult.messages,
            maxTokens: cfg.maxTokens,
            signal: validatedReq.signal,
            maskPii: cfg.maskPii
         });
         
         return { phaseEvents, sResult };
      }

      // One answer attempt. An availability refusal moves to the next configured
      // model; `modelIndex` is shared, so the request makes at most
      // models.length - 1 fallbacks in total, the guardrail retry included.
      async function* answer(sysPrompt: string, watchForMiss = false): AsyncGenerator<AgentEvent> {
         for (;;) {
            try {
               const { phaseEvents, sResult } = await executePhase(sysPrompt, cfg.models[modelIndex]!);
               for (const ev of phaseEvents) yield ev;
               // While the opening of the answer could still be the marker, hold it back.
               let held = '';
               let deciding = watchForMiss;
               let missed = false;
               for await (const chunk of sResult.chunks) {
                  if (missed) continue;
                  if (deciding) {
                     held += chunk;
                     const opening = held.trimStart();
                     if (opening.length < MISS_MARKER.length && MISS_MARKER.startsWith(opening)) continue;
                     deciding = false;
                     if (opening.startsWith(MISS_MARKER)) { missed = true; continue; }
                     fullResponse += held;
                     tokensEmitted = true;
                     yield { type: 'token', text: held };
                     continue;
                  }
                  fullResponse += chunk;
                  tokensEmitted = true;
                  yield { type: 'token', text: chunk };
               }
               if (missed) {
                  // A reply with no price is still a billed call: count it as unknown, never leave it out.
                  unseenAnswerCosts.push(sResult.cost ?? { costUsd: null, status: 'unpriced' });
                  docsMissed = true;
                  return;
               }
               if (deciding && held !== '') {
                  // The stream ended while still undecided: it was an ordinary, very short answer.
                  fullResponse += held;
                  tokensEmitted = true;
                  yield { type: 'token', text: held };
               }
               costEvent = sResult.cost;
               return;
            } catch (err) {
               // Decided on the raw error: toSafeError drops the HTTP status.
               const canFallBack = modelIndex < cfg.models.length - 1
                  && !tokensEmitted
                  && !hostToolRan
                  && isModelFallbackEligible(err);
               if (!canFallBack) throw err;
               modelIndex++;
            }
         }
      }

      // The answer failed, but a search already ran and was billed: report that
      // part. What the failed answer cost is unknown, so the total is too.
      function* searchOnlyCost(): Generator<AgentEvent> {
         // Nothing else was billed before the failure: nothing to report.
         if (searchCost === undefined && unseenAnswerCosts.length === 0) return;
         const turnCost: CostEvent = searchCost === undefined
            ? { costUsd: null, status: 'unpriced', chatCostUsd: null }
            : addSearchCost({ costUsd: null, status: 'unpriced' }, searchCost);
         yield {
            type: 'cost',
            costUsd: null,
            status: 'unpriced',
            chatCostUsd: turnCost.chatCostUsd,
            ...(turnCost.searchCostUsd !== undefined ? { searchCostUsd: turnCost.searchCostUsd } : {}),
         };
         if (cfg.hooks.onCost) callHook(cfg.hooks, 'onCost', turnCost);
      }

      try {
         yield* answer(system, detectMiss);
         if (docsMissed && cfg.webSearch) {
            if (searchAllowed(cfg.webSearch, question)) {
               webSearched = true;
               yield { type: 'tool_call', tool: 'web_search', title: 'Searched ' + cfg.webSearch.label, status: 'running' };
               try {
                  const searched = await runWebSearchDetailed(cfg.webSearch, question, { signal: validatedReq.signal, timeoutMs: cfg.webSearch.timeoutMs });
                  webSources = searched.sources;
                  searchCost = searched.cost;
                  yield { type: 'tool_call', tool: 'web_search', title: 'Searched ' + cfg.webSearch.label, status: 'done' };
               } catch {
                  // The first reply was held back, so the visitor has nothing yet: a broken
                  // search must not also cost them the answer. A sent search may have been charged.
                  if (cfg.webSearch.reportsCost) searchCost = 'unknown';
                  yield { type: 'tool_call', tool: 'web_search', title: 'Searched ' + cfg.webSearch.label, status: 'error' };
               }
               if (webSources && webSources.length > 0) {
                  // The list the visitor holds changes: web sources now lead it.
                  citations = buildCitations(chunks, webSources);
                  yield { type: 'citations', citations };
               }
            }
            // Answer again, from whatever there now is, without asking for the marker.
            yield* answer(buildSystemPrompt({
               agentName: cfg.agentName,
               instructions: cfg.instructions,
               identity: validatedCtx.identity,
               pageContext: sanitizePageContext(validatedReq.pageContext, cfg.limits.maxPageContextChars),
               chunks,
               webSources
            }));
         }
      } catch (err: any) {
         const safeErr = toSafeError(err, config.apiKey ? [config.apiKey] : undefined);
         if (safeErr.code === 'guardrail_blocked' && webSearched && !tokensEmitted && !hostToolRan) {
            const systemRetry = buildSystemPrompt({
              agentName: cfg.agentName,
              instructions: cfg.instructions,
              identity: validatedCtx.identity,
              pageContext: sanitizePageContext(validatedReq.pageContext, cfg.limits.maxPageContextChars),
              chunks,
              webSources: undefined,
              // The visitor already has the citation list; keep its numbering.
              citations
            });
            try {
               yield* answer(systemRetry);
            } catch (retryErr: any) {
               const safeRetryErr = toSafeError(retryErr, config.apiKey ? [config.apiKey] : undefined);
               yield { type: 'error', code: safeRetryErr.code, message: safeRetryErr.message };
               yield* searchOnlyCost();
               yield { type: 'done' };
               return;
            }
         } else {
            yield { type: 'error', code: safeErr.code, message: safeErr.message };
            yield* searchOnlyCost();
            yield { type: 'done' };
            return;
         }
      }

      // Both are deterministic: no model call, and the model never sees the booking URL.
      if (cfg.suggestions) {
         // Titles come from the knowledge index, so they are masked like any other outbound text.
         const built = buildSuggestions(chunks, cfg.suggestions.max);
         const questions = cfg.maskPii ? built.map(maskPii) : built;
         if (questions.length > 0) yield { type: 'suggestions', questions };
      }
      if (cfg.booking && ((conf.level === 'low' && !smallTalk) || matchesBookingIntent(question))) {
         yield { type: 'action', action: 'book_meeting', url: cfg.booking.url, label: cfg.booking.label };
      }

      if (costEvent) {
         // The search is a second billed call; count it with the answer.
         const turnCost = addSearchCost(sumChatCosts([...unseenAnswerCosts, costEvent]), searchCost);
         yield {
            type: 'cost',
            costUsd: turnCost.costUsd,
            status: turnCost.status,
            requestId: turnCost.requestId,
            ...(turnCost.chatCostUsd !== undefined ? { chatCostUsd: turnCost.chatCostUsd } : {}),
            ...(turnCost.searchCostUsd !== undefined ? { searchCostUsd: turnCost.searchCostUsd } : {}),
         };
         if (cfg.hooks.onCost) {
            callHook(cfg.hooks, 'onCost', turnCost);
         }
      }

      if (mem && fullResponse) {
         await mem.add({ role: 'assistant', content: fullResponse });
      }

      if (conf.level === 'low' && !smallTalk) {
         if (cfg.hooks.onGap) {
            callHook(cfg.hooks, 'onGap', {
               question,
               normalized: normalizeQuestion(question),
               confidence: conf.level,
               webSearched,
               sessionId: validatedCtx.sessionId
            });
         }
      }

      yield { type: 'done' };
    } catch (err: any) {
      const safeErr = toSafeError(err, config.apiKey ? [config.apiKey] : undefined);
      if (safeErr.code === 'aborted') {
         yield { type: 'error', code: 'aborted', message: safeErr.message };
      } else {
         yield { type: 'error', code: safeErr.code, message: safeErr.message };
      }
      yield { type: 'done' };
    }
  }

  async function* chat(req: unknown, ctx?: import('./types.js').TrustedContext): AsyncIterable<AgentEvent> {
    if (!cfg.responseCache) { yield* uncachedChat(req, ctx); return; }
    const key = responseCacheKey(req, ctx);
    const cached = cfg.responseCache.get(key);
    if (cached) { yield* cached; return; }
    const events: AgentEvent[] = [];
    for await (const event of uncachedChat(req, ctx)) { events.push(event); yield event; }
    cfg.responseCache.set(key, events);
  }

  function chatSSE(req: unknown, ctx?: import('./types.js').TrustedContext): ReadableStream<Uint8Array> {
    const ac = new AbortController();
    const untrustedReq = (req || {}) as any;
    if (untrustedReq?.signal) {
      if (untrustedReq.signal.aborted) {
        ac.abort(untrustedReq.signal.reason);
      } else {
        untrustedReq.signal.addEventListener('abort', () => ac.abort(untrustedReq.signal.reason), { once: true });
      }
    }
    return toSSE(chat({ ...untrustedReq, signal: ac.signal }, ctx), ac);
  }

  async function feedback(x: unknown): Promise<void> {
    const fb = validateFeedback(x);
    if (cfg.hooks.onFeedback) {
      callHook(cfg.hooks, 'onFeedback', fb);
    }
  }

  return { chat, chatSSE, feedback };
}
