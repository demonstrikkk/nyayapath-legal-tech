import { after, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as kb from "../server/src/knowledge.js";
import { retrieve, shutdown } from "../server/src/retrievalClient.js";
import { analyse } from "../server/src/analysis.js";

process.env.LLM_ENABLED = "false";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT = path.join(ROOT, "data", "knowledge", "legal_edition.json");
const hasSnapshot = existsSync(SNAPSHOT);

after(() => shutdown());

test("the curated corpus survives the legal-edition merge", { skip: !hasSnapshot }, () => {
  const provisions = kb.provisions();
  const judgments = kb.judgments();

  assert.ok(provisions.length > 54, "the snapshot should add provisions");
  assert.ok(judgments.length > 14, "the snapshot should add judgments");

  const provisionKeys = new Set(provisions.map((p) => `${p.act}:${p.section}`));
  assert.equal(provisionKeys.size, provisions.length, "duplicate act/section after merge");

  const judgmentIds = new Set(judgments.map((j) => j.id));
  assert.equal(judgmentIds.size, judgments.length, "duplicate judgment id after merge");

  const dva = kb.provision_by_id("DVA-12");
  assert.ok(dva, "the curated DVA record must not be dropped");
  assert.equal(dva.category, "domestic-violence", "an existing record must win");
});

test("imported records carry provenance and a tier", { skip: !hasSnapshot }, () => {
  const imported = kb.provision_by_id("BSA-57");
  assert.ok(imported, "BSA-57 should come from the snapshot");
  assert.ok(imported.provenance?.source_url);
  assert.equal(imported.provenance.verification, "quote-backed");
  assert.ok(["local", "regional", "national"].includes(imported.tier));
});

test("an overlapping judgment is enriched rather than duplicated", { skip: !hasSnapshot }, () => {
  const all = kb.judgments();
  const matches = all.filter((j) => /d\.?k\.? basu/i.test(j.title || ""));
  assert.equal(matches.length, 1, "D.K. Basu must appear once");
  assert.ok(matches[0].provenance?.source_url);
});

test("retrieval groups results into local, regional and national", { skip: !hasSnapshot }, async () => {
  const res = await retrieve({
    collection: "judgments",
    query: "bail conditions and speedy trial",
    topK: 8,
    mode: "sparse",
    homeJurisdiction: "Delhi",
  });
  assert.ok(res.ok, res.error);
  const tiered = (res.results || []).filter((r) => r.tier);
  assert.ok(tiered.length > 0, "expected tiered results");
  for (const record of tiered) assert.ok(record.tierRank);
  assert.ok(Array.isArray(res.tierBuckets) && res.tierBuckets.length > 0);
  for (const bucket of res.tierBuckets) {
    assert.ok(["local", "regional", "national", "unassigned"].includes(bucket.name));
    assert.equal(bucket.count, bucket.record_ids.length);
  }
});

test("analysis passes the case location through to retrieval", { skip: !hasSnapshot }, async () => {
  const result = await analyse({
    title: "Bail conditions",
    category: "liberty",
    narrative:
      "I was granted bail with conditions and the police are delaying the investigation. " +
      "I want to challenge the bail conditions and ask for a speedy trial.",
    location: "Delhi",
    startDate: "",
    language: "en",
  });

  const delhi = result.judgments.find((j) => j.state === "Delhi");
  assert.ok(delhi, "expected the Delhi judgment from the snapshot");
  assert.equal(delhi.tierRank, "local");
  assert.ok(
    result.provisions.some((p) => p.tierRank === "national"),
    "expected national statutory provisions to remain available",
  );
});
