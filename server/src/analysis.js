/**
 * Case analysis pipeline.
 *
 * Orchestrates: intake validation -> language detection -> issue
 * classification -> fact and timeline extraction -> evidence map -> cross-statute
 * provision retrieval -> precedent retrieval -> action plan -> referral routing.
 *
 * Design rules that are not negotiable:
 *  1. Nothing is displayed unless a record for it exists in the bundled corpus.
 *  2. No deadline is emitted unless a corpus record states it.
 *  3. A weak match is shown as a weak match, never dressed up as a conclusion.
 */
import * as kb from "./knowledge.js";
import * as retrieval from "./retrievalClient.js";
import * as extract from "./extract.js";
import * as issueDetection from "./issueDetection.js";
import * as llm from "./llm.js";

const NEW_CRIMINAL_LAW_FROM = "2024-07-01";
const MIN_SECONDARY_CATEGORY_SCORE = 3;

const GENERIC_TOPIC_TERMS = new Set([
  "act",
  "case",
  "court",
  "domestic",
  "family",
  "friend",
  "home",
  "house",
  "household",
  "law",
  "legal",
  "matter",
  "money",
  "order",
  "person",
  "police",
  "property",
  "section",
  "state",
  "woman",
]);

const CATEGORY_ALIASES = {
  harassment: "harassment",
  "sexual harassment": "harassment",
  molestation: "harassment",
  "sexual violence": "sexual-violence",
  rape: "sexual-violence",
  "domestic violence": "domestic-violence",
  "domestic abuse": "domestic-violence",
  dowry: "dowry",
  "dowry harassment": "dowry",
  cybercrime: "cyber",
  cyber: "cyber",
  "online fraud": "cyber",
  "workplace harassment": "workplace-harassment",
  "child safety": "child-safety",
  posco: "child-safety",
  property: "property",
  "property dispute": "property",
  financial: "financial",
  consumer: "consumer",
  liberty: "liberty",
  "civil-other": "civil-other",
  civil: "civil-other",
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateIntake(input = {}) {
  const errors = {};
  const title = String(input.title ?? "").trim();
  const narrative = String(input.narrative ?? "").trim();
  const category = String(input.category ?? "").trim();
  const location = String(input.location ?? "").trim();
  const startDate = String(input.startDate ?? "").trim();

  if (title.length < 3) {
    errors.title = "Give the matter a short name of at least 3 characters, for example 'Repeat abuse after separation'.";
  } else if (title.length > 140) {
    errors.title = "Keep the name under 140 characters.";
  }

  if (narrative.length < 60) {
    errors.narrative =
      "Describe what happened in at least a couple of sentences. The more specific you are about what was done, when, and who was present, the more useful the result.";
  } else if (narrative.length > 20000) {
    errors.narrative = "Please shorten the narrative to 20,000 characters.";
  }

  if (!category) {
    errors.category = "Choose the kind of problem this is.";
  } else if (!kb.category_by_id(category)) {
    errors.category = "That issue type is not one we support yet.";
  }

  if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    errors.startDate = "Use the date picker, or leave this blank.";
  } else if (startDate) {
    const d = new Date(startDate + "T00:00:00Z");
    if (Number.isNaN(d.getTime()) || d.getFullYear() < 1980 || d.getFullYear() > new Date().getFullYear() + 1) {
      errors.startDate = "That date looks wrong. It should be between 1980 and next year.";
    }
  }

  if (location && location.length > 120) {
    errors.location = "Keep the place name under 120 characters.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    value: { title, narrative, category, location, startDate, language: input.language || null },
  };
}

// ---------------------------------------------------------------------------
// Jurisdiction and date applicability
// ---------------------------------------------------------------------------

/**
 * The 2023 criminal statutes came into force on 1 July 2024. Which set of
 * sections applies depends on when the conduct happened, so we state this rather
 * than silently showing the current sections.
 */
function applicability(categoryId, startDate, detectedDates, extra = {}) {
  const all = [startDate, ...detectedDates].filter(Boolean).sort();
  const earliest = all[0] || null;
  const categoryIds = [...new Set([categoryId, ...(extra.categoryIds || [])].filter(Boolean))];

  const families = {
    harassment: ["BNS", "BNSS", "POSH"],
    "sexual-violence": ["BNS", "BNSS", "POCSO"],
    "domestic-violence": ["DVA", "BNS", "BNSS"],
    dowry: ["BNS", "DVA", "BNSS"],
    cyber: ["ITACT", "BNSS", "BNS"],
    "workplace-harassment": ["POSH", "BNS", "BNSS"],
    "child-safety": ["POCSO", "BNSS"],
    property: ["BNS"],
    assault: ["BNS", "BNSS"],
    liberty: ["BNS", "BNSS"],
    financial: ["NI", "BNS", "CPA"],
    consumer: ["CPA"],
    "civil-other": ["CPA"],
  };
  const criminalFamilies = categoryIds.flatMap((id) => families[id] || []);

  const criminalInvolved =
    Boolean(extra.criminalHint) ||
    criminalFamilies.some((a) => a === "BNS" || a === "BNSS");
  const before = earliest ? earliest < NEW_CRIMINAL_LAW_FROM : null;

  if (!criminalInvolved) {
    return {
      appliesFrom: null,
      note: "This matter does not turn on the criminal statutes, so the date of the incident does not change which provisions apply.",
      criminalLawTransition: false,
    };
  }

  if (before === true) {
    return {
      appliesFrom: NEW_CRIMINAL_LAW_FROM,
      earliestEvent: earliest,
      criminalLawTransition: true,
      corpusCoverageGap:
        "The bundled corpus contains the current Bharatiya Nyaya Sanhita and Bharatiya Nagarik Suraksha Sanhita sections, but not the repealed Indian Penal Code or Code of Criminal Procedure text. The provisions shown are therefore the current sections, not the law that applied at the time.",
      note: `The earliest event you gave is ${earliest}, which is before 1 July 2024. The Bharatiya Nyaya Sanhita 2023, the Bharatiya Nagarik Suraksha Sanhita 2023 and the Bharatiya Sakshya Adhiniyam 2023 came into force on that date and repealed the Indian Penal Code, the Code of Criminal Procedure and the Indian Evidence Act. We are showing the current sections because they are the ones in force now, but conduct dating from before that date is ordinarily dealt with under the repealed law. A lawyer should confirm which applies.`,
    };
  }

  if (before === false) {
    return {
      appliesFrom: NEW_CRIMINAL_LAW_FROM,
      earliestEvent: earliest,
      criminalLawTransition: true,
      note: `Your earliest dated event is ${earliest}, which is on or after 1 July 2024, so the current criminal statutes apply throughout.`,
    };
  }

  return {
    appliesFrom: NEW_CRIMINAL_LAW_FROM,
    criminalLawTransition: true,
    note: "No date could be established from the narrative, so we cannot tell which criminal statute applies. The Bharatiya Nyaya Sanhita and the Bharatiya Nagarik Suraksha Sanhita replaced the Indian Penal Code and the Code of Criminal Procedure on 1 July 2024. Add a date to the narrative if you know one.",
  };
}

// ---------------------------------------------------------------------------
// Evidence mapping
// ---------------------------------------------------------------------------

/**
 * Mark evidence items the narrative suggests the person already holds, so the
 * checklist is useful rather than a generic list. Matching is on explicit
 * phrases, never on inference.
 */
function mapEvidence(categories) {
  const library = kb.evidence_library();
  const seen = new Set();
  const items = [];

  for (const cat of categories) {
    const list = library[cat.id] || [];
    for (const entry of list) {
      if (seen.has(entry.item)) continue;
      seen.add(entry.item);
      items.push({ ...entry, forIssue: cat.label });
    }
  }
  return items;
}

function evidenceHintsFromNarrative(text, evidenceItems) {
  const lower = text.toLowerCase();
  const hints = [
    { pattern: /\b(screenshot|screen shot|photo|photograph|picture|image)\b/i, item: /screenshot|photograph|picture|dated photographs|image/i },
    { pattern: /\b(hospital|doctor|clinic|medical|medicines?|prescription|test report|reports?)\b/i, item: /medical|hospital|doctor/i },
    { pattern: /\b(message|sms|whatsapp|call log|chat|mail|email)\b/i, item: /message|sms|whatsapp|call log|chat|email/i },
    { pattern: /\b(witness|neighbour|neighbor|witnesses|present)\b/i, item: /witness/i },
    { pattern: /\b(invoice|bill|receipt|rent|account|bank statement)\b/i, item: /invoice|bill|receipt|rent|bank statement|proof of residence/i },
    { pattern: /\b(fir|police station|complaint|copy)\b/i, item: /acknowledgment|copy of the recorded information|complaint reference|ticket number/i },
  ];

  const likelyHeld = new Set();
  for (const h of hints) {
    if (h.pattern.test(text)) {
      for (const it of evidenceItems) {
        if (h.item.test(it.item)) likelyHeld.add(it.item);
      }
    }
  }
  return likelyHeld;
}

// ---------------------------------------------------------------------------
// Referrals
// ---------------------------------------------------------------------------

const REFERRAL_MAP = {
  "sexual-violence": ["police-112", "nalsa", "dlsa", "women-helpline"],
  "child-safety": ["police-112", "childline", "nalsa", "ncw"],
  domestic: ["police-112", "nalsa", "dlsa", "women-helpline", "ncw"],
  dowry: ["police-112", "nalsa", "dlsa", "women-helpline"],
  cyber: ["cyber-1930", "cyber-portal", "police-112", "nalsa"],
  workplace: ["police-112", "nalsa", "women-helpline"],
  property: ["police-112", "nalsa", "dlsa"],
  financial: ["police-112", "nalsa", "dlsa"],
  consumer: ["ncpc", "edupal", "nalsa"],
  liberty: ["police-112", "nalsa", "dlsa"],
  "civil-other": ["nalsa", "dlsa"],
};

function referralsFor(categories, emergencyFlag) {
  const channels = kb.referral_channels();
  const byId = new Map(channels.map((c) => [c.id, c]));
  const wanted = new Set();
  for (const cat of categories) {
    let list = [];
    for (const [key, ids] of Object.entries(REFERRAL_MAP)) {
      if (cat.id.includes(key)) list = ids;
    }
    for (const id of list) wanted.add(id);
  }
  // Legal aid is always available and always worth surfacing.
  wanted.add("nalsa");
  wanted.add("dlsa");
  if (emergencyFlag) wanted.add("police-112");

  const out = [];
  for (const id of wanted) {
    const c = byId.get(id);
    if (c) out.push(c);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Retrieval merging and coverage
// ---------------------------------------------------------------------------

function categoriesOf(rec) {
  if (Array.isArray(rec?.categories) && rec.categories.length) return rec.categories;
  return rec?.category ? [rec.category] : [];
}

function normaliseTopicText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function topicTermsFor(rec, kind) {
  const fields =
    kind === "judgment"
      ? [rec?.signalTerms]
      : [rec?.keywords, rec?.signalTerms];
  return fields
    .flatMap((field) => (Array.isArray(field) ? field : [field]))
    .map(normaliseTopicText)
    .filter((term) => term.length >= 3 && !GENERIC_TOPIC_TERMS.has(term));
}

function isTopicallyRelevant(rec, context, kind = "provision") {
  const haystack = normaliseTopicText(context);
  if (!haystack) return false;
  return topicTermsFor(rec, kind).some((term) => haystack.includes(term));
}

function robberyTitleCaveat(title, detectedIssues) {
  const titleMentionsRobbery = /\b(?:robbery|robbed|robbing)\b/i.test(String(title || ""));
  if (!titleMentionsRobbery) return null;
  if ((detectedIssues || []).some((issue) => issue.id === "robbery")) return null;
  return "The title mentions robbery, but the narrative does not provide enough facts for a robbery candidate, which requires force or a threat used to take property. Robbery is not assumed from the title; the taking is treated here as theft unless the narrative says otherwise.";
}

const ACTION_PLAN_ISSUE_ALIASES = {
  robbery: "theft",
};

function actionPlanKeyFor(detectedIssues, researchCategories, primaryId) {
  const hasTemplate = (id) => Boolean(id) && (kb.action_template(id) || []).length > 0;
  for (const issue of detectedIssues || []) {
    for (const id of [issue.id, ACTION_PLAN_ISSUE_ALIASES[issue.id]]) {
      if (hasTemplate(id)) return { key: id, kind: "issue" };
    }
  }
  const category = (researchCategories || []).find((rec) => hasTemplate(rec.id));
  if (category) return { key: category.id, kind: "category" };
  return { key: primaryId, kind: "category" };
}

function researchCategoryRecords(resolved, primaryId, detectedIssues) {
  const classified = new Map(resolved.map((rec) => [rec.id, rec]));
  const ids = detectedIssues.length
    ? detectedIssues.flatMap((issue) => issue.categoryIds || [])
    : [primaryId];
  return [...new Set(ids)]
    .map((id) => {
      if (classified.has(id)) return classified.get(id);
      const record = kb.category_by_id(id);
      if (!record) return null;
      return {
        id,
        label: record.label,
        score: null,
        matchedSignals: [],
        reason: "Matched from the narrative",
        record,
      };
    })
    .filter(Boolean);
}

function mergeRetrieved(groups) {
  const merged = new Map();
  for (const { results, source } of groups) {
    for (const rec of results || []) {
      if (!rec?.id) continue;
      const existing = merged.get(rec.id);
      if (!existing) {
        merged.set(rec.id, {
          ...rec,
          matchedTerms: [...new Set(rec.matchedTerms || [])],
          retrievalSources: source ? [source] : [],
        });
        continue;
      }
      if (typeof rec.score === "number" && rec.score > (existing.score ?? 0)) {
        existing.score = rec.score;
      }
      if (source && !existing.retrievalSources.includes(source)) {
        existing.retrievalSources.push(source);
      }
      existing.matchedTerms = [
        ...new Set([...(existing.matchedTerms || []), ...(rec.matchedTerms || [])]),
      ].slice(0, 12);
    }
  }
  return [...merged.values()].sort(
    (a, b) => (b.score ?? 0) - (a.score ?? 0) || a.id.localeCompare(b.id),
  );
}

function relevanceBand(score) {
  return score >= 0.12 ? "strong" : score >= 0.05 ? "moderate" : "weak";
}

function retrievalEngineLabel(mode) {
  if (mode === "hybrid") {
    return "hybrid retrieval - sparse TF-IDF for exact statutory wording, plus a multilingual sentence-embedding model for meaning, over a curated corpus";
  }
  if (mode === "dense") {
    return "dense retrieval - a multilingual sentence-embedding model over a curated corpus";
  }
  if (mode === "unavailable") {
    return "retrieval engine unavailable for this request; no provision matching was performed";
  }
  return "sparse TF-IDF retrieval over a curated corpus; the dense sentence-embedding model was not available for this request";
}

function buildRetrievalCoverage({
  provisions,
  judgments,
  detectedIssues,
  retrievalNote,
  judgmentNote,
  applicabilityInfo,
  selectedMismatch,
  contextWarning,
}) {
  const strong = provisions.filter((p) => p.relevance === "strong").length;
  const core = provisions.filter((p) => p.relevance === "core-for-this-issue").length;
  const moderate = provisions.filter((p) => p.relevance === "moderate").length;
  const relevant = strong + core + moderate;
  const gaps = detectedIssues.filter((i) => i.corpusSupport?.status !== "direct");

  let status = "good";
  if (retrievalNote) status = "unavailable";
  else if (!provisions.length || relevant === 0) status = "insufficient";
  else if (!detectedIssues.length && strong === 0) status = "insufficient";
  else if (gaps.length || !judgments.length || strong === 0) status = "partial";

  const warnings = [];
  if (retrievalNote) warnings.push(retrievalNote);
  if (judgmentNote) warnings.push(judgmentNote);
  for (const issue of gaps) {
    if (issue.corpusSupport?.note) warnings.push(issue.corpusSupport.note);
  }
  if (!provisions.length && !retrievalNote) {
    warnings.push(
      "No provision in the bundled corpus could be matched to this account. Nothing has been invented to fill the gap.",
    );
  } else if (relevant === 0 && !retrievalNote) {
    warnings.push(
      "Only weak lexical matches were found. Treat them as unconfirmed and add more specific facts before relying on them.",
    );
  }
  if (!detectedIssues.length && strong === 0 && !retrievalNote) {
    warnings.push(
      "No candidate legal issue could be identified from the narrative, and only weak or category-default provisions were found. Add what was done, by whom, and when before relying on this material.",
    );
  }
  if (!judgments.length && !judgmentNote) {
    warnings.push("No decision in the bundled corpus matched this account, so no precedent is shown.");
  }
  if (applicabilityInfo?.corpusCoverageGap) warnings.push(applicabilityInfo.corpusCoverageGap);
  if (selectedMismatch) warnings.push(selectedMismatch);
  if (contextWarning) warnings.push(contextWarning);

  return {
    status,
    hasRelevantMaterial: relevant > 0,
    provisionCount: provisions.length,
    strongProvisionCount: strong,
    moderateProvisionCount: moderate,
    coreProvisionCount: core,
    judgmentCount: judgments.length,
    directIssueCount: detectedIssues.filter((i) => i.corpusSupport?.status === "direct").length,
    relatedOnlyIssueCount: detectedIssues.filter((i) => i.corpusSupport?.status === "related-only").length,
    unsupportedIssueCount: detectedIssues.filter((i) => i.corpusSupport?.status === "none").length,
    warning: warnings.join(" ") || null,
  };
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export async function analyse(rawInput) {
  const check = validateIntake(rawInput);
  if (!check.valid) {
    const err = new Error("validation_failed");
    err.status = 422;
    err.payload = { error: "validation_failed", fields: check.errors };
    throw err;
  }
  const input = check.value;

  const text = input.narrative;
  const language = extract.detectLanguage(text, input.language);
  const timeline = extract.buildTimeline(text);
  const dates = extract.extractDates(text);

  // Issue detection is deliberately separate from the fixed playbook. It reads
  // the narrative for conduct cues and expands them into corpus search terms, so
  // a broad or mismatched category cannot hide relevant material.
  const detectedIssues = issueDetection.detectIssues(text);
  const issueCategoryIds = issueDetection.categoryIdsFor(detectedIssues);
  const issueRetrievalTerms = issueDetection.retrievalTerms(detectedIssues);
  const titleCaveat = robberyTitleCaveat(input.title, detectedIssues);

  // --- Classification -------------------------------------------------------
  let detected = [];
  if (retrieval.health) {
    const res = await retrieval.categorise(text, input.category);
    if (res.ok && Array.isArray(res.categories)) {
      detected = res.categories;
    }
  }

  const primaryId = input.category;
  const primary = kb.category_by_id(primaryId);
  const materialDetected = detected.filter(
    (d) => d.id === primaryId || Number(d.score) >= MIN_SECONDARY_CATEGORY_SCORE,
  );
  const resolved = [];
  for (const d of materialDetected) {
    const rec = kb.category_by_id(d.id);
    if (rec) resolved.push({ ...d, record: rec });
  }
  if (!resolved.some((r) => r.id === primaryId)) {
    const d = resolved.find((r) => r.id === primaryId);
    resolved.unshift({
      id: primaryId,
      label: primary.label,
      score: null,
      matchedSignals: [],
      reason: "Selected at intake",
      record: primary,
      ...(d || {}),
    });
  }

  // --- Legal research focus ------------------------------------------------
  const researchCategories = researchCategoryRecords(resolved, primaryId, detectedIssues);
  const issueIds = resolved.map((r) => r.id);
  const supportedCategoryIds = [...new Set([...issueIds, ...issueCategoryIds])];
  const retrievalCategoryIds = detectedIssues.length ? issueCategoryIds : [primaryId];

  // --- Facts ---------------------------------------------------------------
  const categoryKeywords = researchCategories.flatMap((r) => r.record?.keywords || []);
  const facts = extract.extractFacts(text, categoryKeywords);

  // --- Evidence ------------------------------------------------------------
  const evidence = mapEvidence(researchCategories);
  const likelyHeld = evidenceHintsFromNarrative(text, evidence);
  for (const item of evidence) {
    item.suggestedHeld = likelyHeld.has(item.item);
  }

  // --- Legal research (continued) -----------------------------------------
  const coreCategoryIds = new Set(
    issueIds.filter((id) => retrievalCategoryIds.includes(id)),
  );
  const defaultProvisionIds = new Set(
    resolved
      .filter((r) => coreCategoryIds.has(r.id))
      .flatMap((r) => r.record?.defaultProvisionIds || []),
  );
  const issueBoostIds = [
    ...new Set(detectedIssues.flatMap((i) => i.corpusSupport?.provisionIds || [])),
  ];

  const applicabilityInfo = applicability(primaryId, input.startDate, dates.map((d) => d.iso), {
    categoryIds: issueCategoryIds,
    criminalHint: detectedIssues.some((i) => i.criminal),
  });
  const beforeNewCriminalLaw =
    Boolean(applicabilityInfo.earliestEvent) &&
    applicabilityInfo.earliestEvent < NEW_CRIMINAL_LAW_FROM;

  const narrativeQuery = issueRetrievalTerms.length
    ? `${text} ${issueRetrievalTerms.join(" ")}`
    : text;
  const categoryQuery = [
    text,
    resolved.map((r) => r.record?.label).join(" "),
    detectedIssues.map((i) => i.label).join(" "),
  ].join(" ");
  const provisionTopicContext = [
    input.title,
    text,
    ...detectedIssues.flatMap((issue) => [
      issue.label,
      ...(issue.searchTerms || []),
      ...(issue.matchedTerms || []),
    ]),
  ].join(" ");
  const judgmentTopicContext = [
    input.title,
    text,
    ...detectedIssues.map((issue) => issue.label),
  ].join(" ");

  const [provRes, categoryProvRes] = await Promise.all([
    retrieval.retrieve({
      collection: "provisions",
      query: narrativeQuery,
      topK: 12,
      boostIds: issueBoostIds,
      minScore: 0.03,
      homeJurisdiction: input.location || "",
    }),
    retrieval.retrieve({
      collection: "provisions",
      query: categoryQuery,
      topK: 10,
      boostIds: [...defaultProvisionIds],
      filterCategories: retrievalCategoryIds,
      minScore: 0.02,
      homeJurisdiction: input.location || "",
    }),
  ]);

  let provisions = [];
  let retrievalNote = null;
  const retrievalMode =
    provRes.ok || categoryProvRes.ok
      ? provRes.mode || categoryProvRes.mode || "sparse"
      : "unavailable";
  if (provRes.ok || categoryProvRes.ok) {
    const narrativeProvisions = (provRes.ok ? provRes.results || [] : []).filter((rec) => {
      if (detectedIssues.length) {
        const cats = categoriesOf(rec);
        if (cats.length && !cats.some((c) => retrievalCategoryIds.includes(c))) return false;
      }
      return isTopicallyRelevant(rec, provisionTopicContext);
    });
    const categoryProvisions = (categoryProvRes.ok ? categoryProvRes.results || [] : []).filter(
      (rec) => isTopicallyRelevant(rec, provisionTopicContext),
    );
    provisions = mergeRetrieved([
      { results: narrativeProvisions, source: "narrative" },
      { results: categoryProvisions, source: "selected-or-detected-category" },
    ]);

    const acts = kb.acts();
    provisions = provisions.map((p) => {
      const act = acts[p.act] || {};
      const cats = categoriesOf(p);
      return {
        ...p,
        actShortTitle: act.shortTitle,
        actNumber: act.actNo,
        actKind: act.kind,
        repealedAct: act.repealed,
        inForceFrom: act.inForceFrom,
        sourceUrl: act.sourceUrl,
        sourceLabel: act.sourceLabel,
        fromIssueCategory: (() => {
          const cid = cats.find(
            (c) => supportedCategoryIds.includes(c) && kb.category_by_id(c),
          );
          return cid ? kb.category_by_id(cid)?.label || null : null;
        })(),
        relevance: relevanceBand(p.score),
        applicabilityWarning:
          beforeNewCriminalLaw && ["BNS", "BNSS"].includes(p.act)
            ? `This is a current section. The earliest date in the account is before 1 July 2024, so the repealed law may govern the conduct. The corpus does not contain that repealed text.`
            : undefined,
      };
    });
  } else {
    retrievalNote =
      "The retrieval engine did not respond, so no provisions could be matched automatically. The action plan below is still available because it is read directly from the corpus.";
  }

  // Prepend provisions the playbook treats as core for an issue that the
  // narrative supports. A mismatched selected category does not get to force its
  // own core sections into an unrelated case.
  const core = [];
  for (const pid of defaultProvisionIds) {
    if (provisions.some((p) => p.id === pid)) continue;
    const rec = kb.provision_by_id(pid);
    if (!rec) continue;
    if (!categoriesOf(rec).some((c) => retrievalCategoryIds.includes(c))) continue;
    if (!isTopicallyRelevant(rec, provisionTopicContext)) continue;
    core.push(rec);
  }
  if (core.length) {
    const acts = kb.acts();
    provisions = [
      ...core.map((rec) => {
        const act = acts[rec.act] || {};
        return {
          ...rec,
          score: null,
          matchedTerms: [],
          retrievalSources: ["core-for-supported-issue"],
          actShortTitle: act.shortTitle,
          actNumber: act.actNo,
          actKind: act.kind,
          repealedAct: act.repealed,
          inForceFrom: act.inForceFrom,
          sourceUrl: act.sourceUrl,
          sourceLabel: act.sourceLabel,
          fromIssueCategory:
            rec.category && supportedCategoryIds.includes(rec.category)
              ? kb.category_by_id(rec.category)?.label || null
              : null,
          relevance: "core-for-this-issue",
        };
      }),
      ...provisions,
    ];
  }

  // --- Precedents ----------------------------------------------------------
  const [judgRes, categoryJudgRes] = await Promise.all([
    retrieval.retrieve({
      collection: "judgments",
      query: narrativeQuery,
      topK: 6,
      minScore: 0.03,
      homeJurisdiction: input.location || "",
    }),
    retrieval.retrieve({
      collection: "judgments",
      query: categoryQuery,
      topK: 5,
      filterCategories: retrievalCategoryIds,
      minScore: 0.03,
      homeJurisdiction: input.location || "",
    }),
  ]);

  let judgments = [];
  let judgmentNote = null;
  if (judgRes.ok || categoryJudgRes.ok) {
    const narrativeJudgments = (judgRes.ok ? judgRes.results || [] : []).filter((rec) => {
      if (detectedIssues.length) {
        const cats = categoriesOf(rec);
        if (cats.length && !cats.some((c) => retrievalCategoryIds.includes(c))) return false;
      }
      return isTopicallyRelevant(rec, judgmentTopicContext, "judgment");
    });
    const categoryJudgments = (categoryJudgRes.ok ? categoryJudgRes.results || [] : []).filter(
      (rec) => isTopicallyRelevant(rec, judgmentTopicContext, "judgment"),
    );
    judgments = mergeRetrieved([
      { results: narrativeJudgments, source: "narrative" },
      { results: categoryJudgments, source: "selected-or-detected-category" },
    ]).map((j) => ({
      ...j,
      relevance: relevanceBand(j.score),
      verifyUrl: `https://indiankanoon.org/search/?formInput=${encodeURIComponent(j.citation)}`,
    }));
  } else {
    judgmentNote =
      "The retrieval engine did not respond for judicial decisions, so no precedent could be matched.";
  }

  // --- Cross-statute graph -------------------------------------------------
  // The abstract asks for an indexed graph across penal, civil and special law.
  // We ask the engine for the subgraph around the sections actually matched, so
  // the user sees what connects to what in this case rather than the whole graph.
  let graph = { nodes: [], edges: [], stats: { nodes: 0, edges: 0, statuteCount: 0, statutes: [], crossStatuteEdges: 0 }, note: "The graph engine did not respond, so cross-statute links are not shown." };
  const graphIds = provisions.map((p) => p.id).slice(0, 12);
  if (graphIds.length) {
    const gRes = await retrieval.graph({ provisionIds: graphIds });
    if (gRes.ok && Array.isArray(gRes.nodes)) {
      const matched = new Set(graphIds);
      graph = {
        ...gRes,
        nodes: (gRes.nodes || []).map((n) => ({ ...n, matched: matched.has(n.id) })),
        stats: gRes.stats || {},
        note:
          "Every link below is derived from the knowledge base and shows the reason it exists. " +
          "Sections that matched your account are marked.",
      };
    }
  }

  // --- Forms ---------------------------------------------------------------
  // A pro se person needs to know what paper to file, not just which section
  // applies, so the actual applications are surfaced alongside the plan.
  const actionPlanSelection = actionPlanKeyFor(detectedIssues, researchCategories, primaryId);
  // A weak or moderate lexical match is not a legal issue. A larger corpus
  // makes almost any narrative share a word with some section, so a plan is
  // shown only when the narrative raised an issue or a provision matched
  // strongly. Otherwise the vague-input case would acquire a plan it never
  // justified.
  const canShowActionPlan =
    detectedIssues.length > 0 || provisions.some((p) => p.relevance === "strong");
  const selectedPlanCategory = kb.category_by_id(actionPlanSelection.key);
  let actionPlanNote = null;
  if (!canShowActionPlan) {
    actionPlanNote =
      "No fact-specific action steps are shown because the narrative did not support a candidate issue or a relevant provision. Your selected category is kept as context, but it is not enough to choose a safe plan. Add what was done, by whom, and when.";
  } else if (actionPlanSelection.kind !== "issue" && detectedIssues.length) {
    actionPlanNote = `The corpus has no issue-specific action template for ${detectedIssues
      .map((issue) => issue.label)
      .join(", ")}. The steps shown come from the closest supported category${
      selectedPlanCategory ? ` (${selectedPlanCategory.label})` : ""
    } and should be checked against your facts.`;
  }
  const formCategoryId = selectedPlanCategory
    ? actionPlanSelection.key
    : researchCategories[0]?.id || primaryId;
  const forms = kb.forms_for_category(formCategoryId);
  const crossForms = researchCategories
    .filter((r) => r.id !== formCategoryId)
    .flatMap((r) => kb.forms_for_category(r.id).map((f) => ({ ...f, forIssue: r.record.label })));

  // --- Hidden facts --------------------------------------------------------
  const hiddenFacts = extract.extractHiddenFacts(text, {
    categories: resolved.map((r) => r.id),
    dates: dates.map((d) => d.iso),
  });

  // --- Action plan ---------------------------------------------------------
  const primaryTemplate = canShowActionPlan ? kb.action_template(actionPlanSelection.key) || [] : [];
  const actionPlan = primaryTemplate.map((step) => {
    const provRefs = (step.authorityRefs || [])
      .map((id) => kb.provision_by_id(id))
      .filter(Boolean)
      .map((rec) => {
        const act = kb.acts()[rec.act] || {};
        return {
          id: rec.id,
          label: `${act.shortTitle || rec.act}, s. ${rec.section}`,
          heading: rec.heading,
          sourceUrl: act.sourceUrl,
        };
      });
    const channelRefs = (step.authorityRefs || [])
      .map((id) => kb.referral_channels().find((c) => c.id === id))
      .filter(Boolean);
    return {
      ...step,
      provisionRefs: provRefs,
      channelRefs: channelRefs,
      deadlineKind: step.deadline ? (/\b(statute|statutory)\b/i.test(step.deadline) ? "from-source" : "advisory") : null,
    };
  });

  // Cross-statute steps: if a second issue type was detected, its first step is
  // worth surfacing, but only if it does not duplicate what is already shown.
  const crossStatute = [];
  for (const r of resolved.slice(1)) {
    const steps = kb.action_template(r.id) || [];
    const first = steps.find((s) => !crossStatute.some((c) => c.title === s.title));
    if (first) crossStatute.push({ ...first, forIssue: r.record.label });
  }

  // --- Summary and uncertainty --------------------------------------------
  const summary = extract.buildCaseSummary(input.title, primary, facts.facts, timeline, {
    languageLabel: language.label,
    location: input.location,
    startDate: input.startDate,
  });

  const emergency = /immediate|right now|in danger|abuse|violence|risk|hurt me|hit me|threaten/i.test(text) &&
    /now|danger|afraid|scared|fear|hurt|violence|threat/i.test(text);

  const followUps = resolved.flatMap((r) =>
    (kb.follow_ups()[r.id] || []).map((q) => ({ question: q, forIssue: r.record.label })),
  );
  const seenQuestions = new Set(followUps.map((f) => f.question));
  for (const issue of detectedIssues) {
    if (!issue.clarifyingQuestion || seenQuestions.has(issue.clarifyingQuestion)) continue;
    seenQuestions.add(issue.clarifyingQuestion);
    followUps.push({
      question: issue.clarifyingQuestion,
      forIssue: `${issue.label} (tentative)`,
    });
  }

  const selectedMismatch =
    detectedIssues.length &&
    !detectedIssues.some((i) => (i.categoryIds || []).includes(primaryId))
      ? `The category you selected (${primary.label}) does not directly match the candidate issues found in your narrative (${detectedIssues
          .map((i) => i.label)
          .join(", ")}). Your selection has been kept; retrieval also uses the narrative itself.`
      : null;

  const retrievalCoverage = buildRetrievalCoverage({
    provisions,
    judgments,
    detectedIssues,
    retrievalNote,
    judgmentNote,
    applicabilityInfo,
    selectedMismatch,
    contextWarning: titleCaveat,
  });
  const retrievalWarning = retrievalCoverage.warning || null;
  const issueDetectionConfidence = detectedIssues.length
    ? {
        value: Math.max(...detectedIssues.map((i) => i.confidence)),
        method:
          "Heuristic cue matching over the narrative. The score is not calibrated and is not a legal determination.",
        calibrated: false,
      }
    : null;

  const gaps = [];
  if (!timeline.events.length) {
    gaps.push("No date could be read from the narrative. Dates decide the order of events and can decide which statute applies.");
  } else if (timeline.uncertainCount) {
    gaps.push(`${timeline.uncertainCount} timeline entr${timeline.uncertainCount === 1 ? "y is" : "ies are"} based on a bare year or an ambiguous numeric date. Check them before you rely on the order of events.`);
  }
  if (!input.location) {
    gaps.push("No place was given. Jurisdiction and which court you approach depend on it.");
  }
  if (facts.wordCount < 120) {
    gaps.push("The narrative is short. Sections turn on specific details such as what was said or done, and who was present.");
  }
  if (!judgments.length) {
    gaps.push("No decision in our small corpus matched this narrative. We do not substitute an unrelated case.");
  }
  if (!provisions.length) {
    gaps.push("No provision in the bundled corpus could be matched to this narrative.");
  }
  for (const issue of detectedIssues) {
    if (issue.corpusSupport?.note) gaps.push(issue.corpusSupport.note);
  }
  if (selectedMismatch) gaps.push(selectedMismatch);
  if (titleCaveat) gaps.push(titleCaveat);
  if (applicabilityInfo.corpusCoverageGap) gaps.push(applicabilityInfo.corpusCoverageGap);

  // --- Optional live model pass -------------------------------------------
  // The deterministic result above is already complete. The model may only
  // enrich it. If the model is disabled, misconfigured, slow or wrong, the
  // deterministic result is returned untouched and `llm.mode` says so.
  // Declared here, before the optional model pass, so the model can append to
  // `gaps` without referencing a binding that does not exist yet.
  const uncertainty = {
    gaps,
    reliability: buildReliability({
      facts, timeline, provisions, judgments, evidence, retrievalNote, language,
    }),
    engine: retrievalEngineLabel(retrievalMode),
  };

  let ai = { ok: false, mode: "deterministic", reason: "not_attempted" };
  if (llm.isEnabled()) {
    ai = await llm.analyseCase({
      narrative: text,
      languageCode: language.code,
      languageLabel: language.label,
      categoryLabel: primary.label,
      provisions: provisions.slice(0, 12).map((p) => ({
        id: p.id,
        section: p.section,
        heading: p.heading,
        summary: p.summary,
        actShortTitle: p.actShortTitle,
        sourceUrl: p.sourceUrl,
      })),
      judgments: judgments.map((j) => ({
        id: j.id,
        title: j.title,
        citation: j.citation,
        court: j.court,
        year: j.year,
        holding: j.holding,
        verifyUrl: j.verifyUrl,
      })),
      evidence: evidence.slice(0, 12),
    });

    // Merge the explanations back onto the deterministic records. Only the
    // "why" text is taken from the model; identity and text stay from corpus.
    if (ai.ok) {
      for (const ex of ai.provisionExplanations || []) {
        const target = provisions.find((p) => p.id === ex.id);
        if (target && ex.why) target.aiWhy = ex.why;
      }
      for (const ex of ai.judgmentExplanations || []) {
        const target = judgments.find((j) => j.id === ex.id);
        if (target && ex.why) target.aiWhy = ex.why;
      }
      if (ai.uncertainty) {
        uncertainty.aiUncertainty = ai.uncertainty;
      }
      if ((ai.missingInformation || []).length) {
        uncertainty.gaps.push(...ai.missingInformation);
      }
      if (ai.caseSummary) {
        summary.aiSummary = ai.caseSummary;
        summary.language = language;
      }
    }
  }

  return {
    input: { ...input, narrativeLength: text.length },
    language,
    summary: { ...summary, language },
    classification: resolved.map((r) => ({
      id: r.id,
      label: r.record.label,
      labelHi: r.record.labelHi,
      score: r.score,
      reason: r.reason,
      matchedSignals: r.matchedSignals,
      forum: r.record.forum,
      emergency: r.record.emergency,
      defaultProvisionIds: r.record.defaultProvisionIds,
    })),
    detectedIssues,
    issueDetectionConfidence,
    retrievalTerms: issueRetrievalTerms,
    retrievalMode,
    retrievalCoverage,
    retrievalWarning,
    facts: facts.facts,
    hiddenFacts,
    stats: { sentences: facts.sentenceCount, words: facts.wordCount },
    timeline,
    datesFound: dates,
    evidence,
    provisions,
    judgments,
    graph,
    forms,
    crossForms,
    actionPlan,
    actionPlanNote,
    actionPlanSourceId: canShowActionPlan ? actionPlanSelection.key : null,
    crossStatute,
    followUps,
    applicability: applicabilityInfo,
    referrals: referralsFor(researchCategories, emergency),
    uncertainty,
    retrievalNote,
    disclaimer: kb.disclaimer(),
    generatedAt: new Date().toISOString(),
    llm: {
      // mode is the single source of truth for the UI badge.
      mode: ai.ok ? "ai" : "deterministic",
      ok: ai.ok,
      provider: ai.provider || llm.describe().provider,
      model: ai.ok ? ai.model : null,
      reason: ai.ok ? null : ai.reason,
      message: ai.ok ? null : ai.message,
      // Why the model was not used, in enough detail to act on: a spent
      // daily quota and a per-minute limit need different responses.
      providerMessage: ai.ok ? null : ai.providerMessage || null,
      scope: ai.ok ? null : ai.scope || null,
      retryAfterSeconds: ai.ok ? null : ai.retryAfterSeconds ?? null,
      quotaExhausted: ai.ok ? false : Boolean(ai.quotaExhausted),
      modelsTried: ai.ok ? ai.modelsTried || null : ai.modelsTried || null,
      durationMs: ai.durationMs ?? null,
      notices: ai.ok ? ai.notices : [],
      result: ai.ok
        ? {
            caseSummary: ai.caseSummary,
            keyIssues: ai.keyIssues,
            missingInformation: ai.missingInformation,
            evidenceToGather: ai.evidenceToGather,
            actionSuggestions: ai.actionSuggestions,
            uncertainty: ai.uncertainty,
            provisionExplanations: ai.provisionExplanations,
            judgmentExplanations: ai.judgmentExplanations,
          }
        : null,
    },
  };
}

/**
 * A deliberately conservative self-assessment. High confidence requires
 * everything; anything missing caps the score.
 */
function buildReliability({ facts, timeline, provisions, judgments, evidence, retrievalNote, language }) {
  const factors = [];
  let score = 0.4;

  const strongProvs = provisions.filter((p) => p.relevance === "strong" || p.relevance === "core-for-this-issue").length;
  if (strongProvs >= 4) { score += 0.18; factors.push("Several provisions match the issue type directly."); }
  else if (strongProvs >= 2) { score += 0.1; factors.push("Some provisions match directly."); }
  else { score -= 0.1; factors.push("Few provisions matched directly; the matches below are weak."); }

  if (timeline.events.length >= 3) { score += 0.14; factors.push("The narrative contains several dated events."); }
  else if (timeline.events.length >= 1) { score += 0.06; factors.push("At least one date could be read from the narrative."); }
  else { score -= 0.12; factors.push("No date could be read from the narrative."); }

  if (facts.wordCount >= 180) { score += 0.12; factors.push("The narrative is detailed enough to draw facts from."); }
  else { score -= 0.05; factors.push("The narrative is short, so the fact extraction has little to work with."); }

  if (judgments.length) { score += 0.08; factors.push("Decisions in the corpus matched the fact pattern."); }
  else { factors.push("No decision in the corpus matched; no precedent is shown rather than a weak one."); }

  if (evidence.length) { score += 0.06; factors.push("An evidence checklist can be produced for this issue type."); }

  if (language.confidence < 0.7) {
    score -= 0.04;
    factors.push("The language could not be identified with confidence, so some keywords may not have matched.");
  }

  if (retrievalNote) {
    score -= 0.2;
    factors.push("The retrieval engine did not respond, so part of this output is missing.");
  }

  score = Math.max(0.05, Math.min(0.95, score));
  const band = score >= 0.7 ? "good" : score >= 0.45 ? "partial" : "thin";

  return {
    score: Math.round(score * 100) / 100,
    band,
    label:
      band === "good"
        ? "Reasonable coverage"
        : band === "partial"
          ? "Partial coverage"
          : "Thin coverage",
    explanation:
      band === "good"
        ? "Enough of your account could be matched to the corpus to be useful. It is still a preliminary map, not a conclusion."
        : band === "partial"
          ? "Some of your account could be matched and some could not. Treat the gaps listed below as part of the result."
          : "Very little of your account could be matched to the corpus. Add dates and specific detail, and consider speaking to a lawyer or a legal aid volunteer.",
    factors,
  };
}

export { CATEGORY_ALIASES };