import type { AgentEvent, Citation } from './types.js';

/** One reviewed answer to a common nRouter question, served without retrieval or a model call. */
export interface FaqEntry {
  /** A representative question; it must match `match` (pinned by a test). */
  question: string;
  /** Tested against the lower-cased latest user message. The first matching entry wins. */
  match: RegExp;
  answer: string;
  source: Citation;
}

const DOCS = 'https://nrouter.ai/docs';
const GUARDRAILS: Citation = { title: 'Guardrails', url: `${DOCS}/guides/guardrails` };
const BILLING: Citation = { title: 'Billing & Credits', url: `${DOCS}/guides/billing` };
const QUICK_START: Citation = { title: 'Quick Start', url: `${DOCS}/getting-started/quick-start` };
const MODELS: Citation = { title: 'Model Catalog', url: `${DOCS}/guides/models` };
const BUDGETS: Citation = { title: 'Budget Controls', url: `${DOCS}/guides/budget-controls` };
const PLAYGROUND: Citation = { title: 'Playground', url: `${DOCS}/guides/playground` };
const OBSERVABILITY: Citation = { title: 'Observability & Logs', url: `${DOCS}/guides/observability` };
const KEY_MANAGEMENT: Citation = { title: 'API Key Management', url: `${DOCS}/guides/api-key-management` };
const TROUBLESHOOTING: Citation = { title: 'Troubleshooting', url: `${DOCS}/guides/troubleshooting` };

/**
 * A small, reviewed FAQ bank answered directly, with no embedding, retrieval or
 * model call. Every fact here must match the linked public docs page: these
 * answers bypass the retrieved docs, so a stale entry silently wins over the
 * current docs. Anything that does not match continues to retrieval.
 * Never add account-specific or tenant-specific facts: every visitor gets the same text.
 * Order matters: specific entries come before broader ones.
 */
export const FAQ_ENTRIES: readonly FaqEntry[] = [
  {
    // Dashboard procedure whose UI form details are absent from the public docs:
    // answering it here keeps the model from inventing controls.
    question: 'How do I set up custom guardrails?',
    match: /\bcustom\s+guardrails?\b.*\b(?:how|setup|set up|configure|create|steps?|integrate|integration)\b|\b(?:how|setup|set up|configure|create|integrate|integration)\b.*\bcustom\s+guardrails?\b/,
    answer: 'Open the [nRouter dashboard](https://app.nrouter.ai) and go to your organization’s **Guardrails** page. Custom guardrails call your webhook. Owners and org admins can create and manage guardrails; to assign one to a virtual key, go to **Guardrails → Keys**. Expand a guardrail and open **Test** to try sample input before using it. The public guide does not specify the Custom creation form or webhook request/response details, so I can’t give verified field-by-field setup instructions. See the [Guardrails guide](https://nrouter.ai/docs/guides/guardrails).',
    source: GUARDRAILS,
  },
  {
    question: 'What is nRouter?',
    match: /\bwhat (?:is|does) nrouter(?: do)?\b/,
    answer: 'nRouter is an LLM gateway: one OpenAI-compatible API and one virtual key give you the models in its catalog, with real-time budget enforcement, in-path guardrails and automated failover. See the [introduction](https://nrouter.ai/docs/getting-started/introduction).',
    source: { title: 'Introduction', url: `${DOCS}/getting-started/introduction` },
  },
  {
    question: 'Is nRouter OpenAI-compatible?',
    match: /\b(?:openai[ -]?compatible|compatible with openai|use (?:the )?openai sdk)\b/,
    answer: 'Yes. Keep your OpenAI SDK or HTTP client, set its base URL to `https://api.nrouter.ai/v1`, and use an `sk-nrouter-...` virtual key. The [Quick Start](https://nrouter.ai/docs/getting-started/quick-start) has working examples.',
    source: QUICK_START,
  },
  {
    question: 'How do I rotate an API key safely?',
    match: /\b(?:rotate|rotation)\b.{0,35}\b(?:api\s+)?keys?\b|\bapi\s+key\b.{0,35}\brotate\b/,
    answer: 'Open **API Keys** in the dashboard and choose **Rotate key**. nRouter mints a replacement with the same settings, and both keys stay active for a grace window you choose (1–168 hours). Deploy the new key to your app within that window; the old key then stops working. See [API Key Management](https://nrouter.ai/docs/guides/api-key-management).',
    source: KEY_MANAGEMENT,
  },
  {
    question: 'What happens when an API key expires?',
    match: /\b(?:api\s+)?key\b.{0,35}\bexpire(?:s|d|ation)?\b|\bkey expiration\b/,
    answer: 'An expired key returns **401** until you replace it. Keys can be set to expire Never, after 30 or 90 days, or at a custom time; create or rotate to a replacement before expiry to avoid interruption. See [API Key Management](https://nrouter.ai/docs/guides/api-key-management).',
    source: KEY_MANAGEMENT,
  },
  {
    question: 'Where do I create or find an API key?',
    match: /\b(?:where\b.{0,35}\b(?:create|find|get|manage)\b|\b(?:create|generate|make)\b.{0,35})\b(?:an?\s+)?(?:virtual\s+)?api\s+keys?\b|\bapi keys?\s+(?:live|located)\b/,
    answer: '1. Sign in to the [nRouter dashboard](https://app.nrouter.ai), select your organization, and open **API Keys**.\n\n2. Generate a key. You can optionally scope it to a team and set allowed models, rate limits and a budget cap.\n\n3. Copy the full `sk-nrouter-...` key immediately: it is shown only once and cannot be displayed again. Keep it in a server-side environment variable or secrets manager, for example `NROUTER_API_KEY`, never in browser code or Git.\n\n4. Test it with the [Quick Start](https://nrouter.ai/docs/getting-started/quick-start) cURL example. Requests are billed to your credits.\n\nIf a key is exposed, revoke it in **API Keys** and generate a replacement. See [Authentication](https://nrouter.ai/docs/getting-started/authentication).',
    source: { title: 'Authentication', url: `${DOCS}/getting-started/authentication` },
  },
  {
    question: 'What API base URL should I use?',
    match: /\b(?:base\s+url|api\s+endpoint|endpoint\s+url)\b/,
    answer: 'Use `https://api.nrouter.ai/v1` as the API base URL. For chat completions, the full endpoint is `https://api.nrouter.ai/v1/chat/completions`. See the [Quick Start](https://nrouter.ai/docs/getting-started/quick-start).',
    source: QUICK_START,
  },
  {
    question: 'Which models are available right now?',
    match: /\b(?:which|what)\s+models?\s+(?:are|is)\s+(?:available|live|offered)\b|\b(?:available|live|current)\s+models?\b|\blist\s+of\s+models\b/,
    answer: 'The live catalog is the source of truth for the models available to your organization. Browse it on the **Models** page in the [dashboard](https://app.nrouter.ai); the [Model Catalog guide](https://nrouter.ai/docs/guides/models) explains what each entry shows. Browsing the catalog is free; model requests are billed.',
    source: MODELS,
  },
  {
    question: 'Do I need a separate API key for each model provider?',
    match: /\bseparate\b.{0,35}\b(?:provider|model)\b.{0,20}\bkeys?\b|\bseparate\b.{0,35}\bkeys?\b.{0,20}\bproviders?\b|\bone key\b.{0,30}\bproviders?\b/,
    answer: 'No. One nRouter virtual key and one API endpoint reach every model in the catalog; pass the model ID in the request, and nRouter manages the provider keys for you. If you prefer to use your own OpenAI or Anthropic keys, the $20/mo Bring your own keys plan supports that while other models stay on credits. See [Bring your own keys](https://nrouter.ai/docs/guides/byok).',
    source: { title: 'Bring your own keys', url: `${DOCS}/guides/byok` },
  },
  {
    question: 'How does the platform fee work?',
    match: /\bplatform fee\b|\bservice fee\b/,
    answer: 'nRouter charges a 0% platform fee: the credits you buy are the credits you get, and usage settles at the served model’s exact list price with no markup. See [Billing & Credits](https://nrouter.ai/docs/guides/billing).',
    source: BILLING,
  },
  {
    question: 'What is the difference between a budget and credits?',
    match: /\bbudgets?\b.{0,35}\b(?:credit balance|credits?)\b|\b(?:credits?|credit balance)\b.{0,35}\bbudgets?\b/,
    answer: 'Credits are your prepaid balance; requests settle against it. Budgets are policy limits on how much of that balance an organization, team or key may spend, without locking funds. An exhausted budget returns HTTP **402** `budget_exceeded`; rate limits are separate and return **429**. See [Budget Controls](https://nrouter.ai/docs/guides/budget-controls).',
    source: BUDGETS,
  },
  {
    question: 'What does available credit balance mean?',
    match: /\bavailable credits?\b|\bcredit balance\b|\bhow do credits work\b/,
    answer: 'Available credits are your balance minus amounts reserved for requests that are still in flight. Each request settles at the exact list price and releases any unused hold; credits never go negative. See [Billing & Credits](https://nrouter.ai/docs/guides/billing).',
    source: BILLING,
  },
  {
    question: 'How do I add or top up credits?',
    match: /\b(?:buy|purchase|add|top[ -]?up|load)\b.{0,35}\bcredits?\b|\bcredits?\b.{0,25}\b(?:top[ -]?up|purchase|buy)\b/,
    answer: 'Open **Billing** in the dashboard and buy credits with a preset or custom amount through Stripe Checkout; there is no platform fee. Only Owners can buy credits and manage payment methods; Owners and Org Admins can set up auto top-up. See [Billing & Credits](https://nrouter.ai/docs/guides/billing).',
    source: BILLING,
  },
  {
    question: 'What happens when I run out of credits or plan allowance?',
    match: /\b(?:run out|out of|exhaust(?:ed)?)\b.{0,35}\b(?:credits?|allowance)\b|\binsufficient credits\b|\bplan allowance exhausted\b/,
    answer: 'An empty credit balance returns HTTP **402** (`insufficient_credits`) before any provider call, until you top up. On a legacy subscription plan, an exhausted monthly `nrouter/auto` allowance returns **402** (`plan_allowance_exhausted`), and an exhausted 8-hour, daily or weekly window returns **429** with `Retry-After`. See [Billing & Credits](https://nrouter.ai/docs/guides/billing).',
    source: BILLING,
  },
  {
    question: 'What do the nRouter plans include?',
    match: /\b(?:which|what|compare)\b.{0,25}\bplans?\b|\bplans?\b.{0,25}\b(?:include|cost|pricing)\b/,
    answer: 'New customers choose **Pay as you go** ($0/mo, buy credits, any model, 0% fee, all platform features) or **Bring your own keys** ($20/mo, use your own OpenAI and Anthropic keys while other models use credits). Enterprise agreements add custom SLAs. Existing Starter, Pro and Max subscribers keep their plans. See the [Pricing page](https://nrouter.ai/pricing) and [Billing & Credits](https://nrouter.ai/docs/guides/billing).',
    source: BILLING,
  },
  {
    question: 'Do Playground requests cost credits?',
    match: /\bplayground\b.{0,40}\b(?:cost|credits?|billed|billing|money)\b|\b(?:cost|billed)\b.{0,30}\bplayground\b/,
    answer: 'Yes. Playground requests call the same API as production and settle at the exact list price, and your rate limits, key budgets and guardrails apply. See [Playground](https://nrouter.ai/docs/guides/playground).',
    source: PLAYGROUND,
  },
  {
    question: 'How do I try a model in the dashboard?',
    match: /\b(?:how|where)\b.{0,30}\b(?:test|try|play with)\b.{0,20}\bmodels?\b|\bplayground\b.{0,25}\b(?:use|start|test)\b/,
    answer: 'Open **Playground** in the dashboard, paste an `sk-nrouter-...` virtual key (kept only in your browser session), pick a model and send a prompt. **View Code** exports a matching cURL, Python or Node.js snippet. See the [Playground guide](https://nrouter.ai/docs/guides/playground).',
    source: PLAYGROUND,
  },
  {
    question: 'Why am I getting HTTP 429?',
    match: /\b429\b|\brate[ -]?limited\b|\b(?:hit|hitting|exceed(?:ed|ing)?|getting)\b.{0,20}\brate[ -]?limits?\b/,
    answer: 'HTTP **429** `rate_limit_exceeded` means a request or token rate limit was exceeded. The response includes `Retry-After`; wait that long before retrying, and `x-nr-limit-source` says which limit applied. If it happens regularly, review your key, team and organization limits in [Budget Controls](https://nrouter.ai/docs/guides/budget-controls).',
    source: BUDGETS,
  },
  {
    question: 'Am I charged when a guardrail blocks a request?',
    match: /\bguardrails?\b.{0,45}\b(?:charged|charge|cost|credits?)\b|\b(?:charged|charge|cost|credits?)\b.{0,35}\bguardrails?\b/,
    answer: 'A pre-call block stops the request before it reaches the provider, so it costs $0. A post-call block withholds the response, but the upstream tokens already generated remain billable. Redact, Warn and Log let the request continue and it is billed normally. See [Guardrails](https://nrouter.ai/docs/guides/guardrails).',
    source: GUARDRAILS,
  },
  {
    question: 'Do I need code changes to use guardrails?',
    match: /\bguardrails?\b.{0,45}\b(?:code|application|sdk)\b|\b(?:code|application)\b.{0,35}\bguardrails?\b/,
    answer: 'No application code change is needed. Guardrails run inside the gateway, before the request reaches the model and before the response reaches your client, once they are configured in the dashboard. See the [Guardrails guide](https://nrouter.ai/docs/guides/guardrails).',
    source: GUARDRAILS,
  },
  {
    question: 'Are prompts and completions stored in request logs?',
    match: /\b(?:prompts?|completions?|request content|response content)\b.{0,40}\b(?:stored|logged|logs?)\b|\b(?:stored|logged)\b.{0,35}\b(?:prompts?|completions?)\b/,
    answer: 'No. Prompt and completion text is never written to the request log; it stores metadata such as model, tokens, cost, latency and status. Short-lived response-cache entries expire automatically, and `nrouter_cache: false` bypasses the cache for a request. See [Observability & Logs](https://nrouter.ai/docs/guides/observability).',
    source: OBSERVABILITY,
  },
  {
    question: 'Where can I see request logs?',
    match: /\b(?:where|how)\b.{0,30}\b(?:view|find|see|open)\b.{0,20}\b(?:request\s+)?logs?\b|\brequest logs?\b/,
    answer: 'Open **Logs** in the dashboard to see each request’s model, provider, tokens, exact cost, latency, cache status and time. Search by request ID or export to CSV. See [Observability & Logs](https://nrouter.ai/docs/guides/observability).',
    source: OBSERVABILITY,
  },
  {
    question: 'Do analytics reports use credits?',
    match: /\banalytics\b.{0,45}\b(?:cost|credits?|rate limits?)\b|\b(?:cost|credits?)\b.{0,30}\b(?:viewing|opening)\b.{0,20}\banalytics\b/,
    answer: 'No. Analytics are read-only rollups of your request history: viewing them does not consume credits or count against your rate limits. See [Analytics & Reports](https://nrouter.ai/docs/guides/analytics).',
    source: { title: 'Analytics & Reports', url: `${DOCS}/guides/analytics` },
  },
  {
    question: 'Who can invite teammates?',
    match: /\bwho\b.{0,30}\b(?:invite|add)\b.{0,20}\b(?:teammates?|members?|users?)\b|\b(?:invite|add)\b.{0,25}\b(?:teammates?|members?)\b/,
    answer: 'Invite people under **People → Members**. Owners can invite Viewers, Members or Org Admins; Org Admins can invite Viewers and Members. Invites stay valid for 7 days. See [Team Management](https://nrouter.ai/docs/guides/team-management).',
    source: { title: 'Team Management', url: `${DOCS}/guides/team-management` },
  },
  {
    question: 'What should I do if a dashboard page is blank or stuck?',
    match: /\b(?:dashboard|page)\b.{0,45}\b(?:blank|stuck|loading)\b|\b(?:blank|stuck loading)\b.{0,30}\b(?:dashboard|page)\b/,
    answer: 'Do a hard reload (`Cmd+Shift+R` or `Ctrl+F5`), or sign in again at [nrouter.ai/login](https://nrouter.ai/login). If it still fails, email [support@nrouter.ai](mailto:support@nrouter.ai) with the page URL, the time it happened and a short summary. See [Troubleshooting](https://nrouter.ai/docs/guides/troubleshooting).',
    source: TROUBLESHOOTING,
  },
  {
    question: 'What do I do if I cannot sign in or the magic link does not arrive?',
    match: /\b(?:can't|cannot|unable to)\s+sign\s+in\b|\blogin loop\b|\bmagic link\b.{0,35}\b(?:arrive|receive|missing|email)\b|\bsign[ -]?in email\b/,
    answer: 'Check your spam folder, or choose **Use a password instead** on the login screen. You can also reset your password at [nrouter.ai/login](https://nrouter.ai/login). If you are still blocked, email [support@nrouter.ai](mailto:support@nrouter.ai). See [Troubleshooting](https://nrouter.ai/docs/guides/troubleshooting).',
    source: TROUBLESHOOTING,
  },
  {
    question: 'How does nRouter response caching work?',
    match: /\b(?:response|request) caching\b|\bcache\b.{0,35}\b(?:enabled|work|hit|miss|stored)\b|\b(?:cached|cache hit)\b/,
    answer: 'Response caching is on by default for identical **non-streaming** requests. A hit skips the provider call and is billed at the model’s cache-read input rate, so it is cheaper, not free. Streaming requests are not cached. Send `nrouter_cache: false` to bypass it for one request, or turn it off organization-wide in Router Settings. See [Response Caching](https://nrouter.ai/docs/guides/caching).',
    source: { title: 'Response Caching', url: `${DOCS}/guides/caching` },
  },
  {
    question: 'What is a model alias?',
    match: /\bmodel alias\b|\balias\b.{0,30}\bmodel\b/,
    answer: 'A model alias is a friendly name you can pass in the `model` field in place of the full provider model ID. See the [Model Catalog guide](https://nrouter.ai/docs/guides/models).',
    source: MODELS,
  },
];

/**
 * A direct, documented answer for a common question, or undefined so the turn
 * continues through retrieval. Matches the latest user message only.
 */
export function curatedAnswer(question: string): AgentEvent[] | undefined {
  const normalized = question.toLocaleLowerCase('en-US');
  const entry = FAQ_ENTRIES.find((faq) => faq.match.test(normalized));
  if (!entry) return undefined;

  return [
    { type: 'confidence', level: 'high', score: 1, webSearched: false },
    { type: 'citations', citations: [{ ...entry.source }] },
    { type: 'token', text: entry.answer },
    { type: 'done' },
  ];
}
