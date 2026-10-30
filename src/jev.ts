// Pure TypeScript / Edge-safe: no node: imports.
import type { nRouter } from '@nrouter_ai/sdk';
import { isSmallTalk } from './small-talk.js';
import { matchesBookingIntent, matchesHumanIntent } from './booking.js';

export const JEV_MODEL = 'typesafe/jev';

export type JevSupportCategory =
  | 'dashboard'
  | 'mcp'
  | 'billing'
  | 'api_keys'
  | 'virtual_keys'
  | 'guardrails'
  | 'quota_fallback'
  | 'booking'
  | 'escalation'
  | 'small_talk'
  | 'general_inquiry'
  | 'off_topic';

export interface JevClassificationResult {
  category: JevSupportCategory;
  confidence: number;
  isVectorGrounded: boolean;
  isEscalation: boolean;
  explanation?: string;
}

/**
 * Fast deterministic local classification using the Jev taxonomy.
 * Enables zero-latency intent detection, pre-filtering, and offline test execution.
 */
export function classifyLocal(text: string): JevClassificationResult {
  const q = (text || '').trim().toLowerCase();
  if (!q) {
    return {
      category: 'general_inquiry',
      confidence: 0.5,
      isVectorGrounded: false,
      isEscalation: false,
    };
  }

  if (matchesHumanIntent(q)) {
    return {
      category: 'escalation',
      confidence: 0.95,
      isVectorGrounded: false,
      isEscalation: true,
      explanation: 'User explicitly requested a human support agent.',
    };
  }

  if (
    matchesBookingIntent(q) ||
    q.includes('demo') ||
    q.includes('book a meeting') ||
    q.includes('schedule a call') ||
    q.includes('schedule a meeting') ||
    q.includes('schedule a demo')
  ) {
    return {
      category: 'booking',
      confidence: 0.95,
      isVectorGrounded: false,
      isEscalation: false,
      explanation: 'User requested booking a meeting or scheduling a call.',
    };
  }

  if (isSmallTalk(q)) {
    return {
      category: 'small_talk',
      confidence: 0.95,
      isVectorGrounded: false,
      isEscalation: false,
      explanation: 'Greeting or casual small talk.',
    };
  }

  // Virtual keys & API keys
  if (
    q.includes('virtual key') ||
    q.includes('spend ceiling') ||
    q.includes('restrict model') ||
    q.includes('ceiling') ||
    q.includes('deny list') ||
    q.includes('denylist') ||
    q.includes('model_denied') ||
    q.includes('model denied')
  ) {
    return {
      category: 'virtual_keys',
      confidence: 0.92,
      isVectorGrounded: true,
      isEscalation: false,
      explanation: 'Inquiry regarding virtual key configuration, spend ceilings, or model restrictions.',
    };
  }

  if (q.includes('api key') || q.includes('create key') || q.includes('sk-nrouter')) {
    return {
      category: 'api_keys',
      confidence: 0.92,
      isVectorGrounded: true,
      isEscalation: false,
      explanation: 'Inquiry regarding nRouter API keys.',
    };
  }

  // MCP Servers
  if (q.includes('mcp') || q.includes('tools hub') || q.includes('tools/list') || q.includes('claude desktop') || q.includes('cursor')) {
    return {
      category: 'mcp',
      confidence: 0.94,
      isVectorGrounded: true,
      isEscalation: false,
      explanation: 'Inquiry regarding Model Context Protocol (MCP) server management or proxying.',
    };
  }

  // Dashboards & Observability
  if (
    q.includes('dashboard') ||
    q.includes('spend log') ||
    q.includes('trace canvas') ||
    q.includes('timeline gantt') ||
    q.includes('pipeline canvas') ||
    q.includes('answer inspector') ||
    q.includes('debug & trace') ||
    q.includes('unpriced')
  ) {
    return {
      category: 'dashboard',
      confidence: 0.93,
      isVectorGrounded: true,
      isEscalation: false,
      explanation: 'Inquiry regarding dashboard navigation, spend logs, or trace canvas.',
    };
  }

  // Guardrails & PII
  if (q.includes('pii') || q.includes('guardrail') || q.includes('moderation') || q.includes('prompt injection') || q.includes('jailbreak') || q.includes('mask')) {
    return {
      category: 'guardrails',
      confidence: 0.92,
      isVectorGrounded: true,
      isEscalation: false,
      explanation: 'Inquiry regarding security, PII redaction, or Cortex guardrails.',
    };
  }

  // Quota & Fallback
  if (
    q.includes('quota') ||
    q.includes('429') ||
    q.includes('fallback') ||
    q.includes('rate limit') ||
    /(\b|\d)(rps|rpd|rpm|tpm)s?\b/.test(q) ||
    q.includes('pot_spend_limit') ||
    q.includes('pot_window')
  ) {
    return {
      category: 'quota_fallback',
      confidence: 0.91,
      isVectorGrounded: true,
      isEscalation: false,
      explanation: 'Inquiry regarding rate limits, quota exhaustion (429), or model fallback chains.',
    };
  }

  // Billing & Credits
  if (
    q.includes('billing') ||
    (q.includes('credit') && !q.includes('credit card')) ||
    q.includes('402') ||
    q.includes('platform fee') ||
    q.includes('invoice') ||
    q.includes('subscription') ||
    q.includes('nrouter/promo') ||
    q.includes('nrouter/hack') ||
    q.includes('promo pot') ||
    q.includes('hack pot') ||
    q.includes('pot_route_feature_unsupported')
  ) {
    return {
      category: 'billing',
      confidence: 0.91,
      isVectorGrounded: true,
      isEscalation: false,
      explanation: 'Inquiry regarding billing, credits, platform fees, promotional/hackathon pots, or payment requirements.',
    };
  }

  // Off-topic heuristic checks
  if (
    q.includes('weather') ||
    q.includes('recipe') ||
    q.includes('coca-cola') ||
    q.includes('restaurant') ||
    q.includes('movie') ||
    q.includes('paris') ||
    q.includes('capital') ||
    q.includes('france') ||
    q.includes('president') ||
    q.includes('bake') ||
    q.includes('cook')
  ) {
    return {
      category: 'off_topic',
      confidence: 0.9,
      isVectorGrounded: false,
      isEscalation: false,
      explanation: 'Query falls outside nRouter support and product documentation scope.',
    };
  }

  // Default general inquiry about nRouter
  return {
    category: 'general_inquiry',
    confidence: 0.85,
    isVectorGrounded: true,
    isEscalation: false,
    explanation: 'General inquiry related to nRouter capabilities, models, or usage.',
  };
}

/**
 * Classifies a support question using Jev (typesafe/jev) or falls back to local classification.
 * Output includes category, confidence (0.0 to 1.0), and whether the question is vector-grounded.
 */
export async function classifyWithJev(
  client: nRouter,
  question: string,
  options?: { model?: string; signal?: AbortSignal },
): Promise<JevClassificationResult> {
  const local = classifyLocal(question);
  // High-confidence deterministic cases (human handoff, small talk, booking) do not require a remote model call
  if (local.confidence >= 0.95) {
    return local;
  }

  const model = options?.model ?? JEV_MODEL;
  const systemPrompt = `You are Jev, nRouter's autonomous task and intent classifier.
Classify the user support query into exactly one of these categories:
- dashboard
- mcp
- billing
- api_keys
- virtual_keys
- guardrails
- quota_fallback
- booking
- escalation
- small_talk
- general_inquiry
- off_topic

Respond ONLY with valid JSON in this exact shape:
{"category": "<category>", "confidence": <0.0-1.0>, "isVectorGrounded": <true|false>, "isEscalation": <true|false>, "explanation": "<brief rationale>"}`;

  try {
    const res = await client.nr.chat({
      model,
      systemPrompt,
      messages: [{ role: 'user', content: question }],
      maxTokens: 120,
      ...(options?.signal ? { signal: options?.signal } : {}),
    });

    const body = res.body as { choices?: Array<{ message?: { content?: unknown } }> };
    const rawContent = body.choices?.[0]?.message?.content;
    if (typeof rawContent === 'string' && rawContent.trim()) {
      const match = rawContent.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (parsed && typeof parsed.category === 'string') {
          return {
            category: parsed.category as JevSupportCategory,
            confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.9,
            isVectorGrounded: typeof parsed.isVectorGrounded === 'boolean' ? parsed.isVectorGrounded : local.isVectorGrounded,
            isEscalation: typeof parsed.isEscalation === 'boolean' ? parsed.isEscalation : local.isEscalation,
            explanation: typeof parsed.explanation === 'string' ? parsed.explanation : local.explanation,
          };
        }
      }
    }
  } catch {
    // If upstream Jev classification call fails or times out, fall back safely to local heuristic
  }

  return local;
}
