import { describe, expect, it } from 'vitest';
import { curatedAnswer, FAQ_ENTRIES } from '../src/curated-answers.js';

function answerText(question: string): string | undefined {
  const answer = curatedAnswer(question)?.find((event) => event.type === 'token');
  return answer?.type === 'token' ? answer.text : undefined;
}

describe('curated dashboard answers', () => {
  it('answers custom guardrail setup without inventing form details', () => {
    const events = curatedAnswer('how to setup custom guardrails');
    expect(events).toBeDefined();
    const answer = events?.find((event) => event.type === 'token');
    expect(answer?.type).toBe('token');
    if (answer?.type !== 'token') return;
    expect(answer.text).toContain('Guardrails → Keys');
    expect(answer.text).toContain('open **Test**');
    expect(answer.text).toContain('does not specify the Custom creation form');
    expect(answer.text).not.toContain('Create guardrail');
    expect(answer.text).not.toContain('webhook timeout');
    // The organization role is "org admin"; a bare "admin" names no role a customer has.
    expect(answer.text).toContain('Owners and org admins');
    expect(answer.text).not.toMatch(/\b(?<!org )admins?\b/i);
  });

  it('does not intercept unrelated or non-procedural questions', () => {
    expect(curatedAnswer('What are custom guardrails?')).toBeUndefined();
    expect(curatedAnswer('How do billing plans work?')).toBeUndefined();
  });
});

describe('FAQ answers', () => {
  it.each([
    ['What does nRouter do?', 'one OpenAI-compatible API'],
    ['Is nRouter OpenAI-compatible?', 'https://api.nrouter.ai/v1'],
    ['How do I create an API key?', '**API Keys**'],
    ['how to create an api key guide me', '`NROUTER_API_KEY`'],
    ['What is the API base URL?', 'https://api.nrouter.ai/v1/chat/completions'],
    ['Which models are live right now?', 'live catalog'],
    ['Do I need separate keys for every provider?', 'Bring your own keys'],
    ['How does the platform fee work?', '0% platform fee'],
    ['What does available credit balance mean?', 'minus amounts reserved'],
    ['How can I top up credits?', 'Only Owners can buy credits'],
    ['Which plan should I choose?', 'Pay as you go'],
    ['What happens when I run out of credits?', '`insufficient_credits`'],
    ['How can I test a model?', 'Open **Playground**'],
    ['Does Playground cost credits?', 'Yes. Playground requests'],
    ['Why am I getting HTTP 429?', '`Retry-After`'],
    ['How do budgets differ from credit balance?', '`budget_exceeded`'],
    ['Do I need code to use guardrails?', 'No application code change'],
    ['Does a blocked guardrail cost credits?', 'post-call block'],
    ['How do I set up custom guardrails?', 'Guardrails → Keys'],
    ['How do I integrate custom guardrails with nRouter?', 'call your webhook'],
    ['Are prompts and completions stored in logs?', 'never written to the request log'],
    ['Where can I see request logs?', 'Open **Logs**'],
    ['Do analytics reports use credits?', 'does not consume credits'],
    ['Who can invite members?', 'Org Admins'],
    ['How do I rotate an API key?', 'grace window'],
    ['What happens when an API key expires?', 'returns **401**'],
    ['The dashboard page is blank or stuck loading', 'hard reload'],
    ['My magic link did not arrive', 'Use a password instead'],
    ['How does response caching work?', 'non-streaming'],
    ['What is a model alias?', 'friendly name'],
  ])('serves the documented answer for: %s', (question, answerPart) => {
    const events = curatedAnswer(question);
    expect(events?.map((event) => event.type)).toEqual(['confidence', 'citations', 'token', 'done']);
    expect(answerText(question)).toContain(answerPart);
  });

  it('falls through to retrieval on broad, unrelated or capability questions', () => {
    expect(curatedAnswer('Tell me about football')).toBeUndefined();
    expect(curatedAnswer('How do I use a feature not in the docs?')).toBeUndefined();
    // A capability question needs the docs, not a catalogue link.
    expect(curatedAnswer('Which models support vision input?')).toBeUndefined();
    // Bring-your-own-key questions belong to the BYOK docs, not a canned "no provider keys" answer.
    expect(curatedAnswer('Can I use my own OpenAI provider keys?')).toBeUndefined();
    expect(curatedAnswer('How do I raise my rate limits?')).toBeUndefined();
  });

  it('states the 0% platform fee and never a percentage fee on top', () => {
    const text = answerText('How does the platform fee work?') ?? '';
    expect(text).toContain('0%');
    for (const entry of FAQ_ENTRIES) {
      expect(entry.answer).not.toMatch(/\b[1-9]\d*(?:\.\d+)?%\s*(?:platform\s+)?fee/i);
      expect(entry.answer).not.toContain('$25,000');
    }
  });

  it('every answer names roles precisely, cites an nrouter.ai docs page, and links only nrouter.ai hosts', () => {
    expect(FAQ_ENTRIES.length).toBeGreaterThan(20);
    for (const entry of FAQ_ENTRIES) {
      expect(entry.answer, entry.question).not.toMatch(/\b(?<!org )admins?\b/i);
      expect(entry.source.url, entry.question).toMatch(/^https:\/\/nrouter\.ai\/docs\//);
      for (const [, url] of entry.answer.matchAll(/\]\((https?:[^)\s]+)\)/g)) {
        expect(url, entry.question).toMatch(/^(?:https:\/\/(?:app\.|api\.)?nrouter\.ai(?:\/|$)|mailto:support@nrouter\.ai$)/);
      }
      expect(entry.answer, entry.question).not.toMatch(/\b(?:NRouter|Nrouter|N-Router)\b/);
    }
  });

  it('every entry is reachable by its own example question', () => {
    for (const entry of FAQ_ENTRIES) {
      const citation = curatedAnswer(entry.question)?.find((event) => event.type === 'citations');
      expect(citation, entry.question).toBeDefined();
      if (citation?.type !== 'citations') continue;
      expect(citation.citations[0]?.url, entry.question).toBe(entry.source.url);
    }
  });
});
