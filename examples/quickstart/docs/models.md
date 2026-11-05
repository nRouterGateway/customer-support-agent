---
title: Live models
---

# Live models

The live model catalogue is the source of truth for models currently available through nRouter. Open the [nRouter model catalogue](https://app.nrouter.ai/models) to see current model names, availability, capabilities, and pricing.

- **`nrouter/auto` (`auto_model_policy`):** Manage candidate models in `/[organization]/model-catalog/auto`. Draws from subscription allowance first when active, then falls back to prepaid wallet credits at the served model's exact list price (0% platform markup), returning `x-nr-served-model`, `x-nr-auto-tier`, and `x-nr-selection-source`.
- **`Promo` (`promo_model_policy`) & `Hack` (`hack_model_policy`):** Direct promotional and hackathon model policies configured at `/[organization]/model-catalog/promo` and `/[organization]/model-catalog/hack`. Call standard catalog model IDs (e.g., `google/gemini-2.5-flash`) directly and transition to prepaid wallet credits with zero code changes.

Availability can vary by organization, virtual key permissions, quota, and provider status. To check what your key can use, sign in to the dashboard and review the models available to your organization or virtual key.
