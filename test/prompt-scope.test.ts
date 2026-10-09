import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from '../src/prompt.js';

describe('support scope prompt', () => {
  it('keeps answers within the configured support domain', () => {
    const prompt = buildSystemPrompt({
      agentName: 'Support',
      instructions: '',
      chunks: [],
    });
    expect(prompt).toContain('Stay within the configured support scope');
    expect(prompt).toContain('sports, entertainment, politics, or homework');
  });
});
