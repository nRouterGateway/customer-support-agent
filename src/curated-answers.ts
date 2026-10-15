import type { AgentEvent } from './types.js';

const CUSTOM_GUARDRAIL_SETUP = /\b(?:how\s+(?:(?:do\s+i\s+)?|to\s+)?(?:set\s*up|setup|create|configure)|steps?\s+(?:to|for))\b/i;

/**
 * A small deterministic answer for a dashboard procedure whose UI form details
 * are absent from the public docs. This keeps the model from inventing controls.
 */
export function curatedAnswer(question: string): AgentEvent[] | undefined {
  if (!/\bcustom\s+guardrails?\b/i.test(question) || !CUSTOM_GUARDRAIL_SETUP.test(question)) return;

  return [
    {
      type: 'confidence',
      level: 'high',
      score: 1,
      webSearched: false,
    },
    {
      type: 'citations',
      citations: [{ title: 'Guardrails', url: 'https://nrouter.ai/docs/guides/guardrails' }],
    },
    {
      type: 'token',
      text: 'Open the [nRouter dashboard](https://app.nrouter.ai) and go to your organization’s **Guardrails** page. Custom guardrails call your webhook. Owners and org admins can create and manage guardrails; to assign one to a virtual key, go to **Guardrails → Keys**. Expand a guardrail and open **Test** to try sample input before using it. The public guide does not specify the Custom creation form or webhook request/response details, so I can’t give verified field-by-field setup instructions. See the [Guardrails guide](https://nrouter.ai/docs/guides/guardrails).',
    },
    { type: 'done' },
  ];
}
