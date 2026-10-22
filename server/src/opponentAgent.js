/**
 * Courtroom Opponent Simulation Agent (Adversarial Legal Preparation)
 *
 * Simulates opposing counsel to rigorously pressure-test the user's case dossier.
 * Generates:
 *  1. Opposing Theory of the Case (alternative narratives, statutory exceptions, procedural objections)
 *  2. Evidence Attack (vulnerabilities, admissibility under BSA 2023, missing corroboration)
 *  3. Cross-Examination Simulator (grounded questions, targets, preparation advice)
 *  4. Adverse Authorities & Distinguishing Precedents
 *  5. Ranked Opponent Move Prediction (with plausibility & impact)
 *  6. Rebuttal & Counter-Strategy Blueprint
 *  7. Scenario Sensitivity Testing ("What If" contingencies)
 *
 * Strict Rule: Grounded purely in case dossier facts and verified law; no hallucinations.
 */

import * as kb from "./knowledge.js";
import { casesRepo, factsRepo, timelineRepo, opponentRepo, documentsRepo } from "./db.js";
import * as llm from "./llm.js";

// Deterministic fallback templates for adverse arguments per category
const CATEGORY_ADVERSE_DEFENSES = {
  "domestic-violence": [
    {
      defense: "Denial of Shared Household and Sole Ownership Challenge",
      legalBasis: "Protection of Women from Domestic Violence Act, 2005, s. 2(s) & s. 17",
      adversePrecedent: "S. R. Batra v. Taruna Batra (2007) 3 SCC 169",
      argument: "The opponent will argue that the petitioner has no proprietary right to reside in premises exclusively owned by in-laws, or that the parties ceased to reside together in a shared domestic relationship prior to the alleged grievance.",
      counterStrategy: "Establish that the premises constituted the matrimonial home and cite subsequent Supreme Court clarification (Satish Chander Ahuja v. Sneha Ahuja) showing the broader definition of shared household.",
    },
    {
      defense: "Fabrication of General and Vague Allegations Without Specificity",
      legalBasis: "Bharatiya Nagarik Suraksha Sanhita, 2023, s. 175 / s. 528",
      adversePrecedent: "Preeti Gupta v. State of Jharkhand (2010) 7 SCC 667",
      argument: "The defense will file an application seeking dismissal or quashing against distant relatives on the ground that allegations are omnibus, sweeping, and lack specific dates, roles, or overt acts.",
      counterStrategy: "Furnish a granular chronology specifying exact dates, times, overt acts of abuse, and independent medical or photographic corroboration for each named respondent.",
    },
  ],
  cyber: [
    {
      defense: "Voluntary Credential Disclosure and Gross Contributory Negligence",
      legalBasis: "Information Technology Act, 2000 & RBI Master Direction on Customer Protection",
      adversePrecedent: "State of Maharashtra v. Union of India / Electronic Evidence guidelines",
      argument: "The bank or counterparty will contend that the monetary loss occurred due to the petitioner voluntarily sharing the One-Time Password (OTP) or authorization PIN, exonerating the service provider from zero-liability protections.",
      counterStrategy: "Demonstrate immediate reporting within the golden hour (under 3 days for limited liability) and establish social engineering / deceit under BNS s. 318 (cheating).",
    },
    {
      defense: "Inadmissibility of Digital Screenshots under Bharatiya Sakshya Adhiniyam, 2023",
      legalBasis: "Bharatiya Sakshya Adhiniyam, 2023, s. 63 (Certificate for Electronic Records)",
      adversePrecedent: "Arjun Panditrao Khotkar v. Kailash Kushanrao Gorantyal (2020) 7 SCC 1",
      argument: "The opposing lawyer will object to printed screenshots or chat exports unless accompanied by a mandatory statutory certificate specifying the device hash, source, and custodian details.",
      counterStrategy: "Draft and attach a formal certificate under Section 63 of BSA 2023 affirming the authenticity and custody of the capturing smartphone/computer.",
    },
  ],
  consumer: [
    {
      defense: "Consumer Forum Jurisdiction Bar and Contractual Limitation Clause",
      legalBasis: "Consumer Protection Act, 2019, s. 69 (2-year statutory limitation)",
      adversePrecedent: "State Bank of India v. B.S. Agricultural Industries (2009) 5 SCC 121",
      argument: "The seller will assert that the complaint was lodged after the strict 2-year limitation period from the date of cause of action without an application for condonation of delay.",
      counterStrategy: "Show continuous correspondence acknowledging deficiency, or file a condonation of delay application demonstrating sufficient cause under s. 69(2).",
    },
  ],
  property: [
    {
      defense: "Absence of Registered Title Document and Remedy Barred by Specific Relief Act",
      legalBasis: "Transfer of Property Act, 1882, s. 54 & Specific Relief Act, 1963, s. 6",
      adversePrecedent: "Suraj Lamp & Industries v. State of Haryana (2012) 1 SCC 656",
      argument: "The defense will argue that the petitioner claims tenancy or title on unregistered receipts or oral understanding, which cannot sustain an injunction against a recorded owner.",
      counterStrategy: "Rely upon settled physical possession through utility receipts, bank records, and statutory protections against forcible dispossession without due process of law.",
    },
  ],
  financial: [
    {
      defense: "Dispute over Legally Enforceable Debt and Misuse of Security Cheque",
      legalBasis: "Negotiable Instruments Act, 1881, s. 138 & s. 139",
      adversePrecedent: "Rangappa v. Sri Mohan (2010) 11 SCC 441",
      argument: "The respondent will seek to rebut the statutory presumption by arguing that the cheque was handed over as an undated blank security cheque for an unconsummated transaction.",
      counterStrategy: "Produce underlying invoices, signed promissory notes, or bank account statements evidencing the existing crystallized liability.",
    },
  ],
};

export async function runOpponentSimulation(caseId, { customScenario = null } = {}) {
  const caseObj = casesRepo.get(caseId);
  if (!caseObj) throw new Error("Case not found");

  const category = caseObj.category || "civil-other";
  const activeFacts = factsRepo.list(caseId);
  const timeline = timelineRepo.list(caseId);
  const documents = documentsRepo.list(caseId);

  const factsText = activeFacts.map((f, i) => `${i + 1}. [${f.event_date || "Undated"}] ${f.statement}`).join("\n");
  const timelineText = timeline.map((t) => `- ${t.event_date || t.raw_date}: ${t.description}`).join("\n");
  const docText = documents.map((d) => `- Document: ${d.filename} (${d.mime_type}, ${d.page_count} pages)`).join("\n");

  const defaultAdverse = CATEGORY_ADVERSE_DEFENSES[category] || CATEGORY_ADVERSE_DEFENSES["domestic-violence"];

  let aiReport = null;

  // If System 2 LLM is enabled, generate comprehensive adversarial analysis
  if (llm.isEnabled()) {
    try {
      const prompt = `You are a senior, highly experienced Indian trial advocate acting as OPPOSING COUNSEL in a mock pre-trial assessment.
Your duty is to rigorously stress-test the petitioner's case, uncover evidentiary flaws, expose contradictions, and formulate the opposing side's defense strategy under Indian Law (including BNS 2023, BNSS 2023, BSA 2023, and relevant civil/special enactments).

CASE TITLE: ${caseObj.title}
CATEGORY: ${caseObj.category}
JURISDICTION: ${caseObj.jurisdiction || "India"}

ESTABLISHED FACTS:
${factsText || "None specified yet."}

TIMELINE CHRONOLOGY:
${timelineText || "No timeline entries."}

EVIDENCE DOCUMENTS HELD:
${docText || "No uploaded documents."}

${customScenario ? `HYPOTHETICAL WHAT-IF SCENARIO TO TEST:\n${customScenario}\n` : ""}

Conduct a rigorous adversarial examination and return ONLY valid JSON matching this exact structure:
{
  "opposingTheory": "Summary of the opposing side's narrative and legal theory",
  "vulnerableFacts": [
    {"fact": "...", "vulnerability": "...", "howOpponentWillExploit": "..."}
  ],
  "evidenceAttacks": [
    {"evidenceItem": "...", "defectOrChallenge": "...", "admissibilityIssue": "...", "requiredCorroboration": "..."}
  ],
  "crossExaminationQuestions": [
    {"target": "...", "question": "...", "whyItMatters": "...", "dangerLevel": "high|medium", "recommendedPreparation": "..."}
  ],
  "adversePrecedents": [
    {"citation": "...", "court": "...", "principle": "...", "distinguishingStrategy": "..."}
  ],
  "opponentMovePredictions": [
    {"rank": 1, "move": "...", "likelihood": "probable|possible|unlikely", "impact": "critical|moderate", "counterMeasure": "..."}
  ],
  "rebuttalStrategies": [
    {"opponentArgument": "...", "counterArgument": "...", "supportingLawOrProof": "...", "residualWeakness": "..."}
  ],
  "scenarioAnalysis": {
    "scenario": "${customScenario || "Default Baseline"}",
    "assessment": "...",
    "preparationPriority": "..."
  }
}`;

      const res = await llm.chatCompletionWithFallback({
        model: process.env.REASONING_LLM_MODEL || llm.configuredModel(),
        temperature: 0.2,
        maxTokens: 2000,
        messages: [{ role: "user", content: prompt }],
        jsonMode: true,
        timeoutMs: 25000,
      });

      if (res.ok && res.data && res.data.opposingTheory) {
        aiReport = res.data;
      }
    } catch {
      // Fallback cleanly to deterministic model
    }
  }

  // Construct deterministic report if LLM not available or timed out
  if (!aiReport) {
    aiReport = {
      opposingTheory:
        defaultAdverse[0]?.argument ||
        "The opposing party will present an alternative version denying unlawful intent, arguing material facts are exaggerated or fabricated, and claiming the dispute is civil rather than penal.",
      vulnerableFacts: activeFacts.slice(0, 3).map((f) => ({
        fact: f.statement,
        vulnerability: f.event_date ? "Subject to verification of date and sequence" : "Undated allegation, difficult to prove strictly",
        howOpponentWillExploit: "Will argue that lack of contemporaneous medical or police records indicates after-thought.",
      })),
      evidenceAttacks: [
        {
          evidenceItem: documents[0]?.filename || "Digital messages / photographs",
          defectOrChallenge: "Absence of Section 63 BSA 2023 Electronic Certificate",
          admissibilityIssue: "Uncertified electronic records are inadmissible under mandatory Indian Evidence / BSA rules.",
          requiredCorroboration: "Provide phone device extraction, affidavit, and carrier logs.",
        },
      ],
      crossExaminationQuestions: [
        {
          target: "Contemporaneous reporting",
          question: "Why did you not approach the local police station or Magistrate immediately on the alleged date of incident?",
          whyItMatters: "Opposing counsel will attempt to establish unexplained delay to infer fabrication.",
          dangerLevel: "high",
          recommendedPreparation: "Prepare evidence showing fear of reprisal, medical treatment, or mediation attempts explaining the timeline.",
        },
        {
          target: "Documentary proof",
          question: "Do you have any signed receipt or written record acknowledging this payment or agreement?",
          whyItMatters: "Oral assertions without paper trail can be dismissed as uncorroborated.",
          dangerLevel: "medium",
          recommendedPreparation: "Collect bank transaction statements, SMS logs, or witness statements.",
        },
      ],
      adversePrecedents: defaultAdverse.map((adv) => ({
        citation: adv.adversePrecedent,
        court: "Supreme Court of India",
        principle: adv.argument,
        distinguishingStrategy: adv.counterStrategy,
      })),
      opponentMovePredictions: [
        {
          rank: 1,
          move: "Filing an application challenging maintainability or jurisdiction",
          likelihood: "probable",
          impact: "moderate",
          counterMeasure: "Ensure jurisdiction grounds (residence, place of incident, or business) are explicitly pleaded.",
        },
        {
          rank: 2,
          move: "Denial of all oral claims and demanding strict proof under Bharatiya Sakshya Adhiniyam",
          likelihood: "probable",
          impact: "critical",
          counterMeasure: "File formal evidence affidavit with all exhibits duly indexed and certified.",
        },
      ],
      rebuttalStrategies: defaultAdverse.map((adv) => ({
        opponentArgument: adv.defense,
        counterArgument: adv.counterStrategy,
        supportingLawOrProof: adv.legalBasis,
        residualWeakness: "Requires contemporaneous documentary proof rather than bare testimony.",
      })),
      scenarioAnalysis: {
        scenario: customScenario || "What if key digital messages are deleted or inaccessible?",
        assessment: "Without digital records, reliance shifts to witness testimonies and corroborating bank or third-party proof.",
        preparationPriority: "Immediately preserve local backups, CDR records, and obtain bank verification statements.",
      },
    };
  }

  // Persist the simulation run into SQLite database
  const saved = opponentRepo.save(
    caseId,
    caseObj.case_version,
    aiReport.opposingTheory || "Adversarial Legal Simulation",
    aiReport,
  );

  return saved;
}
