#!/usr/bin/env node
/**
 * Sync the datagoblin legal-edition snapshot into data/knowledge.
 *
 * The snapshot is produced by
 * `editions/datagoblin_legal/ingest/export_JollyLLM.py` and published to
 * Supabase Storage (or copied locally). This script only downloads and
 * validates it; it never touches the six hand-curated JSON files.
 *
 *   node scripts/sync_legal_edition.mjs --from <path-or-url>
 *   node scripts/sync_legal_edition.mjs            # uses LEGAL_EDITION_URL
 *
 * With no source configured the script exits 0 and leaves the corpus as it was,
 * so a missing snapshot degrades to the current behaviour rather than breaking
 * startup.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DEFAULT_OUT = path.join(ROOT, "data", "knowledge", "legal_edition.json");
const SCHEMA_VERSION = 1;

function arg(name) {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
}

function fail(message) {
  console.error(`sync_legal_edition: ${message}`);
  process.exitCode = 1;
}

function validate(snapshot) {
  if (!snapshot || typeof snapshot !== "object") throw new Error("snapshot is not an object");
  if (Number(snapshot.schema_version) !== SCHEMA_VERSION) {
    throw new Error(`unsupported schema_version ${snapshot.schema_version}`);
  }
  for (const key of ["provisions", "judgments"]) {
    if (!Array.isArray(snapshot[key])) throw new Error(`${key} is not an array`);
  }
  for (const record of [...snapshot.provisions, ...snapshot.judgments]) {
    if (!record || typeof record !== "object" || !record.id) {
      throw new Error("record without an id");
    }
  }
  return snapshot;
}

async function read(source) {
  if (/^https?:\/\//i.test(source)) {
    const res = await fetch(source, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
    return res.json();
  }
  const file = path.isAbsolute(source) ? source : path.resolve(process.cwd(), source);
  if (!existsSync(file)) throw new Error(`snapshot not found: ${file}`);
  return JSON.parse(readFileSync(file, "utf8"));
}

async function main() {
  const source = arg("--from") || process.env.LEGAL_EDITION_URL || process.env.LEGAL_EDITION_SNAPSHOT;
  const out = arg("--out") || DEFAULT_OUT;

  if (!source) {
    console.log("sync_legal_edition: no LEGAL_EDITION_URL/SNAPSHOT configured; leaving corpus unchanged");
    return;
  }

  let snapshot;
  try {
    snapshot = validate(await read(source));
  } catch (err) {
    fail(err.message);
    return;
  }

  mkdirSync(path.dirname(out), { recursive: true });
  const tmp = `${out}.tmp`;
  writeFileSync(tmp, JSON.stringify(snapshot, null, 2), "utf8");
  renameSync(tmp, out);

  const counts = snapshot.counts || {};
  console.log(
    `sync_legal_edition: wrote ${path.relative(ROOT, out)} ` +
      `(${counts.provisions ?? snapshot.provisions.length} provisions, ` +
      `${counts.judgments ?? snapshot.judgments.length} judgments)`,
  );
}

main();
