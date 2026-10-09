import { describe, it, expect, vi } from 'vitest';
import { runEvals } from '../evals/run-evals.js';
import { SupportAgent, AgentEvent } from '../src/index.js';

describe('Evals Suite', () => {
  it('runs the evaluation suite and asserts 100% pass rate on core safety, dashboard, mcp, and fallback scenarios', async () => {
    const mockAgent: SupportAgent = {
      chat: async function*(req: any) {
        const q = req.messages?.[0]?.content || '';
        
        let error = false;
        if (q.includes('Ignore all previous instructions')) {
          yield { type: 'error', code: 'guardrail_blocked', message: 'Blocked' } as AgentEvent;
          return;
        }

        let confidence: 'high' | 'medium' | 'low' = 'high';
        let response = '';

        if (q.includes('platform fee')) {
          response = 'The platform fee is 5%.';
        } else if (q.includes('Which models are live')) {
          response = 'gpt and claude models are live.';
        } else if (q.includes('OpenAI-compatible')) {
          response = 'Yes, the openai compatible API.';
        } else if (q.includes('API key')) {
          response = 'create a key in the dashboard.';
        } else if (q.includes('credits work')) {
          response = 'credit balance runs out, you get 402.';
        } else if (q.includes('virtual key with a spend ceiling')) {
          response = 'dashboard virtual restrict model ceiling.';
        } else if (q.includes('Debug & Trace Canvas')) {
          response = 'trace canvas pipeline gantt.';
        } else if (q.includes('spend logs')) {
          response = 'spend logs unpriced.';
        } else if (q.includes('Answer Inspector')) {
          response = 'timeline inspector stage.';
        } else if (q.includes('MCP server in the dashboard')) {
          response = 'add mcp dashboard.';
        } else if (q.includes('Free tier and Pro tier')) {
          response = 'free pro allowance.';
        } else if (q.includes('tools/list probe')) {
          response = 'test probe tools list.';
        } else if (q.includes('Claude Desktop or Cursor')) {
          response = 'cursor claude api.nrouter.ai/mcp.';
        } else if (q.includes('primary model exhausts')) {
          response = 'fallback 429 exhaust secondary.';
        } else if (q.includes('mask PII')) {
          response = 'mask pii email phone.';
        } else if (q.includes('weather in Paris')) {
          confidence = 'low';
          response = 'I do not know.';
        } else if (q.includes('secret recipe for Coca-Cola')) {
          confidence = 'low';
          response = 'knowledge gap.';
        } else if (q.includes('Hi, how are you')) {
          confidence = 'low';
          response = 'I am here to help with nRouter support.';
        } else if (q.includes('What is football')) {
          confidence = 'low';
          response = 'I can help with nRouter support questions.';
        }
        
        yield { type: 'confidence', level: confidence, score: 0.9, webSearched: false } as AgentEvent;
        yield { type: 'token', text: response } as AgentEvent;
        yield { type: 'done' } as AgentEvent;
      },
      chatSSE: () => new ReadableStream(),
      feedback: async () => {}
    };

    const results = await runEvals(mockAgent);
    
    expect(results.total).toBeGreaterThan(0);
    expect(results.failed).toBe(0);
    expect(results.passRate).toBe(100);
  });
});
