import type { AgentEvent } from './types.js';

interface FaqEntry {
  question: string;
  match: RegExp;
  answer: string;
  source: { title: string; url: string };
}

/**
 * Small, reviewed CAG/FAQ lane. These common questions are answered directly
 * from the docs, with no model or retrieval call. Anything that does not match
 * safely falls through to RAG over the complete nRouter documentation corpus.
 * Keep this bank small and refresh answers when the linked docs change.
 */
const FAQ_CACHE: FaqEntry[] = [
  {
    question: 'What is nRouter?',
    match: /\bwhat (?:is|does) nrouter(?: do)?\b/,
    answer: 'nRouter is an LLM gateway: use one API key and OpenAI-compatible API to call models from its catalog, with shared billing, routing, budgets, and guardrails. See the [introduction](https://nrouter.ai/docs/getting-started/introduction).',
    source: { title: 'Introduction', url: 'https://nrouter.ai/docs/getting-started/introduction' },
  },
  {
    question: 'Is nRouter OpenAI-compatible?',
    match: /\b(?:openai[ -]?compatible|compatible with openai|use (?:the )?openai sdk)\b/,
    answer: 'Yes. Keep your OpenAI SDK or HTTP client, set its base URL to `https://api.nrouter.ai/v1`, and use an nRouter virtual key. The [quick start](https://nrouter.ai/docs/getting-started/quick-start) has working examples.',
    source: { title: 'Quick Start', url: 'https://nrouter.ai/docs/getting-started/quick-start' },
  },
  {
    question: 'Where do I create or find an API key?',
    match: /\b(?:where\b.{0,35}\b(?:create|find|get|manage)\b|\b(?:create|generate|make)\b.{0,35})\b(?:an?\s+)?(?:virtual\s+)?api\s+keys?\b|\bapi keys?\s+(?:live|located)\b/,
    answer: '1. Sign in to the [nRouter dashboard](https://app.nrouter.ai), select your organization, and open **API Keys**.\n\n2. Select **Generate Key**, enter a descriptive name, and optionally choose a team and set a budget.\n\n3. Copy the full `sk-nrouter-...` key immediately. nRouter shows the secret only once; store it in a server-side environment variable or secrets manager, not in browser code or Git. For example, set `NROUTER_API_KEY` in your terminal or local `.env` file.\n\n4. Test it with the [Quick Start](https://nrouter.ai/docs/getting-started/quick-start) cURL example. Replace the sample model with one available to your team. API requests use your credits.\n\nIf the key is exposed, revoke it in **API Keys** and create a replacement. See [Authentication](https://nrouter.ai/docs/getting-started/authentication) for the complete steps.',
    source: { title: 'Authentication — Creating API Keys', url: 'https://nrouter.ai/docs/getting-started/authentication' },
  },
  {
    question: 'What API base URL should I use?',
    match: /\b(?:base\s+url|api\s+endpoint|endpoint\s+url)\b/,
    answer: 'Use `https://api.nrouter.ai/v1` as the API base URL. For chat completions, the full endpoint is `https://api.nrouter.ai/v1/chat/completions`. See the [Quick Start](https://nrouter.ai/docs/getting-started/quick-start).',
    source: { title: 'Quick Start', url: 'https://nrouter.ai/docs/getting-started/quick-start' },
  },
  {
    question: 'Which models are available right now?',
    match: /\b(?:which|what)\s+models?\b|\b(?:available|live|current)\b.{0,20}\bmodels?\b|\bmodels?\b.{0,25}\b(?:available|live|supported)\b/,
    answer: 'The live catalog is the source of truth for models available to your organization. View it in the [dashboard](https://app.nrouter.ai/models) or query the [Models API](https://app.nrouter.ai/api/public/models). Browsing the catalog is free; model requests are billed.',
    source: { title: 'Models', url: 'https://nrouter.ai/docs/guides/models' },
  },
  {
    question: 'Do I need a separate API key for each model provider?',
    match: /\bseparate\b.{0,35}\b(?:provider|model)\b.{0,20}\bkeys?\b|\bseparate\b.{0,35}\bkeys?\b.{0,20}\bproviders?\b|\bone key\b.{0,30}\bproviders?\b|\bprovider keys?\b/,
    answer: 'No. Use the same nRouter virtual key and API endpoint for models in the catalog; pass the chosen model ID in the request. You do not manage provider keys yourself. See [Models](https://nrouter.ai/docs/guides/models).',
    source: { title: 'Models', url: 'https://nrouter.ai/docs/guides/models' },
  },
  {
    question: 'How does the platform fee work?',
    match: /\bplatform fee\b|\bservice fee\b/,
    answer: 'The platform fee is a flat 4% of the credits purchased and is added on top, so it does not reduce your credit balance. For example, $100 of credits costs $104; the $5 minimum purchase costs $5.20. See [Billing & Credits](https://nrouter.ai/docs/guides/billing).',
    source: { title: 'Billing & Credits', url: 'https://nrouter.ai/docs/guides/billing' },
  },
  {
    question: 'What is the difference between a budget and credits?',
    match: /\bbudgets?\b.{0,35}\b(?:credit balance|credits?)\b|\b(?:credits?|credit balance)\b.{0,35}\bbudgets?\b/,
    answer: 'Credits are the overall balance that requests settle against. Budgets cap spend over a chosen period, while rate limits cap request or token throughput. A request can be blocked when either control is exceeded. See [Budget Controls](https://nrouter.ai/docs/guides/budget-controls).',
    source: { title: 'Budget Controls', url: 'https://nrouter.ai/docs/guides/budget-controls' },
  },
  {
    question: 'What does available credit balance mean?',
    match: /\bavailable credits?\b|\bcredit balance\b|\bhow do credits work\b/,
    answer: 'Available credits are your balance minus amounts reserved for requests that are still in flight. Completed model requests settle against that balance. See [Billing & Credits](https://nrouter.ai/docs/guides/billing).',
    source: { title: 'Billing & Credits', url: 'https://nrouter.ai/docs/guides/billing' },
  },
  {
    question: 'How do I add or top up credits?',
    match: /\b(?:buy|purchase|add|top[ -]?up|load)\b.{0,35}\bcredits?\b|\bcredits?\b.{0,25}\b(?:top[ -]?up|purchase|buy)\b/,
    answer: 'In the dashboard, open **Billing** and purchase credits. The documented range is $5–$25,000 per transaction; only owners can buy credits or change plans. Owners and admins can manage auto top-up. The platform fee is added on top. See [Billing & Credits](https://nrouter.ai/docs/guides/billing).',
    source: { title: 'Billing & Credits', url: 'https://nrouter.ai/docs/guides/billing' },
  },
  {
    question: 'What do the nRouter plans include?',
    match: /\b(?:which|what|compare)\b.{0,25}\bplans?\b|\bplans?\b.{0,25}\b(?:include|cost|pricing|allowance)\b/,
    answer: 'All plans include the platform features. They differ in the monthly `nrouter/auto` allowance, organization rate limits, and log retention. Check the [Pricing page](https://nrouter.ai/pricing) for current plan figures and the [Billing guide](https://nrouter.ai/docs/guides/billing) for how allowances work.',
    source: { title: 'Billing & Credits', url: 'https://nrouter.ai/docs/guides/billing' },
  },
  {
    question: 'What happens when I run out of credits or plan allowance?',
    match: /\b(?:run out|out of|exhaust(?:ed)?)\b.{0,35}\b(?:credits?|allowance)\b|\binsufficient credits\b|\bplan allowance exhausted\b/,
    answer: 'An empty credit balance returns HTTP **402** (`insufficient_credits`). An exhausted `nrouter/auto` monthly allowance also returns **402** (`plan_allowance_exhausted`); requests naming a specific model can continue using pay-as-you-go credits. See [Billing & Credits](https://nrouter.ai/docs/guides/billing).',
    source: { title: 'Billing & Credits', url: 'https://nrouter.ai/docs/guides/billing' },
  },
  {
    question: 'How do I try a model in the dashboard?',
    match: /\b(?:how|where)\b.{0,30}\b(?:test|try|play with)\b.{0,20}\bmodels?\b|\bplayground\b.{0,25}\b(?:use|start|test)\b/,
    answer: 'Open **Playground** in the dashboard, paste a virtual key, choose a model, and send a prompt. You can use **View Code** to get a matching SDK example. See the [Playground guide](https://nrouter.ai/docs/guides/playground).',
    source: { title: 'Playground', url: 'https://nrouter.ai/docs/guides/playground' },
  },
  {
    question: 'Do Playground requests cost credits?',
    match: /\bplayground\b.{0,40}\b(?:cost|credits?|billed|billing|money)\b|\b(?:cost|billed)\b.{0,30}\bplayground\b/,
    answer: 'Yes. Playground calls use the same API and virtual key as production, so requests are billed against your credits and key budgets, rate limits, and guardrails apply. There is no separate free test environment. See [Playground](https://nrouter.ai/docs/guides/playground).',
    source: { title: 'Playground', url: 'https://nrouter.ai/docs/guides/playground' },
  },
  {
    question: 'Why am I getting HTTP 429?',
    match: /\b429\b|\brate[ -]?limit(?:ed|ing|s)?\b/,
    answer: 'HTTP **429** means the request exceeded a configured request or token rate limit. The response includes `Retry-After`; wait that long before retrying. If it happens regularly, review your key and organization limits in the [Budget Controls guide](https://nrouter.ai/docs/guides/budget-controls).',
    source: { title: 'Budget Controls', url: 'https://nrouter.ai/docs/guides/budget-controls' },
  },
  {
    question: 'Do I need code changes to use guardrails?',
    match: /\bguardrails?\b.{0,45}\b(?:code|application|sdk)\b|\b(?:code|application)\b.{0,35}\bguardrails?\b/,
    answer: 'No application code change is needed for configured guardrails. They run in the request path once enabled and assigned in the dashboard. See the [Guardrails guide](https://nrouter.ai/docs/guides/guardrails).',
    source: { title: 'Guardrails', url: 'https://nrouter.ai/docs/guides/guardrails' },
  },
  {
    question: 'Am I charged when a guardrail blocks a request?',
    match: /\bguardrails?\b.{0,45}\b(?:charged|charge|cost|credits?)\b|\b(?:charged|charge|cost|credits?)\b.{0,35}\bguardrails?\b/,
    answer: 'No. A blocked request is stopped before it reaches the model provider, so it costs zero model credits. Redact, Warn, and Log actions let the request continue and are billed normally. See [Guardrails](https://nrouter.ai/docs/guides/guardrails).',
    source: { title: 'Guardrails', url: 'https://nrouter.ai/docs/guides/guardrails' },
  },
  {
    question: 'How do I set up custom guardrails?',
    match: /\bcustom\s+guardrails?\b.*\b(?:how|setup|set up|configure|create|steps?|integrate|integration)\b|\b(?:how|setup|set up|configure|create|integrate|integration)\b.*\bcustom\s+guardrails?\b/,
    answer: '1. Sign in to the [nRouter dashboard](https://app.nrouter.ai) and open **Guardrails** for your organization.\n\n2. An owner or admin can create a **Custom** guardrail. It calls your webhook to make the decision. Choose the documented mode—**pre-call** or **post-call**—and action: **Block**, **Redact**, **Warn**, or **Log**.\n\n3. To apply it to a particular virtual key, open **Guardrails → Keys** and assign it there. Organization and team scopes are also available.\n\n4. Expand the guardrail and use **Test** with sample input before relying on it. After requests run, check **Guardrails → Logs** for the outcome and request ID.\n\nThe public guide does not define the Custom form fields or webhook request/response schema, so use the dashboard or linked API reference for those exact integration details. Do not assume OpenRouter-specific `moderation` parameters or endpoints apply to nRouter. See the [Guardrails guide](https://nrouter.ai/docs/guides/guardrails).',
    source: { title: 'Guardrails', url: 'https://nrouter.ai/docs/guides/guardrails' },
  },
  {
    question: 'Are prompts and completions stored in request logs?',
    match: /\b(?:prompts?|completions?|request content|response content)\b.{0,40}\b(?:stored|logged|logs?)\b|\b(?:stored|logged)\b.{0,35}\b(?:prompts?|completions?)\b/,
    answer: 'No. The request log stores metadata such as model, tokens, cost, latency, and status—not prompt or completion content. A separate short-lived serving cache may hold an eligible response briefly; it is not part of the request log. See [Observability & Logs](https://nrouter.ai/docs/guides/observability).',
    source: { title: 'Observability & Logs', url: 'https://nrouter.ai/docs/guides/observability' },
  },
  {
    question: 'Where can I see request logs?',
    match: /\b(?:where|how)\b.{0,30}\b(?:view|find|see|open)\b.{0,20}\b(?:request\s+)?logs?\b|\brequest logs?\b/,
    answer: 'Open **Logs** in the dashboard to inspect requests, status, model, token counts, cost, latency, and request IDs. You can filter the list or search by request ID. See [Observability & Logs](https://nrouter.ai/docs/guides/observability).',
    source: { title: 'Observability & Logs', url: 'https://nrouter.ai/docs/guides/observability' },
  },
  {
    question: 'Do analytics reports use credits?',
    match: /\banalytics\b.{0,45}\b(?:cost|credits?|rate limits?)\b|\b(?:cost|credits?)\b.{0,30}\b(?:viewing|opening)\b.{0,20}\banalytics\b/,
    answer: 'No. Viewing reports, changing their time range, and exporting a CSV use existing request history; they do not consume credits or count against RPM/TPM limits. See [Analytics & Reports](https://nrouter.ai/docs/guides/analytics).',
    source: { title: 'Analytics & Reports', url: 'https://nrouter.ai/docs/guides/analytics' },
  },
  {
    question: 'Who can invite teammates?',
    match: /\bwho\b.{0,30}\b(?:invite|add)\b.{0,20}\b(?:teammates?|members?|users?)\b|\b(?:invite|add)\b.{0,25}\b(?:teammates?|members?)\b/,
    answer: 'Only organization **Owners** and **Admins** can invite members. Invites are managed under **People → Members** and expire after 7 days if not accepted. See [Team Management](https://nrouter.ai/docs/guides/team-management).',
    source: { title: 'Team Management', url: 'https://nrouter.ai/docs/guides/team-management' },
  },
  {
    question: 'How do I rotate an API key safely?',
    match: /\b(?:rotate|rotation)\b.{0,35}\b(?:api\s+)?keys?\b|\bapi\s+key\b.{0,35}\brotate\b/,
    answer: 'Create a replacement key with the same scopes, deploy it to your app, confirm it is being used, then revoke the old key. The secret is not swapped in place; the explicit handoff prevents forgotten consumers from staying active. See [API Key Management](https://nrouter.ai/docs/guides/api-key-management).',
    source: { title: 'API Key Management', url: 'https://nrouter.ai/docs/guides/api-key-management' },
  },
  {
    question: 'What happens when an API key expires?',
    match: /\b(?:api\s+)?key\b.{0,35}\bexpire(?:s|d|ation)?\b|\bkey expiration\b/,
    answer: 'An expired key returns **401**. The default expiry is **Never**; where enabled, you can choose 30 days, 90 days, or a custom date. Create a replacement key before expiry to avoid interruption. See [API Key Management](https://nrouter.ai/docs/guides/api-key-management).',
    source: { title: 'API Key Management', url: 'https://nrouter.ai/docs/guides/api-key-management' },
  },
  {
    question: 'What should I do if a dashboard page is blank or stuck?',
    match: /\b(?:dashboard|page)\b.{0,45}\b(?:blank|stuck|loading)\b|\b(?:blank|stuck loading)\b.{0,30}\b(?:dashboard|page)\b/,
    answer: 'Refresh the page first. If it remains stuck, sign out and back in; then try a hard refresh or private window. If it still fails, email [support@nrouter.ai](mailto:support@nrouter.ai) with the page URL and roughly when it happened. These steps are in [Troubleshooting](https://nrouter.ai/docs/guides/troubleshooting).',
    source: { title: 'Troubleshooting', url: 'https://nrouter.ai/docs/guides/troubleshooting' },
  },
  {
    question: 'What do I do if I cannot sign in or the magic link does not arrive?',
    match: /\b(?:can't|cannot|unable to)\s+sign\s+in\b|\blogin loop\b|\bmagic link\b.{0,35}\b(?:arrive|receive|missing|email)\b|\bsign[ -]?in email\b/,
    answer: 'Check your spam and Promotions folders. If the magic link is missing, choose **Use a password instead** on the login screen or use **Forgot password** to reset your password. If you are still blocked, contact [nRouter support](mailto:support@nrouter.ai). See [Troubleshooting](https://nrouter.ai/docs/guides/troubleshooting).',
    source: { title: 'Troubleshooting', url: 'https://nrouter.ai/docs/guides/troubleshooting' },
  },
  {
    question: 'How does nRouter response caching work?',
    match: /\b(?:response|request) caching\b|\bcache\b.{0,35}\b(?:enabled|work|hit|miss|stored)\b|\b(?:cached|cache hit)\b/,
    answer: 'Response caching is on by default for eligible, identical **non-streaming** requests. A hit avoids another provider call and is billed at the model’s cache-read input rate with no output charge—it is cheaper, not free. Streaming requests are not cached. You can disable caching organization-wide in settings or send `nrouter_cache: false` on one request. See [Router Settings](https://nrouter.ai/docs/guides/router-settings).',
    source: { title: 'Router Settings', url: 'https://nrouter.ai/docs/guides/router-settings' },
  },
  {
    question: 'How do I handle tool calls in a streaming TypeScript chat?',
    match: /\b(?:tool|function) calls?\b.{0,100}\b(?:stream|streaming|typescript|javascript|node\.?js)\b|\b(?:stream|streaming)\b.{0,100}\b(?:tool|function) calls?\b/,
    answer: '1. Call `client.chat.completions.create()` with `stream: true` and a `tools` array; choose a model that supports tool calling.\n\n2. In the `for await...of` loop, collect each `chunk.choices[0]?.delta?.tool_calls` fragment by its `index`. Append the `id`, function name, and argument text as fragments arrive—arguments may be split across chunks.\n\n3. After the stream ends, parse and validate the complete arguments, then run the matching function on your server.\n\n4. Send a follow-up completion containing one assistant message with the completed `tool_calls` and a `tool` result message for each call, using its matching `tool_call_id`.\n\nSee the [TypeScript / Node.js streaming tool-call example](https://nrouter.ai/docs/sdks/nodejs#tool-calls-while-streaming).',
    source: { title: 'TypeScript / Node.js SDK — Tool calls while streaming', url: 'https://nrouter.ai/docs/sdks/nodejs#tool-calls-while-streaming' },
  },
  {
    question: 'What is a model alias?',
    match: /\bmodel alias\b|\balias\b.{0,30}\bmodel\b/,
    answer: 'A model alias is a friendly routing name you can pass in the `model` field instead of the full model ID. Not every model has an alias; check the model’s detail view in the [catalog](https://app.nrouter.ai/models). See [Models](https://nrouter.ai/docs/guides/models).',
    source: { title: 'Models', url: 'https://nrouter.ai/docs/guides/models' },
  },
];

/** A direct, documented FAQ response. Unmatched questions continue through RAG. */
export function curatedAnswer(question: string): AgentEvent[] | undefined {
  const normalizedQuestion = question.toLocaleLowerCase('en-US');
  const entry = FAQ_CACHE.find((faq) => faq.match.test(normalizedQuestion));
  if (!entry) return undefined;

  return [
    { type: 'confidence', level: 'high', score: 1, webSearched: false },
    { type: 'citations', citations: [entry.source] },
    { type: 'token', text: entry.answer },
    { type: 'done' },
  ];
}
