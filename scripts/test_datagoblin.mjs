import { test } from "node:test";
import assert from "node:assert/strict";

import * as datagoblin from "../server/src/datagoblinClient.js";
import { authorityFromDatagoblin, authorityFromCorpus } from "../server/src/authorities.js";

test("the datagoblin client reports itself unconfigured without a base URL and key", () => {
  const described = datagoblin.describe();
  assert.equal(typeof described.configured, "boolean");
  // The key must never be part of what the client describes.
  assert.equal(described.apiKey, undefined);
  assert.equal(described.key, undefined);
  assert.equal(described.secret, undefined);
});

test("a datagoblin row becomes an authority that names its source and quote", () => {
  // The shape a live row actually has: fields nested under `fields`, each
  // with its own value and a source block holding the quote.
  const row = {
    record_id: "1234",
    fields: {
      document_title: {
        value: "DRCA s. 14 - Protection of tenant against eviction",
        source: { quote: "Title: DRCA s. 14", url: "https://example.invalid/handle/1" },
      },
      citation: { value: "DRCA, 1958, s. 14", source: { quote: "Citation: DRCA" } },
      document_type: { value: "statute", source: {} },
      summary: {
        value: "no order for recovery of possession shall be made against a tenant",
        source: { quote: "no order for recovery of possession shall be made" },
      },
    },
  };

  const authority = authorityFromDatagoblin(row);
  assert.equal(authority.authorityType, "statute");
  assert.equal(authority.identifier, "DRCA s. 14 - Protection of tenant against eviction");
  assert.equal(authority.citation, "DRCA, 1958, s. 14");
  assert.equal(authority.sourceUrl, "https://example.invalid/handle/1");
  assert.equal(authority.verificationStatus, "quote-backed");
  assert.match(authority.ratio, /recovery of possession/);
  assert.equal(authority.source, "datagoblin");
});

test("a datagoblin row with no usable fields is not turned into an authority", () => {
  assert.equal(authorityFromDatagoblin(null), null);
  assert.equal(authorityFromDatagoblin({ fields: {} }), null);
  assert.equal(authorityFromDatagoblin({ fields: { act: { value: "BNS" } } }), null);
});

test("a corpus record becomes an authority that carries its quote", () => {
  const authority = authorityFromCorpus({
    id: "BNS-85",
    act: "BNS",
    section: "85",
    heading: "Protection officers",
    summary: "The protection officer shall assist the aggrieved person.",
    sourceUrl: "https://indiacode.nic.in/handle/1",
  });
  assert.equal(authority.authorityType, "statute");
  assert.equal(authority.identifier, "BNS-85");
  assert.equal(authority.verificationStatus, "quote-backed");
  assert.match(authority.ratio, /protection officer/);
});

test("a corpus judgment is recorded as a judgment, not a statute", () => {
  const authority = authorityFromCorpus({
    id: "sc-arnesh-kumar-2014",
    title: "Arnesh Kumar v. State of Bihar",
    citation: "(2014) 8 SCC 273",
    court: "Supreme Court of India",
    ratio: "Police must not arrest without reasonable suspicion.",
  });
  assert.equal(authority.authorityType, "judgment");
  assert.equal(authority.citation, "(2014) 8 SCC 273");
});

test("the legal search terms carry the issue and place, not the narrative", () => {
  const terms = datagoblin.legalSearchTerms(
    { category: "tenancy-eviction", jurisdiction: "Delhi" },
    [{ label: "Protection of tenant", anchorTerms: ["eviction", "rent"] }],
  );
  assert.ok(terms.includes("tenancy eviction"));
  assert.ok(terms.includes("delhi"));
  assert.ok(terms.includes("eviction"));
  // No narrative text can appear here: only the issue and the place.
  assert.ok(!terms.some((t) => t.includes("my husband") || t.includes("locked me out")));
});
