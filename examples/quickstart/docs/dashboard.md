---
title: Dashboard and account help
audiences: [public]
---

# nRouter dashboard and account help

The nRouter dashboard is available at `https://app.nrouter.ai` (or `http://localhost:5001` during local development). It provides self-serve tools for virtual API keys, usage, billing, request tracing, MCP servers, and model discovery.

## Organization and workspace navigation

Resources belong to an organization workspace. Common areas include:

- [Virtual keys](https://app.nrouter.ai/[org]/keys): key lifecycle, model restrictions, rate limits, and spend ceilings.
- [Usage and logs](https://app.nrouter.ai/[org]/logs): request logs, usage, latency, request IDs, and spend.
- [Debug and traces](https://app.nrouter.ai/[org]/debug): request trace and answer inspection.
- [MCP Hub](https://app.nrouter.ai/[org]/mcp-hub): MCP server registry.
- [Tools Hub](https://app.nrouter.ai/[org]/tools-hub): exposed tools and schemas.
- [Models](https://app.nrouter.ai/[org]/models): available models and benchmarks.
- [Playground](https://app.nrouter.ai/[org]/playground): interactive prompt testing.
- [Billing](https://app.nrouter.ai/[org]/billing): allowances, credits, and subscription details.

## API keys

Create and manage virtual API keys from the dashboard. Give each key only the access and spend limit it needs. Keys may have model restrictions, rate limits (per-key and per-org requests per minute (RPM), tokens per minute (TPM), plus per-key requests per second (RPS) and requests per day (RPD) set by the plan), CIDR/IP allowlists, and fallback settings. The full secret is shown once when a key is created, so store it securely. If a key is lost or exposed, revoke it immediately and create a replacement. Never paste a full key into chat, email, logs, or support tickets.

To create one: sign in at [app.nrouter.ai](https://app.nrouter.ai), open your organization, go to [Virtual keys](https://app.nrouter.ai/[org]/keys), select **Create key**, choose the required models and limits, and copy the secret when it is shown. Use it as `Authorization: Bearer sk-nrouter-...` from your server. If **Create key** is not visible, ask a workspace owner or contact nRouter support.

## Usage, billing, and limits

Use usage and request logs to review activity, spend, model usage, request IDs, status codes, and latency. Logs can show input, output, cache, and reasoning token details. A request may show an `unpriced` status when pricing metadata was unavailable; this does not mean the request was free.

The dashboard is also the place to review model availability, budgets, spend ceilings, quota, and rate-limit behavior. A key with a spend ceiling or model restriction cannot exceed those settings. Keep the request ID when contacting support about a failed request.

## Request debugging

The debug area can show the request pipeline, timing, validation, rate-limit checks, safety checks, credit reservation, upstream execution, streaming, and settlement. The answer inspector may show prompt transformations and response metadata such as request ID and cost headers. Do not share secrets from debug output.

## Team access

Workspace owners can invite teammates from the dashboard and assign the appropriate organization role. Give each person the least access needed for their work.

## Getting help

Signed-in users should use the in-app support drawer for account-specific questions about keys, credits, budgets, failed requests, or request IDs. The support agent can explain public documentation, but it must not guess private account values. Contact a human when the agent cannot resolve the issue.
