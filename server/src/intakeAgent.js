/**
 * Conversational Legal Intake Engine (System 1 + Adaptive Interview)
 *
 * Implements:
 *  - Fast classification of case category & language
 *  - Adaptive category-specific questioning
 *  - Non-blocking handling of "skip", "I don't know", "N/A"
 *  - Contradiction & fact-correction detection
 *  - Fact extraction & timeline updating per turn
 *  - Assessment of sufficiency for preliminary legal analysis
 */

import * as kb from "./knowledge.js";
import * as retrieval from "./retrievalClient.js";
import { casesRepo, messagesRepo, factsRepo, timelineRepo, auditRepo } from "./db.js";
import { extractDates, extractFacts, buildTimeline, detectLanguage } from "./extract.js";
import * as llm from "./llm.js";

const SKIP_PATTERN = /^(skip|n\/?a|i don't know|not sure|dont know|no idea|pass|none|leave it|next|nahi pata|pata nahi|baad mein)\b/i;
const CORRECTION_PATTERN = /\b(actually|i made a mistake|correction|earlier i said|not that|instead of|change it to|galti se|asliyat mein|nahi balki)\b/i;

// ---------------------------------------------------------------------------
// 1. Classification & Language Detection
// ---------------------------------------------------------------------------

export async function classifyIntake(text) {
  const detectedLang = detectLanguage(text);
  const categories = kb.categories();

  // 1. Primary: Use the multilingual retrieval categoriser (supports Devanagari, unigrams, and Hinglish mapping)
  try {
    const res = await retrieval.categorise(text);
    if (res && res.ok && Array.isArray(res.categories) && res.categories.length > 0) {
      const top = res.categories[0];
      return {
        primaryCategory: top.id,
        categoryLabel: top.label,
        confidence: Math.min(0.95, 0.4 + (top.score || 1) * 0.15),
        language: detectedLang,
        candidates: res.categories.slice(0, 3),
        emergency: /emergency|immediate danger|threat to life|violence right now/i.test(text),
      };
    }
  } catch {
    // Continue to heuristic fallback
  }

  // 2. Fast heuristic signal matching
  const lower = text.toLowerCase();
  const scored = [];
  for (const cat of categories) {
    let score = 0;
    const matched = [];
    for (const kw of cat.keywords || []) {
      if (lower.includes(kw.toLowerCase())) {
        score += 1;
        matched.push(kw);
      }
    }
    if (cat.labelHi && text.includes(cat.labelHi)) {
      score += 3;
      matched.push(cat.labelHi);
    }
    if (score > 0) {
      scored.push({ id: cat.id, label: cat.label, score, matched });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  // If LLM is enabled and configured, we can use fast model for high-precision validation
  if (llm.isEnabled() && (!scored.length || scored[0].score <= 1)) {
    try {
      const completion = await llm.chatCompletionWithFallback({
        // The configured model, unless the operator pins a faster one for
        // this step. A hardcoded id here used to send the app to a different
        // model than the one it was configured with.
        model: process.env.FAST_LLM_MODEL || llm.configuredModel(),
        temperature: 0.1,
        maxTokens: 300,
        messages: [
          {
            role: "system",
            content: `You are an Indian legal intake classifier. Match this user statement to exactly one of these category IDs:
${categories.map((c) => `${c.id} (${c.label})`).join(", ")}.
If completely unclear or outside these, respond with 'not-sure'. Return ONLY valid JSON: {"category": "category-id", "confidence": 0.85, "reason": "brief reason"}`,
          },
          { role: "user", content: text },
        ],
        jsonMode: true,
      });

      if (completion.ok && completion.data?.category && kb.category_by_id(completion.data.category)) {
        return {
          primaryCategory: completion.data.category,
          categoryLabel: kb.category_by_id(completion.data.category).label,
          confidence: completion.data.confidence || 0.8,
          language: detectedLang,
          candidates: scored.slice(0, 3),
          emergency: /emergency|immediate danger|threat to life|violence right now/i.test(text),
        };
      }
    } catch {
      // Fallback silently to deterministic heuristic
    }
  }

  const primary = scored[0] || null;
  return {
    primaryCategory: primary ? primary.id : null,
    categoryLabel: primary ? primary.label : "Unclassified / General Legal Matter",
    confidence: primary ? Math.min(0.95, 0.4 + primary.score * 0.15) : 0.3,
    language: detectedLang,
    candidates: scored.slice(0, 3),
    emergency: /emergency|immediate danger|threat to life|violence right now/i.test(text),
  };
}

// ---------------------------------------------------------------------------
// 2. Fact & Correction Extractor from Turn
// ---------------------------------------------------------------------------

export function processUserTurn(caseId, messageText) {
  const isSkip = SKIP_PATTERN.test(messageText.trim());
  const isCorrection = CORRECTION_PATTERN.test(messageText);

  // Date and timeline extraction
  const dates = extractDates(messageText);
  if (dates.length) {
    const existing = timelineRepo.list(caseId);
    const updated = [...existing];
    for (const d of dates) {
      if (!updated.some((e) => e.event_date === d.iso)) {
        updated.push({
          iso: d.iso,
          text: d.text,
          description: messageText.slice(0, 160),
          confidence: d.needsReview ? 0.7 : 1.0,
          needsReview: d.needsReview,
        });
      }
    }
    timelineRepo.sync(caseId, updated);
  }

  // Handle corrections
  if (isCorrection) {
    const activeFacts = factsRepo.list(caseId);
    // Find fact that might be superseded
    if (activeFacts.length > 0) {
      const latestFact = activeFacts[activeFacts.length - 1];
      factsRepo.correctFact({
        caseId,
        factId: latestFact.id,
        correctedStatement: messageText,
        reason: "user_correction_turn",
      });
      return {
        type: "correction",
        message: "Understood. I have updated the case record with your correction.",
      };
    }
  }

  // If not a skip, record as a fact
  if (!isSkip && messageText.trim().length >= 10) {
    factsRepo.add({
      caseId,
      statement: messageText.trim(),
      sourceType: "user_statement",
      verificationStatus: "allegation",
    });
  }

  return { type: isSkip ? "skip" : "statement" };
}

// ---------------------------------------------------------------------------
// 3. Adaptive Question Selection
// ---------------------------------------------------------------------------

export async function getNextIntakeStep(caseId) {
  const caseObj = casesRepo.get(caseId);
  if (!caseObj) throw new Error("Case not found");

  const category = caseObj.category;
  const messages = messagesRepo.list(caseObj.conversationId);
  const activeFacts = factsRepo.list(caseId);
  const timeline = timelineRepo.list(caseId);

  // If no category set, prompt user to select or describe
  if (!category) {
    const categories = kb.categories();
    return {
      status: "needs_category",
      question:
        "Namaste. To help you prepare your legal case and understand your rights, could you tell me what kind of legal issue you are facing, or describe what happened in your own words?",
      categoryOptions: categories.map((c) => ({ id: c.id, label: c.label })),
      readyForAnalysis: false,
    };
  }

  const categoryObj = kb.category_by_id(category);
  const followUps = (kb.follow_ups && kb.follow_ups()[category]) || [];

  // Filter out questions that have already been asked or answered
  const priorAssistantQuestions = messages
    .filter((m) => m.sender === "assistant")
    .map((m) => m.content.toLowerCase());

  const remainingQuestions = followUps.filter((q) => {
    const qLower = q.toLowerCase();
    // Has this question already been asked?
    if (priorAssistantQuestions.some((pq) => pq.includes(qLower.slice(0, 30)))) {
      return false;
    }
    // Has the question already been answered in facts?
    const keyTerms = q.match(/\b[A-Za-z]{5,}\b/g) || [];
    const factText = activeFacts.map((f) => f.statement.toLowerCase()).join(" ");
    const matches = keyTerms.filter((term) => factText.includes(term.toLowerCase()));
    if (keyTerms.length > 0 && matches.length >= 2) {
      return false; // already sufficiently addressed
    }
    return true;
  });

  // Evaluate sufficiency:
  // We consider intake sufficient for preliminary analysis if:
  // - Category is known
  // - At least 2 active facts exist OR user answered at least 2 questions
  // - Or no remaining priority questions exist
  const userMessages = messages.filter((m) => m.sender === "user");
  const isSufficient = activeFacts.length >= 2 || userMessages.length >= 3 || remainingQuestions.length === 0;

  if (remainingQuestions.length > 0) {
    const nextQ = remainingQuestions[0];
    return {
      status: "in_progress",
      question: nextQ,
      stepNumber: followUps.length - remainingQuestions.length + 1,
      totalExpectedSteps: followUps.length,
      categoryLabel: categoryObj?.label,
      readyForAnalysis: isSufficient,
      hint: "You can answer, provide relevant dates/documents, or say 'skip' if you are not sure.",
    };
  }

  return {
    status: "intake_complete",
    question:
      "Thank you. We have gathered sufficient initial facts. You can proceed to generate your comprehensive legal strategy and pro se action plan, or share any additional details.",
    readyForAnalysis: true,
    categoryLabel: categoryObj?.label,
    summary: {
      factsCount: activeFacts.length,
      timelineEvents: timeline.length,
      category: categoryObj?.label,
    },
  };
}
