// Public entry: "@nrouter_ai/support-agent". Edge-safe: no node: imports reachable from here.
export * from './types.js';
export {
  createSupportAgent,
  handleSupportTurnWithJev,
  PLAYBOOK,
  type NRouter,
  type SupportTurnInput,
  type SupportPlaybookEntry,
  type SupportTurnOutput,
} from './agent.js';
export { createResponseCache, responseCacheKey, isVectorGrounded, type ResponseCacheOptions } from './cache.js';
export { SupportAgentError, toSafeError, redact } from './errors.js';
export { buildKnowledgeIndex, DEFAULT_EMBEDDING_MODEL, DEFAULT_EMBEDDING_DIMENSIONS } from './knowledge/build.js';
export { createMemoryKnowledgeStore, cosineSimilarity } from './knowledge/store.js';
export { validateIndex } from './knowledge/validate.js';
export { chunkText, chunkDocs } from './knowledge/chunk.js';
export { fetchSeedPages, isSafeUrl } from './knowledge/fetch.js';
export { createWebSearchTool, WEB_SEARCH_TOOL_ID } from './web-search.js';
export { createNRouterWebSearch, DEFAULT_WEB_SEARCH_MODEL } from './nrouter-web-search.js';
export type { NRouterWebSearchOptions } from './nrouter-web-search.js';
export { toSSE, encodeEvent } from './sse.js';
export { validateFeedback } from './feedback.js';
export { maskPii } from './pii.js';
export {
  classifyLocal,
  classifyWithJev,
  buildJevSystemOnePayload,
  isValidJevSupportCategory,
  JEV_MODEL,
  JEV_SUPPORT_CATEGORIES,
  type JevSupportCategory,
  type JevClassificationResult,
  type JevDecision,
  type JevClassifyOptions,
  type JevSystemOneChoiceQuestion,
  type JevSystemOnePayload,
} from './jev.js';
export { formatMcpClientConfig, createMcpTools, type McpClientConfig } from './mcp.js';
