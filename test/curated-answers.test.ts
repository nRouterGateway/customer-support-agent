import { describe, expect, it } from 'vitest';
import { curatedAnswer } from '../src/curated-answers.js';

describe('FAQ cache', () => {
  it.each([
    ['What does nRouter do?', 'one API key'],
    ['Is nRouter OpenAI-compatible?', 'https://api.nrouter.ai/v1'],
    ['How do I create an API key?', '**Generate Key**'],
    ['how to create an api key guide me', '`NROUTER_API_KEY`'],
    ['What is the API base URL?', 'https://api.nrouter.ai/v1'],
    ['Which models are live right now?', 'live catalog'],
    ['Do I need separate keys for every provider?', 'No. Use the same nRouter virtual key'],
    ['How does the platform fee work?', 'flat 4%'],
    ['What does available credit balance mean?', 'minus amounts reserved'],
    ['How can I top up credits?', '$5–$25,000'],
    ['Which plan should I choose?', 'All plans include the platform features'],
    ['What happens when I run out of credits?', 'HTTP **402**'],
    ['How can I test a model?', 'Open **Playground**'],
    ['Does Playground cost credits?', 'Yes. Playground calls'],
    ['Why am I getting HTTP 429?', '`Retry-After`'],
    ['How do budgets differ from credit balance?', 'Credits are the overall balance'],
    ['Do I need code to use guardrails?', 'No application code change'],
    ['Does a blocked guardrail cost credits?', 'costs zero model credits'],
    ['How do I set up custom guardrails?', 'Guardrails → Keys'],
    ['How do I integrate custom guardrails with nRouter?', 'webhook to make the decision'],
    ['Are prompts and completions stored in logs?', 'No. The request log stores metadata'],
    ['Where can I see request logs?', 'Open **Logs**'],
    ['Do analytics reports use credits?', 'they do not consume credits'],
    ['Who can invite members?', '**Owners** and **Admins**'],
    ['How do I rotate an API key?', 'Create a replacement key'],
    ['What happens when an API key expires?', 'returns **401**'],
    ['The dashboard page is blank or stuck loading', 'Refresh the page first'],
    ['My magic link did not arrive', 'Check your spam and Promotions folders'],
    ['How does response caching work?', 'non-streaming'],
    ['How do I handle tool calls in a streaming chat response in the TypeScript SDK?', 'collect each `chunk.choices[0]?.delta?.tool_calls` fragment'],
    ['What is a model alias?', 'friendly routing name'],
  ])('serves the documented cached answer for: %s', (question, answerPart) => {
    const events = curatedAnswer(question);
    expect(events?.map((event) => event.type)).toEqual(['confidence', 'citations', 'token', 'done']);
    const answer = events?.find((event) => event.type === 'token');
    expect(answer?.type).toBe('token');
    if (answer?.type !== 'token') return;
    expect(answer.text).toContain(answerPart);
    expect(events?.find((event) => event.type === 'citations')).toBeDefined();
  });

  it('does not guess on a broad or unrelated question; those continue to RAG', () => {
    expect(curatedAnswer('What are custom guardrails?')).toBeUndefined();
    expect(curatedAnswer('Tell me about football')).toBeUndefined();
    expect(curatedAnswer('How do I use a feature not in the docs?')).toBeUndefined();
  });
});
