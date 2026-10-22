/**
 * LLM integration.
 *
 * Design constraints that are deliberate:
 *  - The API key never leaves the server. It is read from env and is never
 *    returned by describe() or any route.
 *  - The model may only *select and explain* from records the corpus already
 *    holds. It is not asked to produce a section number, a case name, a
 *    citation, a deadline or a form. Those are injected from the corpus by
 *    analysis.js regardless of what the model says.
 *  - Output is validated after the fact: any statutory reference that does not
 *    match a known corpus record is stripped and the whole field is dropped.
 *  - Failure is always safe. Any error returns { ok:false } and the caller
 *    falls back to the deterministic result, so a dead provider degrades the
 *    product but never breaks it.
 */
import "node:process";

/* ---------------------------------------------------------------------------
   Configuration
   --------------------------------------------------------------------------- */

const PROVIDERS = {
  groq: {
    label: "Groq",
    // Groq exposes an OpenAI-compatible chat completions API.
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
  },
  openai: {
    label: "OpenAI",
    baseUrl: "https://api.api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
  },
  generic: {
    label: "OpenAI-compatible endpoint",
    baseUrl: null,
    defaultModel: null,
  },
};

function env(...names) {
  for (const n of names) {
    const v = process.env[n];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return "";
}

/** Resolve provider config once. Never returns the key. */
export function config() {
  const providerKey = (env("LLM_PROVIDER", "JollyLLM_LLM_PROVIDER") || "groq").toLowerCase();
  const provider = PROVIDERS[providerKey] || PROVIDERS.generic;

  const apiKey = env(
    "LLM_API_KEY",
    "GROQ_API_KEY",
    "OPENAI_API_KEY",
    "JollyLLM_LLM_API_KEY",
  );
  const baseUrl = (env("LLM_BASE_URL", "JollyLLM_LLM_BASE_URL") || provider.baseUrl || "").replace(/\/+$/, "");
  const model = env("LLM_MODEL", "JollyLLM_LLM_MODEL") || provider.defaultModel || "";

  // Fallback models, tried in order when the first one cannot be used.
  //
  // Providers meter quota per model, so a model whose daily budget is spent
  // does not stop a different model from answering. A single configured
  // model therefore makes an exhausted quota look like a broken app.
  const fallbackModels = env("LLM_FALLBACK_MODELS", "JollyLLM_LLM_FALLBACK_MODELS")
    .split(",")
    .map((m) => m.trim())
    .filter((m) => m && m !== model);

  const toggle = env("LLM_ENABLED", "JollyLLM_LLM_ENABLED");
  const explicitlyOff = toggle.toLowerCase() === "false" || toggle === "0";

  const missing = [];
  if (!apiKey) missing.push("LLM_API_KEY");
  if (!baseUrl) missing.push("LLM_BASE_URL");
  if (!model) missing.push("LLM_MODEL");

  return {
    providerKey: PROVIDERS[providerKey] ? providerKey : "generic",
    providerLabel: provider.label,
    apiKey,
    baseUrl,
    model,
    fallbackModels,
    explicitlyOff,
    missing,
    // A usable configuration: not disabled, and key + base + model all present.
    ready: !explicitlyOff && missing.length === 0,
  };
}

export function isEnabled() {
  return config().ready;
}

/** Safe to expose over HTTP: contains no secret material. */
export function describe() {
  const c = config();
  const mode = c.ready ? "ai" : "deterministic";
  const outcome = lastOutcome();
  return {
    enabled: c.ready,
    mode,
    provider: c.providerLabel,
    model: c.ready ? c.model : null,
    fallbackModels: c.fallbackModels,
    explicitlyOff: c.explicitlyOff,
    missing: c.missing,
    detail: c.ready
      ? `Live model analysis is enabled via ${c.providerLabel} (${c.model}). Section numbers, citations, deadlines and forms are still injected from the verified corpus, never from the model.`
      : c.explicitlyOff
        ? "Live AI is switched off by configuration. Every field is produced by the bundled corpus and the retrieval engine."
        : `Live AI is not configured (missing ${c.missing.join(", ")}). Every field is produced by the bundled corpus and the retrieval engine. Set the variables in server/.env and restart to enable it.`,
    fallback: "deterministic",
    // What the last real request did. This is what makes a spent quota
    // visible instead of looking like a silent fallback.
    lastOutcome: outcome,
  };
}

/* ---------------------------------------------------------------------------
   Output validation
   --------------------------------------------------------------------------- */

/**
 * The model is not trusted with legal references. Any section-like or
 * citation-like token in free text is checked against the IDs we injected.
 */

/**
 * A number that only means something as a legal reference.
 *
 * The earlier version matched every bare number in the text, which quietly
 * rewrote the client's own facts: "married in 2021" became "married in 1"
 * and "Rs 42,000" became "Rs ?". A number is only a legal reference when a
 * legal word introduces it, so that is the only place the scrubber looks.
 */
const LEGAL_REFERENCE_PATTERN =
  /(\b(?:section|sections|sec|secs|s|ss|article|articles|art|chapter|part|schedule|rule|order|clause|sub-?section|proviso)\s*\.?\s*)(\d{1,4}[A-Za-z]?)\b/gi;

/** Every number that appears in the narrative. The client's facts are not up for correction. */
function numbersIn(text) {
  const out = new Set();
  if (typeof text !== "string") return out;
  for (const m of text.match(/\d{1,6}/g) || []) out.add(m);
  return out;
}

export function scrubLegalReferences(text, allowedIds) {
  if (typeof text !== "string") return "";
  // Neutralise obvious citation shapes before checking anything else.
  let out = text.replace(/\(\s*\d{4}\s*\)\s*\d+\s*SCC/gi, "a cited case");

  // Only a number introduced by a legal word is a legal reference, and only
  // one that is neither in the corpus nor in the client's own account is
  // removed.
  out = out.replace(LEGAL_REFERENCE_PATTERN, (match, cue, number) => {
    const numeric = number.replace(/^s\.\s*/, "").trim();
    if (!numeric) return match;
    if (allowedIds.has(numeric)) return match;
    // The invented reference goes; the words around it stay.
    return cue.replace(/\s*$/, "");
  });

  return out.replace(/\s{2,}/g, " ").trim();
}

function asStringArray(v, max = 12) {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? x.trim() : typeof x?.text === "string" ? x.text.trim() : ""))
    .filter(Boolean)
    .slice(0, max);
}

export function validate(raw, ctx) {
  const allowedIds = new Set(
    [...ctx.provisions.map((p) => p.section), ...ctx.provisions.map((p) => p.id)],
  );
  // A number the client wrote is their fact, not a legal reference the model
  // invented, so it is allowed through.
  for (const n of numbersIn(ctx.narrative)) allowedIds.add(n);
  const s = (v) => scrubLegalReferences(v, allowedIds);

  const out = {
    caseSummary: s(raw.caseSummary || raw.summary || ""),
    keyIssues: asStringArray(raw.keyIssues, 8).map(s),
    missingInformation: asStringArray(raw.missingInformation, 8).map(s),
    provisionExplanations: [],
    judgmentExplanations: [],
    evidenceToGather: asStringArray(raw.evidenceToGather, 10).map(s),
    actionSuggestions: [],
    uncertainty: s(raw.uncertainty || ""),
  };

  // Provision explanations must reference a provision we actually retrieved.
  if (Array.isArray(raw.provisionExplanations)) {
    for (const item of raw.provisionExplanations.slice(0, ctx.provisions.length)) {
      const pid = typeof item === "string" ? item : item?.id;
      const why = typeof item === "string" ? "" : item?.why;
      const match = ctx.provisions.find((p) => p.id === pid || p.section === pid);
      if (!match) continue; // dropped: not a retrieved provision
      out.provisionExplanations.push({
        id: match.id,
        why: s(why || "").slice(0, 600),
      });
    }
  }

  // Same rule for judgments: only ones we retrieved may be discussed.
  if (Array.isArray(raw.judgmentExplanations)) {
    for (const item of raw.judgmentExplanations.slice(0, ctx.judgments.length)) {
      const jid = typeof item === "string" ? item : item?.id;
      const why = typeof item === "string" ? "" : item?.why;
      const match = ctx.judgments.find((j) => j.id === jid);
      if (!match) continue;
      out.judgmentExplanations.push({ id: match.id, why: s(why || "").slice(0, 600) });
    }
  }

  // Action suggestions: text only. Deadline text comes from the corpus, never here.
  if (Array.isArray(raw.actionSuggestions)) {
    for (const item of raw.actionSuggestions.slice(0, 10)) {
      const text = typeof item === "string" ? item : item?.step;
      const why = typeof item === "string" ? "" : item?.why;
      if (!text) continue;
      out.actionSuggestions.push({ step: s(text).slice(0, 400), why: s(why || "").slice(0, 400) });
    }
  }

  out.empty =
    !out.caseSummary &&
    !out.keyIssues.length &&
    !out.actionSuggestions.length &&
    !out.provisionExplanations.length;

  return out;
}

/* ---------------------------------------------------------------------------
   Prompt
   --------------------------------------------------------------------------- */

function buildMessages(ctx) {
  // The prompt is the app's biggest per-minute cost: a provider with an
  // 8,000 token-per-minute budget fits only a handful of full analyses.
  // Each block is therefore capped, and the caps are generous enough to keep
  // the legal substance while cutting the wasted tokens.
  const PROVISION_SUMMARY_CHARS = 420;
  const JUDGMENT_HOLDING_CHARS = 420;
  const MAX_EVIDENCE_ITEMS = 8;

  const provisionBlock = ctx.provisions
    .map(
      (p) =>
        `[${p.id}] ${p.actShortTitle || p.act}\n  ${p.heading}\n  ${String(p.summary || "").slice(0, PROVISION_SUMMARY_CHARS)}\n  Source: ${p.sourceUrl}`,
    )
    .join("\n");

  const judgmentBlock = ctx.judgments
    .map(
      (j) =>
        `[${j.id}] ${j.title}, ${j.citation} (${j.court}, ${j.year})\n  Held: ${String(j.holding || "").slice(0, JUDGMENT_HOLDING_CHARS)}\n  Verify: ${j.verifyUrl}`,
    )
    .join("\n");

  const lang =
    ctx.languageCode === "hi"
      ? "Hindi (Devanagari)"
      : ctx.languageCode === "hinglish"
        ? "Hindi written in Latin script (Hinglish)"
        : "English";

  const system = [
    "You are a legal-information assistant for Indian law. You help a person who has no lawyer.",
    "You will be given: the person's own narrative, and a list of statutory provisions and judicial decisions that a keyword retrieval engine matched to it.",
    "Hard rules:",
    "1. Use ONLY the provisions and decisions supplied. Never invent a section number, a case name, a citation, a court, a deadline, a number of days, a form, or a filing procedure.",
    "2. Never state or imply that a retrieved decision is binding on a court.",
    "3. Never add a fact that is not in the narrative.",
    "4. If the sources do not answer a question, say so plainly and say that a lawyer must verify it.",
    "5. Every claim must be either grounded in the supplied sources or explicitly marked as needing verification.",
    "6. Write for a lay reader. No jargon without a plain explanation.",
    "7. This is legal information, not legal advice. Say so if you state anything that sounds conclusive.",
    "",
    `Respond in ${lang}.`,
    "Return ONLY a JSON object with these keys:",
    "  caseSummary: string - 3 to 5 sentences restating the reported facts.",
    "  keyIssues: string[] - the distinct legal problems present in the facts.",
    "  missingInformation: string[] - what is not yet known and would change the answer.",
    "  provisionExplanations: [{ id: string, why: string }] - only ids from the PROVISIONS list.",
    "  judgmentExplanations: [{ id: string, why: string }] - only ids from the JUDGMENTS list; say if none are relevant.",
    "  evidenceToGather: string[] - documents or records worth preserving.",
    "  actionSuggestions: [{ step: string, why: string }] - practical next steps in order.",
    "  uncertainty: string - what could not be verified and why.",
  ].join("\n");

  const user = [
    "=== NARRATIVE (the person's own words) ===",
    ctx.narrative.slice(0, 6000),
    "",
    "=== PROVISIONS RETRIEVED ===",
    provisionBlock || "(none matched)",
    "",
    "=== JUDGMENTS RETRIEVED ===",
    judgmentBlock || "(none matched)",
    "",
    "=== EVIDENCE CHECKLIST BASE ===",
    ctx.evidence
      .slice(0, MAX_EVIDENCE_ITEMS)
      .map((e) => `- ${e.item}`)
      .join("\n") || "(none)",
    "",
    "Return the JSON object now.",
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/* ---------------------------------------------------------------------------
   Provider call
   --------------------------------------------------------------------------- */

/**
 * Turn a provider error body into a sentence worth showing a human.
 *
 * A provider's 429 usually names the limit it hit - tokens per day, tokens
 * per minute, requests per minute - and how long to wait. That distinction
 * decides everything: a per-minute limit clears in seconds, a daily quota
 * does not, and a wrong key does not clear at all.
 */
function providerMessage(body) {
  const text = String(body || "");
  if (!text) return "";
  try {
    const parsed = JSON.parse(text);
    const message = parsed?.error?.message || parsed?.message || parsed?.detail;
    if (message) return String(message).slice(0, 400);
  } catch {
    // Not JSON: fall through to the raw text.
  }
  return text.slice(0, 300);
}

/**
 * Which limit did the provider hit, and when does it clear?
 *
 * Returns { scope, retryAfterSeconds, message } or null when the body does
 * not say.
 */
function quotaScope(body) {
  const message = providerMessage(body);
  if (!message) return null;
  const lower = message.toLowerCase();

  let scope = "unknown";
  if (lower.includes("tokens per day") || lower.includes("tpd")) scope = "daily_tokens";
  else if (lower.includes("tokens per minute") || lower.includes("tpm")) scope = "per_minute_tokens";
  else if (lower.includes("requests per day")) scope = "daily_requests";
  else if (lower.includes("requests per minute") || lower.includes("rpm")) scope = "per_minute_requests";

  // "Please try again in 1m32.88s" or "in 93s"
  const wait = message.match(/try again in\s+([0-9.]+)\s*(m|s|ms|h)?/i);
  let retryAfterSeconds = null;
  if (wait) {
    const value = Number(wait[1]);
    const unit = (wait[2] || "s").toLowerCase();
    if (Number.isFinite(value)) {
      if (unit === "m") retryAfterSeconds = value * 60;
      else if (unit === "h") retryAfterSeconds = value * 3600;
      else if (unit === "ms") retryAfterSeconds = value / 1000;
      else retryAfterSeconds = value;
    }
  }

  return { scope, retryAfterSeconds, message };
}

function classifyHttp(status, body, headers = null) {
  if (status === 401 || status === 403) {
    return {
      ok: false,
      error: "invalid_credentials",
      message: `The provider rejected the API key (HTTP ${status}). Check LLM_API_KEY.`,
    };
  }
  if (status === 429) {
    const quota = quotaScope(body);
    const headerRetry = headers?.get?.("retry-after");
    const headerSeconds = headerRetry ? Number(headerRetry) : null;
    const retryAfterSeconds =
      Number.isFinite(headerSeconds) && headerSeconds > 0
        ? headerSeconds
        : quota?.retryAfterSeconds ?? null;

    // The provider's own words, because "rate limited" on its own does not
    // say whether to wait a minute or until tomorrow.
    const detail = quota?.message || providerMessage(body);
    const scope = quota?.scope || "unknown";

    const scopeText = {
      daily_tokens: "The provider's daily token allowance for this model is spent.",
      per_minute_tokens: "The provider's per-minute token limit is reached.",
      daily_requests: "The provider's daily request allowance is spent.",
      per_minute_requests: "The provider's per-minute request limit is reached.",
      unknown: "The provider is rate limiting requests.",
    }[scope];

    return {
      ok: false,
      error: "rate_limited",
      message: scopeText,
      scope,
      retryAfterSeconds,
      providerMessage: detail,
      // A daily quota is not a transient blip: retrying in a second will not
      // help, and the caller needs to know that.
      quotaExhausted: scope === "daily_tokens" || scope === "daily_requests",
    };
  }
  if (status === 404) {
    return {
      ok: false,
      error: "model_not_found",
      message: `The provider has no endpoint or model at that address (HTTP 404). Check LLM_BASE_URL and LLM_MODEL.`,
    };
  }
  if (status >= 500) {
    return { ok: false, error: "provider_outage", message: `The provider returned HTTP ${status}.` };
  }
  return {
    ok: false,
    error: "provider_error",
    message: `The provider returned HTTP ${status}.`,
    // Body is truncated and may contain the key echo, so scrub before it is logged.
    detail: String(body || "").slice(0, 200).replace(/[A-Za-z0-9_-]{20,}/g, "[redacted]"),
  };
}

function extractJson(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  let t = text.trim();
  // Strip markdown fences if the model added them.
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) t = fence[1].trim();
  try {
    return JSON.parse(t);
  } catch {
    // Fall back to the first balanced object in the text.
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(t.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function callProvider(c, messages, { timeoutMs, jsonMode, model = null, temperature = 0.2, maxTokens = 2000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const targetModel = model || c.model;
    const body = {
      model: targetModel,
      messages,
      temperature,
      max_tokens: maxTokens,
    };
    if (jsonMode) body.response_format = { type: "json_object" };

    const res = await fetch(`${c.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${c.apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return classifyHttp(res.status, text);
    }

    const data = await res.json().catch(() => null);
    if (!data) {
      return { ok: false, error: "malformed_response", message: "The provider returned a non-JSON body." };
    }
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      return {
        ok: false,
        error: "empty_response",
        message: "The provider returned an empty completion.",
      };
    }
    let parsed = null;
    if (jsonMode) {
      parsed = extractJson(content);
    }
    return { ok: true, content, data: parsed, usage: data?.usage || null, model: data?.model || targetModel };
  } catch (err) {
    if (err?.name === "AbortError") {
      return {
        ok: false,
        error: "timeout",
        message: `The provider did not respond within ${Math.round(timeoutMs / 1000)}s.`,
      };
    }

    // An abort that lands while the body is being read surfaces as a
    // TypeError with an AbortError cause, not as an AbortError itself.
    const causeName = err?.cause?.name;
    if (causeName === "AbortError") {
      return {
        ok: false,
        error: "timeout",
        message: `The provider did not respond within ${Math.round(timeoutMs / 1000)}s.`,
      };
    }

    // A programming error is not a network problem. Calling it one hides the
    // actual defect: a mistyped function name once made every working
    // completion look like an unreachable provider.
    if (err instanceof ReferenceError || err instanceof TypeError) {
      return {
        ok: false,
        error: "internal_error",
        message: "The model call failed because of a defect in this service, not the provider.",
        detail: String(err?.message || err).slice(0, 160).replace(/[A-Za-z0-9_-]{20,}/g, "[redacted]"),
      };
    }

    return {
      ok: false,
      error: "network_error",
      message: "The provider could not be reached.",
      detail: String(err?.message || err).slice(0, 160).replace(/[A-Za-z0-9_-]{20,}/g, "[redacted]"),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The model this service is configured to use.
 *
 * Callers that used to hardcode a model id ended up on a different, slower
 * model than the one the operator configured. They ask for this instead.
 */
export function configuredModel() {
  return config().model;
}

/**
 * General-purpose chat completion with safe fallbacks and bounded timeouts.
 */
export async function chatCompletion({
  model = null,
  messages = [],
  temperature = 0.2,
  maxTokens = 2000,
  jsonMode = true,
  timeoutMs = 15000,
} = {}) {
  const c = config();
  if (!c.ready) {
    return { ok: false, error: "not_configured", message: "LLM is not enabled or configured" };
  }
  return callProvider(c, messages, { timeoutMs, jsonMode, model, temperature, maxTokens });
}

/**
 * Chat completion that moves on to the next configured model when one is
 * rate limited.
 *
 * The single-model version above fails the whole call when the provider says
 * no. That is how a spent quota turned into a silent fallback in three
 * different features at once.
 */
export async function chatCompletionWithFallback({
  model = null,
  messages = [],
  temperature = 0.2,
  maxTokens = 2000,
  jsonMode = true,
  timeoutMs = 15000,
} = {}) {
  const c = config();
  if (!c.ready) {
    return { ok: false, error: "not_configured", message: "LLM is not enabled or configured" };
  }

  const chain = model ? [model] : [c.model, ...c.fallbackModels];
  const tried = [];
  let last = null;

  for (const target of chain) {
    tried.push(target);
    const res = await callProvider(c, messages, { timeoutMs, jsonMode, model: target, temperature, maxTokens });
    if (res.ok) return { ...res, modelsTried: tried };
    last = res;
    // Only a quota problem is worth another model. Anything else - a bad
    // key, a malformed request - would fail the same way on every model.
    if (res.error !== "rate_limited" && res.error !== "model_not_found") break;
  }

  recordFailure(last, c, Date.now());
  return { ...last, modelsTried: tried };
}


/**
 * Hard caps on the model call.
 *
 * Without these the LLM runs inline in the request path, so a slow provider or
 * a generous LLM_TIMEOUT_MS turns POST /api/analyze into a request that hangs
 * for minutes with no response at all. The model is an enhancement; it is never
 * allowed to decide whether the API answers.
 *
 * The total must stay under the analysis deadline (ANALYZE_DEADLINE_MS,
 * 45s), or the request would be cut off by the server while the model call
 * was still running. A reasoning model asked for 2,000 tokens regularly
 * needs 15-25 seconds, so a 10 second per-attempt cap was failing calls that
 * were about to succeed.
 */
export const AI_BUDGET = {
  perAttemptMs: 25_000,
  maxAttempts: 2,
  totalMs: 40_000,
};

/**
 * Unconditional outer guard.
 *
 * An AbortController only helps if the underlying socket honours the signal.
 * If fetch never settles for any reason, a bare await would hang the whole
 * request. Racing against a timer guarantees the deterministic result is
 * returned on time no matter what the provider or the socket does.
 */
function withinBudget(promise, ms) {
  let timer;
  const guard = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ __budgetExceeded: true }), ms);
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

function clampBudget() {
  const perAttempt = Math.min(
    Number(process.env.LLM_TIMEOUT_MS || AI_BUDGET.perAttemptMs),
    AI_BUDGET.perAttemptMs,
  );
  const attempts = Math.min(
    Math.max(1, Number(process.env.LLM_MAX_ATTEMPTS || AI_BUDGET.maxAttempts)),
    AI_BUDGET.maxAttempts,
  );
  return { perAttempt, attempts };
}

/**
 * Public entry point. Always resolves; never throws.
 *
 * Returns { ok, mode: "ai" | "deterministic", reason?, ... }
 */
export async function analyseCase(ctx, opts = {}) {
  try {
    const result = await withinBudget(runAnalysis(ctx), AI_BUDGET.totalMs);
    if (result && result.__budgetExceeded) {
      return {
        ok: false,
        mode: "deterministic",
        reason: "budget_exhausted",
        message: "Model analysis did not finish inside the time budget. Returning the deterministic result.",
        durationMs: AI_BUDGET.totalMs,
      };
    }
    return result;
  } catch (err) {
    // The model is an enhancement. It must never be able to fail a request.
    return {
      ok: false,
      mode: "deterministic",
      reason: "internal_error",
      message: "Model analysis failed unexpectedly. Returning the deterministic result.",
      durationMs: 0,
    };
  }
}

async function runAnalysis(ctx) {
  const c = config();

  if (!c.ready) {
    return {
      ok: false,
      mode: "deterministic",
      reason: c.explicitlyOff ? "disabled" : `not_configured:${c.missing.join(",")}`,
    };
  }

  const { perAttempt, attempts } = clampBudget();
  const startedAt = Date.now();
  const jsonMode = (process.env.LLM_JSON_MODE || "true").toLowerCase() !== "false";
  const messages = buildMessages(ctx);

  // The models to try, in order. Providers meter quota per model, so a model
  // whose budget is spent does not stop the next one from answering.
  const modelChain = [c.model, ...c.fallbackModels];

  let lastError = null;
  const triedModels = [];

  for (const targetModel of modelChain) {
    triedModels.push(targetModel);

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      // Never start an attempt we cannot finish inside the total budget.
      if (Date.now() - startedAt >= AI_BUDGET.totalMs - perAttempt / 2) {
        lastError = { error: "budget_exhausted", message: "The time budget for model analysis ran out." };
        break;
      }

      const res = await callProvider(c, messages, {
        timeoutMs: perAttempt,
        jsonMode,
        model: targetModel,
      });

      if (res.ok) {
        const parsed = extractJson(res.content);
        if (!parsed) {
          lastError = {
            error: "malformed_json",
            message: "The model replied with text that is not valid JSON.",
          };
        } else {
          const validated = validate(parsed, ctx);
          if (validated.empty) {
            lastError = {
              error: "empty_analysis",
              message: "The model's reply contained no usable content.",
            };
          } else {
            return {
              ok: true,
              mode: "ai",
              provider: c.providerLabel,
              model: res.model || targetModel,
              ...validated,
              notices: [
                "Machine-generated. Grounded in the sources listed, but a lawyer has not reviewed it.",
                "Section numbers, citations, deadlines and forms come from the verified corpus, not from the model.",
              ],
              usage: res.usage,
              attempts: attempt,
              modelsTried: triedModels,
              durationMs: Date.now() - startedAt,
            };
          }
        }
      } else {
        lastError = res;

        // A quota that will not clear is not a blip. Retrying the same model
        // in a second wastes the request; move to the next model instead.
        if (res.quotaExhausted) break;

        // Only transient conditions are worth a second attempt, and only if
        // the provider says the limit clears inside the remaining budget.
        const transient = ["rate_limited", "provider_outage", "network_error", "timeout"].includes(res.error);
        if (!transient) break;

        if (res.error === "rate_limited") {
          const waitMs = Math.ceil((res.retryAfterSeconds || 0) * 1000);
          const remaining = AI_BUDGET.totalMs - (Date.now() - startedAt);
          // Wait exactly as long as the provider asked, but only when that
          // wait still leaves room for the call itself.
          if (!waitMs || waitMs + 1500 > remaining) break;
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }

        if (attempt < attempts) {
          await new Promise((r) => setTimeout(r, 400 * attempt));
        }
      }
    }

    // The model is exhausted. If another one is configured, try it.
    if (lastError?.error === "rate_limited" || lastError?.error === "model_not_found") {
      continue;
    }
    break;
  }

  recordFailure(lastError, c, startedAt);

  return {
    ok: false,
    mode: "deterministic",
    reason: lastError?.error || "unknown",
    message: lastError?.message || "The model could not be used for this request.",
    provider: c.providerLabel,
    model: c.model,
    modelsTried: triedModels,
    // The provider's own words, so "rate limited" is not the end of the
    // explanation: a daily quota and a per-minute limit need different
    // responses from whoever is reading the log.
    providerMessage: lastError?.providerMessage || null,
    scope: lastError?.scope || null,
    retryAfterSeconds: lastError?.retryAfterSeconds ?? null,
    quotaExhausted: Boolean(lastError?.quotaExhausted),
    // The underlying transport error, when there was one. Without it a
    // "network error" and a "socket closed mid-response" look identical.
    detail: lastError?.detail || null,
    durationMs: Date.now() - startedAt,
  };
}

/**
 * The last provider failure, kept in memory.
 *
 * A provider that is reachable and serves the configured model can still be
 * unusable - a spent daily quota says nothing about the key or the endpoint,
 * and the model list still shows the model as served. So the health check
 * has to remember what actually happened on the last real request, or it
 * reports "ai" while every call is falling back.
 */
let lastFailure = null;

function recordFailure(err, c, startedAt) {
  if (!err) {
    lastFailure = null;
    return;
  }
  lastFailure = {
    at: new Date().toISOString(),
    reason: err.error || "unknown",
    message: err.message || "",
    providerMessage: err.providerMessage || null,
    scope: err.scope || null,
    quotaExhausted: Boolean(err.quotaExhausted),
    retryAfterSeconds: err.retryAfterSeconds ?? null,
    model: c?.model || null,
    durationMs: Date.now() - startedAt,
  };
}

/** What the last real request did, and whether the provider looks usable now. */
export function lastOutcome() {
  if (!lastFailure) return { failed: false, usable: true, failure: null };

  // A per-minute limit clears on its own, so the provider is usable again
  // shortly. A daily quota does not clear until the provider says so.
  const retryMs = lastFailure.retryAfterSeconds ? lastFailure.retryAfterSeconds * 1000 : 0;
  const clearsAt = lastFailure.at ? Date.parse(lastFailure.at) + retryMs : 0;
  const expired = !retryMs || Date.now() > clearsAt;

  return {
    failed: true,
    usable: expired,
    failure: lastFailure,
    clearsAt: clearsAt ? new Date(clearsAt).toISOString() : null,
  };
}

/**
 * Cheap connectivity probe used by /api/health. Never returns the key.
 *
 * Checks two things separately, because they fail independently:
 *   reachable  - the provider answered at all
 *   model      - the configured model id is actually served
 *
 * A reachable provider is not a usable provider. Reporting only reachability
 * previously made /api/health claim "ai" while every completion 404'd.
 */
export async function probe() {
  const c = config();
  if (!c.ready) {
    return {
      reachable: false,
      modelAvailable: false,
      reason: c.explicitlyOff ? "disabled" : "not_configured",
      missing: c.missing,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${c.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${c.apiKey}` },
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        reachable: false,
        modelAvailable: false,
        ...classifyHttp(res.status, body),
      };
    }

    const data = await res.json().catch(() => null);
    const ids = Array.isArray(data?.data)
      ? data.data.map((m) => m?.id).filter(Boolean)
      : [];

    // If the endpoint returns no list, do not claim the model is missing.
    if (ids.length === 0) {
      return {
        reachable: true,
        modelAvailable: null,
        note: "Provider reachable but did not list models; model id unverified.",
        provider: c.providerLabel,
        model: c.model,
      };
    }

    const modelAvailable = ids.includes(c.model);
    // A fallback model that the provider does serve is worth reporting: the
    // app will use it when the primary one is unusable.
    const fallbackAvailable = c.fallbackModels.filter((m) => ids.includes(m));

    return {
      reachable: true,
      modelAvailable,
      provider: c.providerLabel,
      model: c.model,
      fallbackModels: c.fallbackModels,
      fallbackAvailable,
      ...(modelAvailable
        ? {}
        : {
            error: "model_not_found",
            message: `The provider is reachable but does not serve "${c.model}". Completions against it will return HTTP 404 and the app will fall back to deterministic output.`,
            // A few suggestions, not the full list.
            similar: ids.filter((id) => id.includes(c.model.split("-").slice(0, 2).join("-"))).slice(0, 5),
          }),
    };
  } catch (err) {
    return {
      reachable: false,
      modelAvailable: false,
      error: err?.name === "AbortError" ? "timeout" : "network_error",
      message: "The provider could not be reached.",
    };
  } finally {
    clearTimeout(timer);
  }
}
