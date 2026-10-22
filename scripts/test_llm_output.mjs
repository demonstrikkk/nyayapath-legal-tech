import { test } from "node:test";
import assert from "node:assert/strict";

import * as llm from "../server/src/llm.js";

/**
 * The scrubber and the provider call are the two places where a legal
 * assistant can quietly produce a wrong answer: one rewrites the client's
 * facts, the other throws away a working model reply.
 */

const ctx = {
  narrative:
    "My husband and in-laws have been demanding one lakh rupees as dowry every month since our marriage in 2021. On 12 June 2026 he locked me out of the shared flat in Delhi and withheld my stridhan. I work as a school teacher earning 42,000 rupees per month. I filed a police complaint on 3 July 2026 but no FIR was registered.",
  provisions: [
    {
      id: "BNS-85",
      section: "85",
      act: "BNS",
      actShortTitle: "BNS",
      heading: "Protection officers",
      summary: "The protection officer shall assist the aggrieved person.",
      sourceUrl: "https://indiacode.nic.in/handle/1",
    },
  ],
  judgments: [
    {
      id: "sc-arnesh-kumar-2014",
      title: "Arnesh Kumar v. State of Bihar",
      citation: "(2014) 8 SCC 273",
      court: "Supreme Court of India",
      year: 2014,
      holding: "Police must not arrest without reasonable suspicion.",
      verifyUrl: "https://indiankanoon.org/x",
    },
  ],
  evidence: [{ item: "Marriage certificate" }],
  languageCode: "en",
};

test("the client's own numbers survive the legal-reference scrub", () => {
  // The whole validation path, as a model reply would be checked: the
  // narrative's numbers are allowed, an invented section is not.
  const raw = {
    caseSummary:
      "The petitioner married in 2021 and earns 42,000 rupees a month. The lockout happened on 12 June 2026. She alleges section 999 applies.",
    keyIssues: ["Dowel demand in 2021", "Rent arrears of 55,000 rupees"],
  };

  const out = llm.validate(raw, ctx);

  assert.match(out.caseSummary, /2021/);
  assert.match(out.caseSummary, /42,000/);
  assert.match(out.caseSummary, /12 June 2026/);
  // The invented section is gone.
  assert.doesNotMatch(out.caseSummary, /999/);
  // A fact in the list is untouched.
  assert.match(out.keyIssues[0], /2021/);
  assert.match(out.keyIssues[1], /55,000/);
});

test("a bare number in the model's text is left alone", () => {
  // The scrubber is exercised through the exported validation path.
  const summary =
    "The petitioner married in 2021 and earns 42,000 rupees a month. The lockout happened on 12 June 2026.";
  const allowed = new Set(["2021", "12", "2026", "42", "000"]);
  const scrubbed = llm.scrubLegalReferences(summary, allowed);
  assert.match(scrubbed, /2021/);
  assert.match(scrubbed, /42,000/);
  assert.match(scrubbed, /12 June 2026/);
});

test("an invented section number is removed", () => {
  const allowed = new Set(["85"]);
  const scrubbed = llm.scrubLegalReferences(
    "The protection officer is appointed under section 999 of the Act, and section 85 applies here.",
    allowed,
  );
  assert.doesNotMatch(scrubbed, /999/);
  // A section that is in the corpus stays.
  assert.match(scrubbed, /section 85/);
});

test("a year that only looks like a section number is not touched", () => {
  const allowed = new Set();
  const scrubbed = llm.scrubLegalReferences(
    "The parties married in 2021 and the case was listed in 2026.",
    allowed,
  );
  assert.match(scrubbed, /2021/);
  assert.match(scrubbed, /2026/);
});

test("a number the client wrote is allowed even in a legal position", () => {
  // The client says "section 138" in their own account, so the model may
  // repeat it. An invented one may not.
  const withClientNumber = llm.scrubLegalReferences(
    "The notice was issued under section 138 as the client stated.",
    new Set(["138"]),
  );
  assert.match(withClientNumber, /138/);

  const invented = llm.scrubLegalReferences(
    "The notice was issued under section 999 as the client stated.",
    new Set(["138"]),
  );
  assert.doesNotMatch(invented, /999/);
});
