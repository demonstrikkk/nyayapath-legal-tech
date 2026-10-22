/**
 * Read-only client for a datagoblin instance.
 *
 * Datagoblin is a separate FastAPI service that holds scraped legal records.
 * JollyLLM reads from it; it never writes to it and never sends case
 * material there. Only the *question* and the *legal* query terms leave the
 * server, so a client narrative does not travel to a third party.
 *
 * Configuration (server/.env):
 *   DATAGOBLIN_BASE_URL=http://127.0.0.1:8000
 *   DATAGOBLIN_API_KEY=...
 *   DATAGOBLIN_LEGAL_DATASET_ID=<id from GET /api/datasets?edition=datagoblin_legal>
 *
 * With none of these set the client reports itself unconfigured and the
 * caller falls back to the bundled corpus. It never fails loudly at import
 * time, because a missing optional service is not a broken app.
 */

const BASE_URL = (process.env.DATAGOBLIN_BASE_URL || "").replace(/\/+$/, "");
const API_KEY = process.env.DATAGOBLIN_API_KEY || "";
const DATASET_ID = process.env.DATAGOBLIN_LEGAL_DATASET_ID || "";

const DEFAULT_TIMEOUT_MS = 20_000;

export function isConfigured() {
  // The dataset id is optional: it can be discovered from the edition name.
  // A base URL and a key are what the client cannot do without.
  return Boolean(BASE_URL && API_KEY);
}

export function describe() {
  return {
    configured: isConfigured(),
    baseUrl: BASE_URL || null,
    datasetId: DATASET_ID || null,
    // The key itself is never returned or logged.
    keyPresent: Boolean(API_KEY),
  };
}

async function call(path, { method = "GET", body = null, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!BASE_URL || !API_KEY) {
    throw new Error("datagoblin is not configured");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        "X-API-Key": API_KEY,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`datagoblin ${method} ${path} failed: HTTP ${res.status} ${detail.slice(0, 200)}`);
    }
    return await res.json();
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error(`datagoblin ${method} ${path} timed out after ${timeoutMs} ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Find the legal dataset by name, so a deployment does not have to pin an
 * id that changes on every re-import.
 */
export async function findLegalDataset(edition = "datagoblin_legal") {
  if (DATASET_ID) return DATASET_ID;
  const res = await call(`/api/datasets?edition=${encodeURIComponent(edition)}`);
  const items = res?.data || [];
  return items[0]?.id || "";
}

/**
 * Search the legal records.
 *
 * `fulltext=true` searches the stored page text, which is where a judgment's
 * reasoning lives; a record's own fields hold only the title, citation and
 * summary.
 *
 * Datagoblin's full-text search is a literal substring match, so a phrase
 * like "rent protection eviction" matches nothing unless those words sit
 * next to each other in the page. When the whole query finds nothing, each
 * significant word is tried on its own and the hits are merged, so a
 * multi-word legal question still returns the records it should.
 *
 * Returns the rows as datagoblin holds them, with the query echoed back so
 * the caller can show what was actually asked.
 */
export async function searchRecords(query, { limit = 20, fulltext = true, datasetId = "" } = {}) {
  const did = datasetId || (await findLegalDataset());
  if (!did) throw new Error("no datagoblin legal dataset is available");

  const text = String(query || "").trim();
  const fetchRecords = async (q, max) => {
    const qs = new URLSearchParams({
      q: q.slice(0, 200),
      limit: String(Math.max(1, Math.min(max, 100))),
      offset: "0",
      fulltext: fulltext ? "true" : "false",
    });
    const res = await call(`/api/datasets/${encodeURIComponent(did)}/records?${qs}`);
    return res?.data || {};
  };

  let payload = await fetchRecords(text, limit);
  let matchedIn = "stored page text";
  let terms = [];

  if (!payload.records?.length && text) {
    // The phrase found nothing. Try each meaningful word on its own and
    // merge what comes back, so the search is useful for a legal question
    // written in ordinary words.
    terms = text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3 && !STOP_WORDS.has(w))
      .slice(0, 5);

    const seen = new Set();
    const merged = [];
    for (const term of terms) {
      const one = await fetchRecords(term, limit);
      for (const row of one.records || []) {
        const key = row.record_id || JSON.stringify(row).slice(0, 120);
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(row);
        if (merged.length >= limit) break;
      }
      if (merged.length >= limit) break;
    }
    payload = { total: merged.length, records: merged };
    matchedIn = terms.length ? "stored page text (matched word by word)" : "none";
  }

  return {
    datasetId: did,
    query: text,
    total: payload.total ?? 0,
    records: payload.records || [],
    matchedIn,
    termsTried: terms,
    source: "datagoblin",
  };
}

/** Words that carry no legal signal in a search. */
const STOP_WORDS = new Set([
  "about", "after", "again", "against", "their", "there", "these", "those",
  "which", "while", "would", "could", "should", "under", "where", "whose",
  "shall", "have", "been", "were", "when", "what", "your", "with", "from",
  "into", "upon", "this", "that", "also", "than", "then", "does", "such",
  "case", "matter", "issue", "under", "applicable", "provisions", "law",
]);

/**
 * Ask datagoblin a question about the legal dataset.
 *
 * This is the endpoint the datagoblin UI itself uses. The model picks read
 * tools and the server executes them; nothing is written. It needs a model
 * to be configured on the datagoblin side, so callers must treat failure as
 * "no answer" rather than as an error to show the user.
 */
export async function askDataset(question, { datasetId = "" } = {}) {
  const did = datasetId || (await findLegalDataset());
  if (!did) throw new Error("no datagoblin legal dataset is available");

  const res = await call(`/api/datasets/${encodeURIComponent(did)}/agent`, {
    method: "POST",
    body: { question: String(question || "").slice(0, 2000) },
    timeoutMs: 45_000,
  });
  const data = res?.data || {};
  return {
    datasetId: did,
    question: String(question || ""),
    answer: data.answer || "",
    figures: data.figures || [],
    trace: data.trace || [],
    source: "datagoblin",
  };
}

/**
 * The legal questions a case raises, expressed as search terms.
 *
 * Only the issue and the statute words travel. The client's narrative,
 * their name and their documents do not.
 */
export function legalSearchTerms(caseObj, issues = []) {
  const terms = [];

  const categoryLabel = caseObj?.category || "";
  if (categoryLabel) {
    terms.push(categoryLabel.replace(/-/g, " "));
  }

  for (const issue of issues) {
    const label = String(issue?.label || issue?.title || "").trim();
    if (label) terms.push(label);
    for (const anchor of issue?.anchorTerms || []) {
      const t = String(anchor || "").trim();
      if (t) terms.push(t);
    }
  }

  const jurisdiction = String(caseObj?.jurisdiction || "").trim();
  if (jurisdiction && jurisdiction !== "India") terms.push(jurisdiction);

  // De-duplicated, and short enough to be a useful search string.
  return [...new Set(terms.map((t) => t.toLowerCase()))].slice(0, 6);
}
