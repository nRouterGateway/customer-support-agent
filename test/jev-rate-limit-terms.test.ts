import { describe, it, expect } from 'vitest';
import { classifyLocal } from '../src/jev.js';

describe('jev rate-limit term classification (RPS, RPD, RPM, TPM)', () => {
  it('routes questions mentioning RPS, RPD, RPM, or TPM as whole words to quota_fallback', () => {
    for (const question of [
      'What is the RPS cap on my plan?',
      'How does per-second rps enforcement work?',
      'What happens when I exceed my daily RPD allowance?',
      'How do I check my rpd usage for today?',
      'How is RPM measured across my organization?',
      'What is the default rpm on the Pay as you go plan?',
      'How does TPM count input and output tokens?',
      'Where can I see my tpm throughput?',
      'My key is capped at 500rpm, why?',
      'I keep hitting 10rps on my key',
      'How many rpms does my plan allow?',
    ]) {
      const result = classifyLocal(question);
      expect(result.category, question).toBe('quota_fallback');
      expect(result.isVectorGrounded, question).toBe(true);
    }
  });

  it('does not false-positive on words containing rps as a substring such as corpse or harps', () => {
    for (const question of [
      'Why did the story mention a corpse in the prompt?',
      'Can the model write an essay about harps and string instruments?',
    ]) {
      const result = classifyLocal(question);
      expect(result.category, question).not.toBe('quota_fallback');
      expect(result.category, question).toBe('general_inquiry');
    }
  });
});
