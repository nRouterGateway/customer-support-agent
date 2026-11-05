import { describe, it, expect, vi } from 'vitest';
import {
  classifyLocal,
  classifyWithJev,
  buildJevSystemOnePayload,
  isValidJevSupportCategory,
  JEV_MODEL,
  JEV_SUPPORT_CATEGORIES,
} from '../src/jev.js';
import { handleSupportTurnWithJev, PLAYBOOK } from '../src/agent.js';
import type { nRouter } from '@nrouter_ai/sdk';

describe('jev classification module', () => {
  it('classifies local questions across all support taxonomy categories', () => {
    expect(classifyLocal('I want to talk to an agent or representative').isEscalation).toBe(true);
    expect(classifyLocal('I want to talk to an agent or representative').category).toBe('escalation');

    expect(classifyLocal('Schedule a product demo with sales').category).toBe('booking');
    expect(classifyLocal('Hello there! Good morning.').category).toBe('small_talk');

    expect(classifyLocal('How do I configure virtual keys with a $50 spend ceiling?').category).toBe('virtual_keys');
    expect(classifyLocal('How do I generate an API key?').category).toBe('api_keys');

    expect(classifyLocal('Can I register an MCP server through the MCP Hub?').category).toBe('mcp');
    expect(classifyLocal('What is the difference between Pipeline Canvas and Timeline Gantt?').category).toBe('dashboard');

    expect(classifyLocal('What happens when I receive a 402 payment required error?').category).toBe('billing');
    expect(classifyLocal('How does 429 quota fallback to a secondary model work?').category).toBe('quota_fallback');

    expect(classifyLocal('How is PII masked on credit cards and emails?').category).toBe('guardrails');
    expect(classifyLocal('What is the capital of France?').category).toBe('off_topic');
    expect(classifyLocal('Tell me about nRouter capabilities').category).toBe('general_inquiry');

    // 3.1.3 contracts: model deny lists, pot routes, and pot limits
    expect(classifyLocal('Why did my request fail with model_denied_by_org?').category).toBe('virtual_keys');
    expect(classifyLocal('How does model_denied_by_team or model_denied_by_key work?').category).toBe('virtual_keys');
    expect(classifyLocal('How do I configure a model deny list?').category).toBe('virtual_keys');
    expect(classifyLocal('What happens when pot_spend_limit_exceeded occurs?').category).toBe('quota_fallback');
    expect(classifyLocal('How does promotional credit work on Promo models (promo_model_policy)?').category).toBe('billing');
    expect(classifyLocal('Can I run hackathon models using Hack (hack_model_policy)?').category).toBe('billing');
    expect(classifyLocal('Why was my call refused with pot_route_feature_unsupported?').category).toBe('billing');
    expect(classifyLocal('How do I set nrouter_optimize to cost for nrouter/auto?').category).toBe('general_inquiry');
  });

  it('correctly flags isVectorGrounded for support knowledge categories', () => {
    expect(classifyLocal('How do I restrict models on a virtual key?').isVectorGrounded).toBe(true);
    expect(classifyLocal('Where are spend logs located?').isVectorGrounded).toBe(true);
    expect(classifyLocal('What is the weather in London?').isVectorGrounded).toBe(false);
    expect(classifyLocal('Hello').isVectorGrounded).toBe(false);
  });

  it('classifies using remote Jev model and parses JSON output', async () => {
    const fakeClient = {
      nr: {
        chat: vi.fn().mockResolvedValue({
          body: {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    category: 'dashboard',
                    confidence: 0.96,
                    isVectorGrounded: true,
                    isEscalation: false,
                    explanation: 'Dashboard canvas question',
                  }),
                },
              },
            ],
          },
        }),
      },
    } as unknown as nRouter;

    const result = await classifyWithJev(fakeClient, 'Show me the trace canvas in the dashboard');
    expect(result.category).toBe('dashboard');
    expect(result.confidence).toBe(0.96);
    expect(result.isVectorGrounded).toBe(true);
    expect(fakeClient.nr.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        model: JEV_MODEL,
      }),
    );
  });

  it('falls back safely to local classification on upstream chat failure', async () => {
    const failingClient = {
      nr: {
        chat: vi.fn().mockRejectedValue(new Error('500 Service Unavailable')),
      },
    } as unknown as nRouter;

    const result = await classifyWithJev(failingClient, 'How do I add an MCP server in nRouter?');
    expect(result.category).toBe('mcp');
    expect(result.isVectorGrounded).toBe(true);
  });

  it('validates all 12 JEV_SUPPORT_CATEGORIES and falls back to classifyLocal on invalid LLM category instead of throwing TypeError in PLAYBOOK', async () => {
    expect(JEV_SUPPORT_CATEGORIES).toHaveLength(12);
    for (const cat of JEV_SUPPORT_CATEGORIES) {
      expect(isValidJevSupportCategory(cat)).toBe(true);
      expect(PLAYBOOK[cat]).toBeDefined();
    }
    expect(isValidJevSupportCategory('unknown_hallucinated_category')).toBe(false);
    expect(isValidJevSupportCategory(null)).toBe(false);
    expect(isValidJevSupportCategory(42)).toBe(false);

    const hallucinatingClient = {
      nr: {
        chat: vi.fn().mockResolvedValue({
          body: {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    category: 'hallucinated_category_xyz',
                    confidence: 0.99,
                    isVectorGrounded: true,
                    isEscalation: false,
                  }),
                },
              },
            ],
          },
        }),
      },
    } as unknown as nRouter;

    const turnOut = await handleSupportTurnWithJev(
      { message: 'How do I add an MCP server in nRouter?' },
      hallucinatingClient,
    );
    expect(turnOut.category).toBe('mcp');
    expect(turnOut.action).toBe('guide_mcp');
    expect(turnOut.playbook).toEqual(PLAYBOOK.mcp);
  });

  it('falls back to classifyLocal when LLM confidence is missing, NaN, or below 0.6 (never fabricates 0.9)', async () => {
    for (const badPayload of [
      { category: 'off_topic' },
      { category: 'off_topic', confidence: Number.NaN },
      { category: 'off_topic', confidence: 0.45 },
      { category: 'off_topic', confidence: '0.95' },
    ]) {
      const client = {
        nr: {
          chat: vi.fn().mockResolvedValue({
            body: {
              choices: [
                {
                  message: {
                    content: JSON.stringify(badPayload),
                  },
                },
              ],
            },
          }),
        },
      } as unknown as nRouter;

      // Local classifies this as 'billing' with confidence 0.91 (not 0.9)
      const decision = await classifyWithJev(client, 'Why did my call fail with 402 payment required?');
      expect(decision.category).toBe('billing');
      expect(decision.confidence).toBe(0.91);
      expect(decision.confidence).not.toBe(0.9);
    }
  });

  it('builds the native /v1/systemone choice payload and runs handleSupportTurnWithJev end-to-end', async () => {
    const payload = buildJevSystemOnePayload('Where can I view spend logs in the dashboard?');
    expect(payload).toEqual({
      state: 'Where can I view spend logs in the dashboard?',
      questions: {
        choice: {
          type: 'choice',
          question: expect.any(String),
          options: JEV_SUPPORT_CATEGORIES,
        },
      },
    });

    const validClient = {
      nr: {
        chat: vi.fn().mockResolvedValue({
          body: {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    category: 'guardrails',
                    confidence: 0.88,
                    isVectorGrounded: true,
                    isEscalation: false,
                    explanation: 'Guardrail configuration inquiry',
                  }),
                },
              },
            ],
          },
        }),
      },
    } as unknown as nRouter;

    const output = await handleSupportTurnWithJev(
      { message: 'Tell me about nRouter capabilities for content safety', tenantId: 'org-1', userId: 'u-1' },
      validClient,
    );
    expect(output.category).toBe('guardrails');
    expect(output.confidence).toBe(0.88);
    expect(output.isVectorGrounded).toBe(true);
    expect(output.isEscalation).toBe(false);
    expect(output.action).toBe('guide_guardrails');
    expect(output.route).toBe('https://nrouter.ai/docs/guides/guardrails');
    expect(output.reply).toContain('Guardrails');
  });
});
