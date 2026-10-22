/**
 * Access layer for the curated legal corpus.
 *
 * Records are read from JSON in data/knowledge. The six hand-curated files are
 * authoritative and never rewritten; an optional, separately synced snapshot
 * (legal_edition.json) is merged over them additively. Anything the UI shows as
 * law therefore still comes from a file in this directory, and each imported
 * record says where it came from.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "..", "data", "knowledge");

const cache = new Map();

function load(name) {
  if (!cache.has(name)) {
    const raw = readFileSync(path.join(DATA_DIR, name), "utf8");
    cache.set(name, JSON.parse(raw));
  }
  return cache.get(name);
}

export const provisions_doc = () => load("provisions.json");
export const judgments_doc = () => load("judgments.json");
export const playbook_doc = () => load("caseplaybook.json");
export const actionplans_doc = () => load("actionplans.json");
export const samples_doc = () => load("samplecases.json");
export const forms_doc = () => load("forms.json");

export const forms = () => forms_doc().forms || [];
export const forms_for_category = (id) => forms().filter((f) => f.category === id);
export const form_by_id = (id) => forms().find((f) => f.id === id) || null;

/**
 * Optional datagoblin snapshot, merged additively over the curated corpus.
 *
 * The six hand-curated files stay untouched. A record that already exists wins;
 * the snapshot only fills blanks and adds new records, and its provenance is
 * attached so a reader can reach the source. When the file is absent the
 * exports below return exactly what they did before.
 */
let editionCache;

function edition() {
  if (editionCache !== undefined) return editionCache;
  try {
    editionCache = load("legal_edition.json");
  } catch {
    editionCache = null;
  }
  return editionCache;
}

function fold(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function firstParty(record) {
  const title = fold(record.title);
  if (!title) return "";
  const [first] = title.split(/\s+v\s+/);
  if (!first || first.split(" ").length < 2) return "";
  if (["state", "union of india", "state of india"].includes(first)) return "";
  return first;
}

const provisionKeys = (record) => [`${fold(record.act)}:${fold(record.section)}`];

function judgmentKeys(record) {
  const keys = [
    `id:${fold(record.id)}`,
    `title:${fold(record.title)}`,
    `cite:${fold(record.citation)}`,
  ];
  const party = firstParty(record);
  if (party) keys.push(`party:${party}`);
  return keys;
}

const usableKeys = (record, keysOf) =>
  keysOf(record).filter((key) => key && !key.endsWith(":") && key !== "::");

function mergeRecords(base, extra, keysOf) {
  // `origin` is for the reader, not the matcher: a record that existed in the
  // curated corpus stays curated even when the snapshot fills a blank field.
  if (!Array.isArray(extra) || extra.length === 0) {
    return base.map((record) => ({ ...record, origin: "curated" }));
  }
  const out = base.map((record) => ({ ...record, origin: "curated" }));
  const index = new Map();
  out.forEach((record, at) => {
    for (const key of usableKeys(record, keysOf)) {
      if (!index.has(key)) index.set(key, at);
    }
  });

  for (const record of extra) {
    if (!record || typeof record !== "object") continue;
    let at = -1;
    for (const key of usableKeys(record, keysOf)) {
      if (index.has(key)) {
        at = index.get(key);
        break;
      }
    }
    if (at >= 0) {
      const current = out[at];
      for (const [field, value] of Object.entries(record)) {
        const empty = current[field] === undefined || current[field] === null || current[field] === "";
        if (empty && value !== undefined && value !== null && value !== "") current[field] = value;
      }
      if (record.provenance) current.provenance = record.provenance;
    } else {
      at = out.push({ ...record, origin: "imported" }) - 1;
    }
    for (const key of usableKeys(out[at], keysOf)) {
      if (!index.has(key)) index.set(key, at);
    }
  }
  return out;
}

let mergedCache;

function merged() {
  if (mergedCache) return mergedCache;
  const snapshot = edition() || {};
  const baseActs = provisions_doc().acts || {};
  mergedCache = {
    acts: { ...(snapshot.acts || {}), ...baseActs },
    provisions: mergeRecords(
      provisions_doc().provisions || [],
      snapshot.provisions,
      provisionKeys,
    ),
    judgments: mergeRecords(
      judgments_doc().judgments || [],
      snapshot.judgments,
      judgmentKeys,
    ),
  };
  return mergedCache;
}

/** The raw synced snapshot, or null when none is present. */
export const edition_doc = () => edition();

/** Provenance for the optional snapshot, or null when none is synced. */
export const edition_meta = () => {
  const snapshot = edition();
  if (!snapshot) return null;
  return {
    name: snapshot.edition || null,
    version: snapshot.edition_version || null,
    generatedAt: snapshot.generated_at || null,
    corpusGeneratedAt: snapshot.corpus_generated_at || null,
    homeJurisdiction: snapshot.home_jurisdiction || null,
    counts: snapshot.counts || null,
  };
};

export const acts = () => merged().acts;
export const provisions = () => merged().provisions;
export const provision_by_id = (id) => provisions().find((p) => p.id === id) || null;

export const judgments = () => merged().judgments;
export const judgment_by_id = (id) => judgments().find((j) => j.id === id) || null;

export const categories = () => playbook_doc().categories || [];
export const category_by_id = (id) => categories().find((c) => c.id === id) || null;

export const evidence_library = () => playbook_doc().evidenceLibrary || {};
export const follow_ups = () => playbook_doc().followUps || {};
export const referral_channels = () => playbook_doc().referralChannels || [];
export const date_cues = () => playbook_doc().dateCues || [];

export const action_template = (id) =>
  (actionplans_doc().templates || {})[id] || [];

export const sample_cases = () => samples_doc().sampleCases || [];
export const sample_case = (id) => sample_cases().find((s) => s.id === id) || null;

/** Act metadata for a provision record, or an empty object. */
export function act_for(provision) {
  return acts()[provision?.act] || {};
}

/** Search URL that lets a reader verify a citation themselves. */
export function citation_verify_url(judgment) {
  return `https://indiankanoon.org/search/?formInput=${encodeURIComponent(judgment.citation)}`;
}

export function disclaimer() {
  return {
    headline: "Legal information, not legal advice.",
    body:
      "JollyLLM organises publicly available law and produces a preliminary map of your problem. " +
      "It is not a lawyer, it does not represent you, and nothing here is a conclusion about your case. " +
      "Every section, decision and deadline shown is traceable to a bundled source record, but " +
      "whether that law applies to your facts is something a qualified lawyer has to assess.",
    noHallucinationClaim:
      "We do not claim zero hallucination. The narrower claim we do make is checkable: nothing is " +
      "displayed unless a record for it exists in the bundled corpus, and anything that could not be " +
      "verified is labelled rather than filled in.",
    notAdvice:
      "If your matter involves a risk to life, an ongoing crime, a child, or a hearing already listed, " +
      "speak to a lawyer before you file anything.",
  };
}