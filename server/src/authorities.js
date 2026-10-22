/**
 * Per-case legal authorities.
 *
 * The `legal_authorities` table existed but nothing wrote to it, so the
 * statutes and decisions a case relied on were never recorded against the
 * case. This module is the only writer, and it records where each authority
 * came from: the bundled corpus, or a live datagoblin dataset.
 *
 * An authority is stored with the quote it rests on. A citation with no
 * quote is not recorded, because an unfilled citation is not evidence.
 */

export const AUTHORITY_TYPES = {
  statute: "statute",
  judgment: "judgment",
  notification: "notification",
};

export const RELEVANCE_TYPES = {
  supporting: "supporting",
  contrary: "contrary",
  procedural: "procedural",
  exception: "exception",
};

/**
 * The record shape the table expects, built from a corpus record.
 *
 * `record` is a provision or judgment from the bundled corpus (or an
 * imported edition record). `score` is the retrieval score, when there is
 * one, and `source` names where it came from.
 */
export function authorityFromCorpus(record, { score = null, source = "bundled-corpus" } = {}) {
  if (!record) return null;

  const isJudgment = Boolean(record.citation && record.court);
  const type = isJudgment ? AUTHORITY_TYPES.judgment : AUTHORITY_TYPES.statute;

  const identifier = String(
    record.id || (record.act ? `${record.act} s. ${record.section}` : record.title || ""),
  ).trim();
  if (!identifier) return null;

  const title = String(
    record.heading || record.title || record.actShortTitle || record.act || identifier,
  ).trim();

  // The quote is the record's own text, not a paraphrase of it.
  const provenance = record.provenance || {};
  const quote = String(
    provenance.quotes?.summary ||
      record.summary ||
      record.holding ||
      record.ratio ||
      record.heading ||
      "",
  ).trim();

  return {
    authorityType: type,
    identifier,
    title,
    citation: String(record.citation || "").trim() || null,
    relevanceType: RELEVANCE_TYPES.supporting,
    ratio: quote ? quote.slice(0, 600) : null,
    sourceUrl: String(record.sourceUrl || record.verifyUrl || provenance.source_url || "").trim() || null,
    // "quote-backed" only when there is a quote to point at.
    verificationStatus: quote ? "quote-backed" : "unverified",
    score: Number.isFinite(score) ? score : null,
    source,
  };
}

/**
 * The record shape for a datagoblin record.
 *
 * A datagoblin row is `{ record_id, fields: { name: { value, source } } }`.
 * Each field carries its own value and a source block holding the quote that
 * backs it. This picks the fields that identify the document and the quote
 * that rests on it.
 */
export function authorityFromDatagoblin(row, { score = null } = {}) {
  if (!row) return null;

  const fields = row.fields || row;

  const field = (name) => {
    const f = fields[name];
    // A field that is not there is an empty string, not the object itself.
    // Falling back to the object would print "[object Object]" as a value.
    if (f === undefined || f === null) return { value: "", quote: "", url: "" };
    const raw = typeof f === "object" ? f.value : f;
    const source = typeof f === "object" && f ? f.source || {} : {};
    return {
      value: raw === null || raw === undefined ? "" : String(raw),
      quote: String(source.quote || "").trim(),
      url: String(source.url || "").trim(),
    };
  };

  const title = field("document_title");
  const citation = field("citation");
  const summary = field("summary");
  const holding = field("holding");
  const court = field("court");

  const identifier = (title.value || citation.value || "").trim();
  if (!identifier) return null;

  const isJudgment = Boolean(court.value) || /v\./i.test(title.value);
  const quote = (summary.quote || holding.quote || summary.value || holding.value || "").trim();

  return {
    authorityType: isJudgment ? AUTHORITY_TYPES.judgment : AUTHORITY_TYPES.statute,
    identifier: identifier.slice(0, 200),
    title: (title.value || identifier).slice(0, 300),
    citation: citation.value ? citation.value.slice(0, 200) : null,
    relevanceType: RELEVANCE_TYPES.supporting,
    ratio: quote ? quote.slice(0, 600) : null,
    sourceUrl: (title.url || citation.url || "").trim() || null,
    verificationStatus: quote ? "quote-backed" : "unverified",
    score: Number.isFinite(score) ? score : null,
    source: "datagoblin",
  };
}
