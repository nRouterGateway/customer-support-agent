import type { SafeError, SupportAgentErrorCode } from './types.js';
import {
  nRouterAuthenticationError,
  nRouterCreditError,
  nRouterBudgetExceededError,
  nRouterRateLimitError,
  nRouterGuardrailBlockedError,
  nRouterError,
  classifyErrorClass,
  isAbortError
} from '@nrouter_ai/sdk';

export class SupportAgentError extends Error {
  readonly code: SupportAgentErrorCode;
  constructor(code: SupportAgentErrorCode, message: string) {
    super(message);
    this.name = 'SupportAgentError';
    this.code = code;
  }
  toSafe(): SafeError {
    return { code: this.code, message: this.message };
  }
}

/** Replace nRouter keys (sk-nrouter-…) and any listed secret strings with a placeholder. */
export function redact(text: string, secrets?: string[]): string {
  let result = text.replace(/sk-nrouter-[A-Za-z0-9_-]+/g, '[redacted]');
  if (secrets) {
    for (const secret of secrets) {
      if (secret.length >= 8) {
        // use split/join to replace all occurrences without escaping regex specials
        result = result.split(secret).join('[redacted]');
      }
    }
  }
  return result;
}

/** Map an SDK error class (by identity or by name) to a SupportAgentErrorCode. */
export function mapErrorClass(Cls: unknown): SupportAgentErrorCode {
  const name = typeof Cls === 'function' ? Cls.name : (Cls as { name?: string })?.name;
  if (Cls === nRouterGuardrailBlockedError || name === 'nRouterGuardrailBlockedError') {
    return 'guardrail_blocked';
  }
  if (Cls === nRouterAuthenticationError || name === 'nRouterAuthenticationError') {
    return 'auth_failed';
  }
  if (
    Cls === nRouterCreditError ||
    Cls === nRouterBudgetExceededError ||
    name === 'nRouterCreditError' ||
    name === 'nRouterBudgetExceededError'
  ) {
    return 'insufficient_credit';
  }
  if (Cls === nRouterRateLimitError || name === 'nRouterRateLimitError') {
    return 'rate_limited';
  }
  return 'upstream_error';
}

/**
 * Whether a RAW gateway error allows trying the next configured model. Decided
 * before `toSafeError`, which drops the HTTP status.
 *
 * Only an availability refusal qualifies: a 404 that names `model_not_found`
 * (or, when the gateway sent no code, one the SDK classified as a missing
 * model), or a 503 that is `service_unavailable` or carries no code. Auth,
 * credit, budget, rate-limit and guardrail refusals and aborts never do: a
 * fallback must not change who pays or how. Reads plain properties rather than
 * classes so it holds across a duplicated SDK copy.
 */
export function isModelFallbackEligible(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  if (isAbortError(err)) return false;
  const { status, code, kind } = err as { status?: unknown; code?: unknown; kind?: unknown };
  if (kind === 'guardrail_blocked') return false;
  const noCode = code === null || code === undefined;
  if (status === 404) {
    return code === 'model_not_found' || (noCode && kind === 'not_found');
  }
  if (status === 503) {
    return noCode || code === 'service_unavailable';
  }
  if (status === 429) {
    return code === 'insufficient_quota' || (noCode && kind === 'insufficient_quota');
  }
  return false;
}

/**
 * Gateway error codes (the `errors` table of the nRouter SDK spec) mapped to a
 * SupportAgentErrorCode by name, ahead of the class checks. Reading the plain
 * `code` keeps the answer the same whichever SDK copy built the error: an SDK
 * that predates a code builds the base `nRouterError` for it, which the class
 * checks alone would call an upstream failure.
 *
 * - The 402 funding refusals, including `nrouter/promo` and `nrouter/hack`
 *   credit, are `insufficient_credit`.
 * - Every 429 window, including a used-up `nrouter/promo` / `nrouter/hack`
 *   spend window, is `rate_limited`.
 * - The 403 model deny lists are `model_denied`: a policy refusal, not an
 *   upstream failure, and retrying the same model is refused the same way.
 *
 * A code outside this table falls through to the class checks.
 */
export const SUPPORT_CODE_BY_GATEWAY_CODE: Readonly<Record<string, SupportAgentErrorCode>> = Object.freeze({
  invalid_api_key: 'auth_failed',
  guardrail_blocked: 'guardrail_blocked',
  insufficient_credits: 'insufficient_credit',
  plan_allowance_exhausted: 'insufficient_credit',
  plan_required: 'insufficient_credit',
  insufficient_promo_credit: 'insufficient_credit',
  insufficient_hack_credit: 'insufficient_credit',
  rate_limit_exceeded: 'rate_limited',
  tpm_limit_exceeded: 'rate_limited',
  pot_spend_limit_exceeded: 'rate_limited',
  model_denied_by_org: 'model_denied',
  model_denied_by_team: 'model_denied',
  model_denied_by_key: 'model_denied',
});

function mappedGatewayCode(err: unknown): SupportAgentErrorCode | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const code = (err as { code?: unknown }).code;
  if (typeof code !== 'string' || !Object.prototype.hasOwnProperty.call(SUPPORT_CODE_BY_GATEWAY_CODE, code)) {
    return undefined;
  }
  return SUPPORT_CODE_BY_GATEWAY_CODE[code];
}

/**
 * The request id and Retry-After wait a gateway error carries, when present
 * and well-formed. Read as plain properties so they survive a duplicated SDK copy.
 */
function gatewayDetail(err: unknown, secrets?: string[]): Pick<SafeError, 'requestId' | 'retryAfter'> {
  if (typeof err !== 'object' || err === null) return {};
  const { requestId, retryAfter } = err as { requestId?: unknown; retryAfter?: unknown };
  const out: Pick<SafeError, 'requestId' | 'retryAfter'> = {};
  if (typeof requestId === 'string' && requestId.trim() !== '') out.requestId = redact(requestId, secrets);
  if (typeof retryAfter === 'number' && Number.isFinite(retryAfter) && retryAfter > 0) out.retryAfter = retryAfter;
  return out;
}

/** Map any thrown value (SDK error classes, AbortError, unknown) to a redacted SafeError. */
export function toSafeError(err: unknown, secrets?: string[]): SafeError {
  if (err instanceof SupportAgentError) {
    return {
      code: err.code,
      message: redact(err.message, secrets)
    };
  }
  const safe = classifyThrown(err, secrets);
  // Only a gateway refusal has a request id or a wait worth showing.
  if (safe.code === 'aborted' || safe.code === 'internal_error') return safe;
  return { ...safe, ...gatewayDetail(err, secrets) };
}

function classifyThrown(err: unknown, secrets?: string[]): SafeError {
  if (!isAbortError(err)) {
    const mapped = mappedGatewayCode(err);
    if (mapped !== undefined) {
      const message = (err as { message?: unknown }).message;
      return { code: mapped, message: redact(typeof message === 'string' ? message : '', secrets) };
    }
  }

  const errName = (err as { name?: string; constructor?: { name?: string } })?.constructor?.name ?? (err as { name?: string })?.name;

  if (err instanceof nRouterAuthenticationError || errName === 'nRouterAuthenticationError') {
    return { code: 'auth_failed', message: redact(err instanceof Error ? err.message : String(err), secrets) };
  }
  if (
    err instanceof nRouterCreditError ||
    err instanceof nRouterBudgetExceededError ||
    errName === 'nRouterCreditError' ||
    errName === 'nRouterBudgetExceededError'
  ) {
    return { code: 'insufficient_credit', message: redact(err instanceof Error ? err.message : String(err), secrets) };
  }
  if (err instanceof nRouterRateLimitError || errName === 'nRouterRateLimitError') {
    return { code: 'rate_limited', message: redact(err instanceof Error ? err.message : String(err), secrets) };
  }
  if (err instanceof nRouterGuardrailBlockedError || errName === 'nRouterGuardrailBlockedError') {
    return { code: 'guardrail_blocked', message: redact(err instanceof Error ? err.message : String(err), secrets) };
  }
  if (err instanceof nRouterError || errName === 'nRouterError') {
    return { code: 'upstream_error', message: redact(err instanceof Error ? err.message : String(err), secrets) };
  }

  if (isAbortError(err)) {
    return { code: 'aborted', message: err instanceof Error ? redact(err.message, secrets) : 'Aborted' };
  }

  if (typeof err === 'object' && err !== null && 'status' in err && typeof (err as Record<string, unknown>).status === 'number') {
    const status = (err as Record<string, unknown>).status as number;
    const message = typeof (err as Record<string, unknown>).message === 'string' ? (err as Record<string, unknown>).message as string : '';
    const code = typeof (err as Record<string, unknown>).code === 'string' ? (err as Record<string, unknown>).code as string : null;
    const Cls = classifyErrorClass(code, message, status);
    const mappedCode = mapErrorClass(Cls);
    return { code: mappedCode, message: redact(message, secrets) };
  }

  return { code: 'internal_error', message: 'An internal error occurred.' };
}
