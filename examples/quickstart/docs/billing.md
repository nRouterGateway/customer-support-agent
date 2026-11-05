---
title: Billing, credits, and platform fees
---

# Billing, credits, and platform fees

Billing is credit-based. The signed-in dashboard's [Billing page](https://app.nrouter.ai) shows your balance, plans, payment methods, auto top-up, and invoices. Current prices can change; use the [nRouter pricing page](https://nrouter.ai/pricing) for current plan details.

## Pay as you go

- Add credits via Stripe Checkout with a **0% platform fee** and **0% per-token model markup** (`$5` minimum for the first manual activation deposit; `$10` minimum custom top-up; recommended **`$25`** auto-recharge default).
- Requests settle at the served model's exact list price (`x-nr-request-cost`, `x-nr-served-model`).
- `nrouter/auto` draws from your subscription allowance first when active, then falls back to prepaid wallet credits at the served model's exact list price (0% platform markup), reporting `x-nr-served-model`, `x-nr-auto-tier`, and `x-nr-selection-source`.
- `Promo` (`promo_model_policy` at `/[organization]/model-catalog/promo`) and `Hack` (`hack_model_policy` at `/[organization]/model-catalog/hack`) are direct promotional and hackathon model policies — call standard model IDs (such as `google/gemini-2.5-flash`) directly and transition to paid credits with zero code changes.
- Owners and admins can view Billing. Only owners can buy credits and manage payment methods; owners and admins can manage auto top-up.
- Manage Payment Methods opens the Stripe Customer Portal. Invoices can be viewed and downloaded from Billing.

## Enterprise

Enterprise pricing and terms are custom. Check the pricing page or contact sales for a quote.

## Current pricing

Fees and plan terms can change. For the latest details, use the [nRouter pricing page](https://nrouter.ai/pricing).
