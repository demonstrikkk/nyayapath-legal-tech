import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Start a test server on a dedicated random/free port
let server;
let baseUrl;

test.before(async () => {
  process.env.PORT = "0"; // free port
  const appModule = await import("../server/src/index.js");
  const app = appModule.default;
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

test.after(async () => {
  if (server) {
    server.closeAllConnections?.();
    server.close();
  }
  const retrieval = await import("../server/src/retrievalClient.js");
  retrieval.shutdown();
  setTimeout(() => process.exit(0), 100).unref();
});

function countCsvRows(text) {
  let rows = 0;
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '"') {
      if (quoted && text[i + 1] === '"') i += 1;
      else quoted = !quoted;
    } else if (text[i] === "\n" && !quoted) {
      rows += 1;
    }
  }
  return rows;
}

async function api(path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-user-id": "test_advocate_user",
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

test("1. Case creation with conversational intake and auto-classification", async () => {
  const res = await api("/api/cases", {
    method: "POST",
    body: JSON.stringify({
      narrative: "My husband beat me and demanded ten lakh rupees in dowry on 15 May 2026 in Jaipur.",
    }),
  });

  assert.equal(res.status, 201);
  assert.ok(res.data.case.id);
  assert.ok(["dowry", "domestic-violence"].includes(res.data.case.category));
  assert.ok(res.data.nextIntakeStep.question);
});

test("2. Conversational turns, adaptive questioning, and skips", async () => {
  // Create case
  const createRes = await api("/api/cases", {
    method: "POST",
    body: JSON.stringify({
      title: "Cyber banking scam",
      category: "cyber",
    }),
  });
  const caseId = createRes.data.case.id;

  // Turn 1: User message with transaction details
  const msg1 = await api(`/api/cases/${caseId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      content: "I received a phishing SMS and lost Rs 85,000 on 2026-09-28.",
    }),
  });
  assert.equal(msg1.status, 200);
  assert.ok(msg1.data.activeFacts.length >= 1);
  assert.ok(msg1.data.nextIntakeStep.question);

  // Turn 2: User skips
  const msg2 = await api(`/api/cases/${caseId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      content: "I don't know",
    }),
  });
  assert.equal(msg2.status, 200);
  assert.equal(msg2.data.turnResult.type, "skip");

  // Get full state
  const state = await api(`/api/cases/${caseId}`);
  assert.equal(state.status, 200);
  assert.equal(state.data.case.id, caseId);
  assert.ok(state.data.facts.length >= 1);
});

test("3. Case legal analysis and procedural action plan generation", async () => {
  const createRes = await api("/api/cases", {
    method: "POST",
    body: JSON.stringify({
      title: "Domestic abuse and maintenance claim",
      category: "domestic-violence",
      narrative: "My spouse locked me out of our shared flat in Jaipur on 10 April 2026 without any maintenance.",
    }),
  });
  const caseId = createRes.data.case.id;

  const analysisRes = await api(`/api/cases/${caseId}/analysis`, {
    method: "POST",
  });

  assert.equal(analysisRes.status, 200);
  assert.ok(analysisRes.data.analysis.provisions.length > 0);
  assert.ok(analysisRes.data.actionPlan.items.length > 0);
  assert.ok(analysisRes.data.analysis.applicability.criminalLawTransition);
});

test("4. Courtroom Opponent Simulation Agent", async () => {
  const createRes = await api("/api/cases", {
    method: "POST",
    body: JSON.stringify({
      title: "Cyber fraud defense test",
      category: "cyber",
      narrative: "An unauthorized transaction occurred from my bank account after an SMS prompt.",
    }),
  });
  const caseId = createRes.data.case.id;

  const oppRes = await api(`/api/cases/${caseId}/opponent-simulation`, {
    method: "POST",
    body: JSON.stringify({
      customScenario: "What if the bank produces logs claiming the customer entered the OTP twice?",
    }),
  });

  assert.equal(oppRes.status, 200);
  assert.ok(oppRes.data.simulation.report.opposingTheory);
  assert.ok(oppRes.data.simulation.report.crossExaminationQuestions.length > 0);
  assert.ok(oppRes.data.simulation.report.rebuttalStrategies.length > 0);
});

test("5. Dynamic Legal Research Agent", async () => {
  const createRes = await api("/api/cases", {
    method: "POST",
    body: JSON.stringify({
      title: "Shared household rights query",
      category: "domestic-violence",
    }),
  });
  const caseId = createRes.data.case.id;

  const res = await api(`/api/cases/${caseId}/research`, {
    method: "POST",
    body: JSON.stringify({
      query: "Can a wife claim residence order in property owned by in-laws under Domestic Violence Act?",
    }),
  });

  assert.equal(res.status, 200);
  assert.ok(res.data.research.synthesis);
  assert.ok(res.data.research.findings.provisions.length > 0 || res.data.research.findings.judgments.length > 0);
});

test("6. Fact correction with downstream invalidation", async () => {
  const createRes = await api("/api/cases", {
    method: "POST",
    body: JSON.stringify({
      title: "Landlord dispute",
      category: "property",
      narrative: "Landlord illegally locked the flat on 1 March 2026.",
    }),
  });
  const caseId = createRes.data.case.id;

  // Generate initial plan
  await api(`/api/cases/${caseId}/analysis`, { method: "POST" });
  let plan = await api(`/api/cases/${caseId}/action-plan`);
  assert.equal(plan.data.actionPlan.status, "active");

  const state = await api(`/api/cases/${caseId}`);
  const factId = state.data.facts[0].id;

  // Correct the fact
  const corr = await api(`/api/cases/${caseId}/facts/${factId}/corrections`, {
    method: "POST",
    body: JSON.stringify({
      correctedStatement: "Landlord illegally locked the flat on 10 March 2026 (not 1 March).",
    }),
  });
  assert.equal(corr.status, 200);

  // Case version should increment
  const updatedState = await api(`/api/cases/${caseId}`);
  assert.equal(updatedState.data.case.case_version, 2);
});

test("7. Legal corpus browser API", async () => {
  const corpus = await api("/api/corpus");
  assert.equal(corpus.status, 200);
  assert.deepEqual(corpus.data.counts.merged, {
    provisions: 100,
    judgments: 26,
    total: 126,
  });
  assert.deepEqual(corpus.data.counts.curated, {
    provisions: 54,
    judgments: 14,
    total: 68,
  });
  assert.deepEqual(corpus.data.counts.imported, {
    provisions: 46,
    judgments: 12,
    total: 58,
  });
  assert.deepEqual(corpus.data.counts.edition, {
    provisions: 54,
    judgments: 14,
    total: 68,
  });
  assert.equal(corpus.data.facets.origins.curated, 68);
  assert.equal(corpus.data.facets.origins.imported, 58);

  const imported = await api("/api/provisions?origin=imported&limit=2000");
  assert.equal(imported.status, 200);
  assert.equal(imported.data.total, 46);
  assert.equal(imported.data.provisions.length, 46);
  assert.ok(imported.data.provisions.every((p) => p.origin === "imported"));
  assert.equal(
    new Set(imported.data.provisions.map((p) => p.id)).size,
    imported.data.provisions.length,
  );
  assert.ok(
    imported.data.provisions.every((p) => p.actShortTitle && p.sourceUrl),
  );

  const search = await api("/api/provisions?q=primary%20evidence");
  assert.ok(search.data.provisions.some((p) => p.id === "BSA-57"));

  const local = await api("/api/judgments?tier=local");
  assert.ok(local.data.judgments.some((j) => j.id === "delhi-hc-nazma-2026"));
  assert.ok(local.data.judgments.every((j) => j.tier === "local"));

  const edition = await api("/api/edition");
  assert.equal(edition.status, 200);
  assert.equal(edition.data.counts.total, 68);
  assert.equal(edition.data.provisions.length, 54);
  assert.equal(edition.data.judgments.length, 14);
  assert.ok(
    [...edition.data.provisions, ...edition.data.judgments].every(
      (record) => record.origin === "imported",
    ),
  );

  const mergedCsv = await fetch(`${baseUrl}/api/corpus/export.csv`);
  assert.equal(mergedCsv.status, 200);
  assert.match(mergedCsv.headers.get("content-type"), /text\/csv/);
  const mergedBody = await mergedCsv.text();
  assert.equal(countCsvRows(mergedBody), 127);
  assert.match(mergedBody.split("\n")[0], /record_kind/);

  const editionCsv = await fetch(`${baseUrl}/api/corpus/export.csv?scope=edition`);
  assert.equal(editionCsv.status, 200);
  const editionBody = await editionCsv.text();
  assert.equal(countCsvRows(editionBody), 69);
});

test("8. LangGraph Agent workflow execution", async () => {
  const createRes = await api("/api/cases", {
    method: "POST",
    body: JSON.stringify({
      title: "Workplace harassment complaint",
      category: "workplace-harassment",
      narrative: "Manager demanded sexual favors under threat of termination in Mumbai.",
    }),
  });
  const caseId = createRes.data.case.id;

  const wf = await api(`/api/cases/${caseId}/workflow`, {
    method: "POST",
  });
  assert.equal(wf.status, 200);
  assert.ok(wf.data.workflowResult);
  assert.equal(wf.data.workflowResult.category, "workplace-harassment");
  assert.ok(wf.data.workflowResult.action_plan.length > 0);
});

test("9. A consultation transcript keeps each turn's sender and only client words become facts", async () => {
  const createRes = await api("/api/cases", {
    method: "POST",
    body: JSON.stringify({
      title: "Transcript integrity matter",
      category: "domestic-violence",
      transcript: [
        { sender: "assistant", text: "Please describe what happened in your own words." },
        { sender: "client", text: "My husband locked me out of the flat on 3 June 2026." },
        { sender: "assistant", text: "Do you have a police complaint receipt?" },
        { sender: "document", text: "[Attached Supporting Document: notice.pdf]" },
      ],
    }),
  });
  assert.equal(createRes.status, 201);
  const caseId = createRes.data.case.id;

  const convo = await api(`/api/cases/${caseId}/conversation`);
  assert.equal(convo.status, 200);
  const senders = convo.data.messages.map((m) => m.sender);
  assert.deepEqual(senders, ["assistant", "user", "assistant", "document"]);

  // The advocate's questions must not have become client allegations.
  const state = await api(`/api/cases/${caseId}`);
  const statements = state.data.facts.map((f) => f.statement);
  assert.ok(
    statements.some((s) => s.includes("locked me out of the flat")),
    "the client's own statement should be a fact",
  );
  assert.ok(
    !statements.some((s) => s.includes("police complaint receipt")),
    "the advocate's question must not be a fact",
  );
  assert.ok(
    !statements.some((s) => s.includes("Attached Supporting Document")),
    "a document notice must not be a fact",
  );
});

test("10. One workspace's documents are invisible and untouchable from another", async () => {
  const created = await api("/api/cases", {
    method: "POST",
    body: JSON.stringify({ title: "Document holder case", category: "civil-other" }),
  });
  const caseId = created.data.case.id;

  // A real PDF from the repository, so the test exercises the same
  // extraction path a user hits.
  const pdfPath = fileURLToPath(
    new URL("../Chaos Engineers Domain 2 PS 5 Abstract.pdf", import.meta.url),
  );
  const pdfBytes = readFileSync(pdfPath);
  assert.ok(pdfBytes.length > 1000, "the sample PDF should be readable");

  const form = new FormData();
  form.append("file", new Blob([pdfBytes], { type: "application/pdf" }), "notice.pdf");
  const uploadRes = await fetch(`${baseUrl}/api/cases/${caseId}/documents`, {
    method: "POST",
    headers: { "x-user-id": "test_advocate_user" },
    body: form,
  });
  assert.equal(uploadRes.status, 201);
  const uploaded = await uploadRes.json();
  assert.ok(uploaded.document.id);

  // The document is listed under its own case.
  const listed = await api(`/api/cases/${caseId}/documents`);
  assert.equal(listed.status, 200);
  assert.equal(listed.data.documents.length, 1);
  assert.equal(listed.data.documents[0].filename, "notice.pdf");

  // Another user cannot read it, list it under their case, or delete it.
  const otherCase = await api("/api/cases", {
    method: "POST",
    body: JSON.stringify({ title: "Other user's case", category: "civil-other" }),
    headers: { "x-user-id": "another_user" },
  });
  assert.equal(otherCase.status, 201);
  const otherId = otherCase.data.case.id;

  const foreignRead = await api(`/api/cases/${otherId}/documents/${uploaded.document.id}`, {
    headers: { "x-user-id": "another_user" },
  });
  assert.equal(foreignRead.status, 404);

  const foreignDelete = await api(`/api/cases/${otherId}/documents/${uploaded.document.id}`, {
    method: "DELETE",
    headers: { "x-user-id": "another_user" },
  });
  assert.equal(foreignDelete.status, 404);

  // The document is still there.
  const stillListed = await api(`/api/cases/${caseId}/documents`);
  assert.equal(stillListed.data.documents.length, 1);

  // And the owner can remove it.
  const removed = await api(`/api/cases/${caseId}/documents/${uploaded.document.id}`, {
    method: "DELETE",
  });
  assert.equal(removed.status, 200);
  const afterDelete = await api(`/api/cases/${caseId}/documents`);
  assert.equal(afterDelete.data.documents.length, 0);
});

test("11. A case owned by one user is not visible to another", async () => {
  const created = await api("/api/cases", {
    method: "POST",
    body: JSON.stringify({ title: "Private matter", category: "civil-other" }),
  });
  const caseId = created.data.case.id;

  const foreignGet = await api(`/api/cases/${caseId}`, {
    headers: { "x-user-id": "someone_else" },
  });
  assert.equal(foreignGet.status, 404);

  const foreignMessages = await api(`/api/cases/${caseId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content: "I should not be able to write to this case." }),
    headers: { "x-user-id": "someone_else" },
  });
  assert.equal(foreignMessages.status, 404);

  const foreignList = await api("/api/cases", { headers: { "x-user-id": "someone_else" } });
  assert.ok(
    !foreignList.data.cases.some((c) => c.id === caseId),
    "another user's case must not appear in the list",
  );
});

test("12. The legal dataset search says plainly when no live dataset is configured", async () => {
  const status = await api("/api/legal/dataset/status");
  assert.equal(status.status, 200);
  assert.equal(typeof status.data.configured, "boolean");
  // The key must never be echoed back to a client.
  assert.equal(status.data.apiKey, undefined);
  assert.equal(status.data.key, undefined);

  const search = await api("/api/legal/dataset/search", {
    method: "POST",
    body: JSON.stringify({ query: "dishonour of cheque" }),
  });
  assert.equal(search.status, 200);
  assert.equal(search.data.configured, false);
  assert.equal(search.data.source, "bundled-corpus");
  assert.ok(search.data.detail, "an unconfigured search must explain itself");
});

test("13. The authorities a case relied on are recorded against it", async () => {
  const created = await api("/api/cases", {
    method: "POST",
    body: JSON.stringify({
      title: "Authority recording case",
      category: "domestic-violence",
      narrative:
        "My husband locked me out of the shared flat on 4 April 2026 and kept my stridhan, after years of demanding dowry.",
    }),
  });
  const caseId = created.data.case.id;

  // Research records the provisions and decisions it relied on.
  const research = await api(`/api/cases/${caseId}/research`, {
    method: "POST",
    body: JSON.stringify({ query: "residence order and protection in a shared household" }),
  });
  assert.equal(research.status, 200);

  const authorities = await api(`/api/cases/${caseId}/authorities`);
  assert.equal(authorities.status, 200);
  assert.ok(authorities.data.total > 0, "research should record the authorities it used");

  // Every recorded authority names itself and says where it came from.
  for (const a of authorities.data.authorities) {
    assert.ok(a.identifier, "an authority must be identified");
    assert.ok(a.authority_type);
    assert.ok(["quote-backed", "unverified"].includes(a.verification_status));
  }

  // The same research again does not stack duplicates.
  await api(`/api/cases/${caseId}/research`, {
    method: "POST",
    body: JSON.stringify({ query: "residence order and protection in a shared household" }),
  });
  const again = await api(`/api/cases/${caseId}/authorities`);
  assert.equal(again.data.total, authorities.data.total);
});
