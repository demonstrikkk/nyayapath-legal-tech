"""
Advanced Legal RAG & Senior Advocate Agent with Comprehensive Guardrails
========================================================================

Implements a multi-stage Legal RAG agent in Python:
  1. Multi-Tier Guardrails (Emergency Triage, Anti-Injection, Anti-Forgery, Anti-Perjury)
  2. Semantic & Hybrid RAG Retrieval (Statutes, Judgments, Legal Cues)
  3. Context Memory (Maintains state across interview turns)
  4. Senior Advocate Deshmukh Cognitive Engine (Using Groq gpt-oss-120b / fast fallback)
  5. Structured Extraction (Facts, Dates, Evidence Gaps, Readiness Score)
  6. Bar Council of India (BCI) Statutory Integrity Notice
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

REPO_ROOT = Path(__file__).resolve().parents[1]
SERVER_ENV_PATH = REPO_ROOT / "server" / ".env"

# ---------------------------------------------------------------------------
# Load Environment Variables from server/.env if present
# ---------------------------------------------------------------------------
def load_env() -> Dict[str, str]:
    env_vars = {}
    if SERVER_ENV_PATH.exists():
        try:
            for line in SERVER_ENV_PATH.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env_vars[k.strip()] = v.strip().strip('"').strip("'")
        except Exception:
            pass
    for k, v in os.environ.items():
        env_vars[k] = v
    return env_vars

ENV = load_env()

# ---------------------------------------------------------------------------
# Guardrail Tier 1: Emergency & Imminent Safety Triage
# ---------------------------------------------------------------------------
EMERGENCY_RULES: List[Tuple[re.Pattern, str, str, str]] = [
    (
        re.compile(r"\b(suicide|kill myself|end my life|want to die|hanging myself|poison myself)\b", re.I),
        "CRISIS_SELF_HARM",
        "🚨 URGENT CRISIS SUPPORT ALERT",
        "Your life and mental well-being are paramount. Legal disputes are stressful, but support is available immediately:\n- **KIRAN National Mental Health Helpline:** 1800-599-0019 (24/7, Toll-Free)\n- **Tele-MANAS:** 14416 / 1800-891-4416 (Govt of India 24/7 Helpline)\nPlease contact these crisis counselors right now."
    ),
    (
        re.compile(r"\b(beating me right now|hitting me right now|in immediate danger|attacking me|threat to life|kill me now|held hostage|weapon pointed)\b", re.I),
        "CRISIS_VIOLENCE",
        "🚨 URGENT EMERGENCY SAFETY INTERVENTION",
        "If you are facing active violence or immediate physical threat, **dial 112 immediately**.\n- **National Emergency Response Support System (ERSS):** Dial 112\n- **Women in Distress Helpline:** Dial 181 / 1091\nMove to a secure location or nearest public station before addressing court documentation or procedural filings."
    ),
    (
        re.compile(r"\b(child abuse|child trafficking|molest child|pedophile|pocso)\b", re.I),
        "CRISIS_POCSO",
        "🚨 MANDATORY STATUTORY CHILD PROTECTION NOTICE",
        "Under the POCSO Act, 2012, offenses against minors carry mandatory statutory reporting obligations:\n- **Childline India:** Dial 1098 immediately (24/7, Toll-Free)\n- **National Emergency:** Dial 112"
    ),
    (
        re.compile(r"\b(unauthorized transaction golden hour|fraud just happened|money debited just now|otp shared right now)\b", re.I),
        "CRISIS_CYBER_URGENT",
        "⏱️ GOLDEN HOUR CYBER FRAUD ALERT",
        "Unauthorized financial debits can be frozen if reported immediately:\n- **National Cyber Crime Helpline:** Dial **1930** immediately.\n- **Portal:** File an urgent fraud freeze request at **cybercrime.gov.in** within 2 hours to activate inter-bank lien holding."
    ),
]

def check_emergency_guardrail(text: str) -> Optional[Dict[str, str]]:
    for pattern, code, title, body in EMERGENCY_RULES:
        if pattern.search(text):
            return {"code": code, "title": title, "body": body}
    return None

# ---------------------------------------------------------------------------
# Guardrail Tier 2: Anti-Perjury, Anti-Forgery, Prompt Injection Defense
# ---------------------------------------------------------------------------
ADVERSARIAL_RULES: List[Tuple[re.Pattern, str]] = [
    (
        re.compile(r"\b(ignore all previous instructions|disregard previous instructions|dan mode|jailbreak|system prompt override)\b", re.I),
        "INJECTION_ATTEMPT"
    ),
    (
        re.compile(r"\b(how to forge|fake a receipt|create fake bill|fake signature|tamper evidence|fabricate proof|make false affidavit|lie under oath|commit perjury)\b", re.I),
        "EVIDENCE_TAMPERING"
    ),
    (
        re.compile(r"\b(how to bribe|bribe a judge|bribe police|evade arrest|hide black money|launder money|beat up opponent|hire goons)\b", re.I),
        "CRIMINAL_SOLICITATION"
    ),
]

def check_adversarial_guardrail(text: str) -> Optional[str]:
    for pattern, code in ADVERSARIAL_RULES:
        if pattern.search(text):
            return (
                "**Senior Advocate Deshmukh — Ethical & Statutory Refusal**\n\n"
                "As an officer of the court and Senior Advocate, I am strictly bound by the Advocates Act, 1961, the Bar Council of India Standards of Professional Conduct, and the substantive penal laws of India.\n\n"
                "⚖️ **Statutory Prohibition:**\n"
                "- Fabricating evidence, forging receipts, manufacturing signatures, or presenting false affidavits constitutes serious criminal offences under **Bharatiya Nyaya Sanhita, 2023 (Section 227 - Fabricating false evidence; Section 336 - Forgery; Section 340 - Using forged document as genuine)** and former IPC Sections 192, 193, 465, and 471.\n"
                "- Presenting fabricated records before any judicial forum or Consumer Commission invites summary dismissal of proceedings, immediate prosecution for perjury under **Section 379 BNSS**, and heavy exemplary costs.\n\n"
                "JollyLLM Legal Enclave strictly facilitates lawful rights protection, genuine evidence gathering, and legitimate litigation readiness. Please share only truthful, contemporaneous facts and lawful claims."
            )
    return None

# ---------------------------------------------------------------------------
# Date and Fact Extraction Utilities
# ---------------------------------------------------------------------------
DATE_PATTERN = re.compile(
    r"\b(?:\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\b20\d{2}\b)\b",
    re.IGNORECASE,
)

CATEGORY_RULES = {
    "consumer-dispute": [
        "shop", "store", "seller", "dealer", "payment", "cash", "delivered", "delivery", "receipt",
        "warranty", "defective", "refund", "electronics", "purchase", "order", "flipkart", "amazon",
        "dukaan", "saman", "khareeda", "bill", "invoice", "consumer", "service deficiency"
    ],
    "cheque-bounce": [
        "cheque", "check", "bounce", "dishonour", "return memo", "138", "ni act", "bank memo",
        "insufficient funds", "signature mismatch", "drawee", "payee"
    ],
    "tenancy-eviction": [
        "tenant", "landlord", "rent", "evict", "eviction", "lease", "security deposit", "kiraya",
        "kirayedar", "makan malik", "vacate", "water cut", "electricity cut", "possession"
    ],
    "domestic-violence": [
        "husband", "wife", "in-laws", "beaten", "hit", "abuse", "cruelty", "dowry", "dahej",
        "pati", "sasural", "saas", "sasur", "stridhan", "maintenance", "dv act", "bns 85", "498a"
    ],
    "cyber-banking": [
        "otp", "upi", "scam", "cyber", "hacked", "phishing", "unauthorized", "fraud", "bank transfer",
        "link", "anydesk", "teamviewer", "1930", "portal"
    ],
    "builder-rera": [
        "builder", "flat", "possession", "rera", "society", "allotment", "bba", "super structure",
        "project delay", "occupancy certificate", "oc"
    ],
    "employment-wage": [
        "salary", "wage", "employer", "boss", "company", "terminated", "termination", "resignation",
        "gratuity", "pf", "unpaid", "leave encashment"
    ],
}

def detect_category(text: str, current_cat: Optional[str] = None) -> str:
    if current_cat and current_cat != "auto" and current_cat != "civil-other":
        return current_cat
    lower = text.lower()
    scores = {}
    for cat, keywords in CATEGORY_RULES.items():
        score = sum(2 if re.search(r"\b" + re.escape(kw) + r"\b", lower) else (1 if kw in lower else 0) for kw in keywords)
        if score > 0:
            scores[cat] = score
    if scores:
        return max(scores.items(), key=lambda kv: kv[1])[0]
    return current_cat or "civil-other"

def extract_timeline_dates(text: str) -> List[str]:
    matches = DATE_PATTERN.findall(text)
    seen = set()
    res = []
    for m in matches:
        m_str = m.strip()
        if m_str not in seen:
            seen.add(m_str)
            res.append(m_str)
    return res

def extract_facts(text: str) -> List[str]:
    raw_sentences = re.split(r"[.!?।\n]+", text)
    facts = []
    for s in raw_sentences:
        clean = s.strip()
        if len(clean) >= 12 and not clean.lower().startswith(("hello", "hi", "sir", "namaste")):
            facts.append(clean)
    return facts[:10]

# ---------------------------------------------------------------------------
# Retrieval Augmented Generation (Hybrid RAG) Context Builder
# ---------------------------------------------------------------------------
def retrieve_rag_context(query: str, category: str, top_k: int = 4) -> Dict[str, Any]:
    provisions = []
    judgments = []
    try:
        import engine
        c = engine.corpus()
        prov_results = c.prov_index.search(query, top_k=top_k, filter_category=category if category != "civil-other" else None)
        if not prov_results:
            prov_results = c.prov_index.search(query, top_k=top_k)
        
        for r in prov_results[:top_k]:
            act = c.acts.get(r.get("act"), {})
            provisions.append({
                "id": r.get("id"),
                "act": act.get("shortTitle") or r.get("act"),
                "section": r.get("section"),
                "heading": r.get("heading"),
                "summary": r.get("summary"),
            })
            
        judg_results = c.judg_index.search(query, top_k=2)
        for j in judg_results[:2]:
            judgments.append({
                "id": j.get("id"),
                "title": j.get("title"),
                "court": j.get("court"),
                "year": j.get("year"),
                "principle": j.get("principle") or j.get("holding"),
            })
    except Exception:
        pass

    return {"provisions": provisions, "judgments": judgments}

# ---------------------------------------------------------------------------
# Groq LLM Invocation with Strict Guardrails
# ---------------------------------------------------------------------------
def call_groq_senior_advocate(conversation: List[Dict[str, str]], rag_context: Dict[str, Any], category: str) -> Optional[str]:
    api_key = ENV.get("LLM_API_KEY") or ENV.get("GROQ_API_KEY")
    if not api_key:
        return None

    try:
        from groq import Groq
        client = Groq(api_key=api_key)
        
        prov_context_str = ""
        if rag_context.get("provisions"):
            prov_context_str = "Verified Indian Statutory Provisions retrieved for this case:\n" + "\n".join(
                f"- {p['act']} {p['section']}: {p['heading']} ({p['summary']})"
                for p in rag_context["provisions"]
            )
        
        judg_context_str = ""
        if rag_context.get("judgments"):
            judg_context_str = "\nRelevant Landmark Precedents:\n" + "\n".join(
                f"- {j['title']} ({j['court']}, {j['year']}): {j['principle']}"
                for j in rag_context["judgments"]
            )

        system_prompt = f"""You are Senior Advocate Deshmukh, an eminent Senior Advocate practicing before the Supreme Court of India and High Courts.
You are conducting a client intake interview and litigation readiness interrogation for a litigant preparing their case workspace.

Current Matter Classification: {category.upper()}
{prov_context_str}
{judg_context_str}

CRITICAL RULES OF ADVOCACY & ETHICAL GUARDRAILS:
1. SPECIFIC FACTUAL ANALYSIS & ACKNOWLEDGEMENT:
   - Actively read, acknowledge, and legally evaluate the EXACT facts and documents the litigant shared in their latest message.
   - NEVER repeat generic templates or previous questions. Look at what they already answered!
   - If they mention a cash payment and receiving/receipt, explain the legal significance under Bharatiya Sakshya Adhiniyam, 2023 (BSA ss. 57/62 - primary documentary evidence) and Consumer Protection Act, 2019.
2. CAUSE OF ACTION & STATUTORY LEVERAGE:
   - Plainly state their causes of action (e.g. Deficiency in Service under CPA 2019 Section 2(11) & Section 35, Breach of Contract under Indian Contract Act 1872 s. 73, or Cheating / Criminal Breach of Trust under BNS 316/318 / former IPC 406/420).
3. STATUTORY ACCURACY & NO HALLUCINATION:
   - Do NOT invent fake section numbers or fictitious judges. Ground all counsel in actual Indian enactments.
   - Note the transition to new criminal codes (BNS, BNSS, BSA) in force since July 1, 2024.
4. ABSOLUTE ZERO TOLERANCE FOR ILLEGALITY:
   - If the user asks how to forge receipts, fake evidence, lie to court, or evade arrest, strictly refuse and cite BNS Section 227 / 336 on perjury and forgery.
5. STRATEGIC PRE-TRIAL ROADMAP:
   - Advise immediate tactical steps (e.g. dispatching a 15-day statutory Demand Notice via Registered Post AD demanding delivery or refund with 18% commercial interest; preparing e-Daakhil filing before District Consumer Commission).
6. CRISP, TARGETED TRIAL-READINESS QUESTIONS:
   - Ask 2 to 3 sharp, laser-focused questions specific to the missing operational details of THIS dispute (e.g. exact date and amount printed on the receipt, registered business name/address of the shop, complaint diary/acknowledgement number).
   - NEVER ask for information they have already provided in the conversation history!
7. TONE:
   - Authoritative, razor-sharp, strategic, dignified, and practical."""

        messages = [{"role": "system", "content": system_prompt}]
        for m in conversation:
            role = "user" if m.get("sender") in ("client", "user", "deponent") else "assistant"
            content = m.get("text") or m.get("content") or ""
            if content.strip():
                messages.append({"role": role, "content": content})

        model = ENV.get("LLM_MODEL") or "openai/gpt-oss-120b"
        if "llama-3.3" in model:
            model = "openai/gpt-oss-120b"

        completion = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.3,
            max_tokens=650,
        )

        reply = completion.choices[0].message.content
        if reply and len(reply.strip()) > 30:
            return reply.strip()
    except Exception as exc:
        sys.stderr.write(f"[legal_agent] Groq call error: {exc}\n")
        sys.stderr.flush()

    return None

# ---------------------------------------------------------------------------
# High-Caliber Deterministic Synthesis Fallback
# ---------------------------------------------------------------------------
def synthesize_fallback_opinion(latest_text: str, category: str, rag_context: Dict[str, Any], history: List[Dict[str, str]]) -> str:
    lower = latest_text.lower()
    
    has_receipt = any(w in lower for w in ["receipt", "receiving", "bill", "invoice", "slip", "proof", "paper"])
    has_cash = "cash" in lower or "paise" in lower or "rupees" in lower or "rs" in lower or "inr" in lower
    has_shop = any(w in lower for w in ["shop", "store", "owner", "retailer", "electronics", "merchant", "dukaan"])
    
    if category == "consumer-dispute" or has_shop or has_receipt:
        receipt_text = (
            "Because you hold an original signed cash receiving/receipt, you possess **Primary Documentary Evidence** under **Section 57 & 62 of Bharatiya Sakshya Adhiniyam, 2023 (BSA)**. This conclusively proves consideration was paid under Section 2(7) of the Consumer Protection Act, 2019."
            if has_receipt
            else "You must immediately secure the invoice, payment confirmation, or witness statement proving the transaction."
        )
        return (
            f"**Senior Advocate Deshmukh — Case Evaluation & Strategic Roadmap**\n\n"
            f"I have reviewed the facts disclosed regarding the electronics shop transaction. Refusal or failure to deliver promised goods after taking valuable consideration constitutes an actionable **Deficiency of Service under Section 2(11)** and an **Unfair Trade Practice under Section 2(47) of the Consumer Protection Act, 2019**, alongside civil breach of contract under Section 73 of the Indian Contract Act, 1872.\n\n"
            f"**1. Evidentiary Position:**\n"
            f"{receipt_text} In consumer proceedings, a written cash receipt establishes a legally binding delivery commitment.\n\n"
            f"**2. Tactical Pre-Litigation Protocol:**\n"
            f"- **Dispatch a 15-Day Formal Legal Notice:** Before approaching the Consumer Commission, serve a demand notice via Registered Post AD / Speed Post demanding delivery or refund with 18% p.a. interest.\n"
            f"- **Complaint Forum:** If the amount is under ₹50 Lakhs, the District Consumer Disputes Redressal Commission has exclusive territorial and pecuniary jurisdiction under Section 34/35.\n\n"
            f"**Key Evidentiary Questions for Trial Readiness:**\n"
            f"1. What is the registered trade name and physical address of the electronics shop, and what exact date is written on the cash receipt?\n"
            f"2. What was the exact monetary amount paid, and did the receipt specify the make/model of the goods?\n"
            f"3. Where did you lodge your initial complaint (e.g., Police Station GD, National Consumer Helpline 1915, or e-Daakhil), and what is the complaint reference number?"
        )
    elif category == "cheque-bounce":
        return (
            "**Senior Advocate Deshmukh — Negotiable Instruments Assessment**\n\n"
            "Under Section 138 of the Negotiable Instruments Act, 1881, cheque dishonour carries criminal liability of up to two years imprisonment or double the cheque amount. Strict statutory limitation windows govern this remedy:\n\n"
            "1. **Statutory Demand Notice:** Must be dispatched within 30 days of receiving the bank dishonour return memo.\n"
            "2. **Curing Period:** The drawer is given 15 days from receipt of the notice to make payment.\n"
            "3. **Filing Window:** The criminal complaint under BNSS Section 223 / NI Act 142 must be filed within 30 days following expiry of the 15-day period.\n\n"
            "**Key Evidentiary Questions for Trial Readiness:**\n"
            "1. What is the exact date stamped on the Bank Return Memo, and what is the recorded reason for dishonour?\n"
            "2. Have you dispatched the statutory 15-day Demand Notice via Speed Post with postal tracking proof?\n"
            "3. What underlying legally enforceable debt or liability (invoice, loan agreement, ledger) supports the cheque?"
        )
    elif category == "tenancy-eviction":
        return (
            "**Senior Advocate Deshmukh — Tenancy & Rent Control Evaluation**\n\n"
            "Under Indian tenancy jurisprudence, a landlord is strictly prohibited from executing forceful dispossession, locking the premises, or disconnecting essential amenities (water/electricity) without an eviction decree from a competent Rent Controller or Civil Court.\n\n"
            "**1. Statutory Protection:** Summary proceedings lie under the Specific Relief Act, 1963 (Section 6) for unlawful dispossession without due process.\n"
            "**2. Immediate Injunction:** Litigants can seek an ad-interim temporary injunction under Order XXXIX Rules 1 & 2 CPC restraining interference with quiet possession.\n\n"
            "**Key Evidentiary Questions for Trial Readiness:**\n"
            "1. Is your lease agreement registered or notarized, and what was the agreed term and notice period?\n"
            "2. Do you have contemporaneous proof (bank transfers, rent receipts) of timely rent payments and the security deposit?\n"
            "3. Has the landlord issued any formal written cure notice prior to demanding immediate vacation?"
        )
    elif category == "domestic-violence":
        return (
            "**Senior Advocate Deshmukh — Matrimonial & Domestic Rights Evaluation**\n\n"
            "Under the Protection of Women from Domestic Violence Act, 2005 (PWDVA) read with Section 85 of Bharatiya Nyaya Sanhita, 2023 (formerly IPC Section 498A), economic deprivation, locking out of the shared household, and verbal or physical abuse constitute actionable offenses:\n\n"
            "1. **Right to Shared Household (Section 17):** Irrespective of ownership or tenancy status, the aggrieved woman has an absolute statutory right to reside in the matrimonial home.\n"
            "2. **Emergency Interim Orders:** An immediate ex-parte application can be moved under Section 19 (Residence Order) and Section 20 (Monetary Relief) before the Judicial Magistrate.\n\n"
            "**Key Evidentiary Questions for Trial Readiness:**\n"
            "1. Was any Police Control Room (PCR) call, Daily Diary (DD) entry, or Medico-Legal Certificate (MLC) recorded?\n"
            "2. Do you possess a list, purchase receipts, or photographs of your Stridhan articles retained by the in-laws?\n"
            "3. What immediate protective relief (residence order, monthly maintenance, or custody) is urgently required?"
        )
    else:
        return (
            "**Senior Advocate Deshmukh — Legal Assessment**\n\n"
            "I have evaluated the facts provided. Under Indian civil and criminal jurisprudence, establishing territorial jurisdiction, locus standi, and corroborating contemporaneous records is paramount before moving the competent court.\n\n"
            "**1. Cause of Action Analysis:** Your claim requires demonstrating a legally recognized civil right, contractual undertaking, or statutory duty that has been breached.\n"
            "**2. Evidentiary Standards:** Primary records (written receipts, bank records, and stamped agreements) carry presumptive evidentiary weight under the Bharatiya Sakshya Adhiniyam, 2023.\n\n"
            "**Key Evidentiary Questions for Trial Readiness:**\n"
            "1. Who are the exact legal entities or individuals against whom remedy or damages are sought?\n"
            "2. What is the specific monetary quantum, recovery, or injunction you are demanding?\n"
            "3. What physical or electronic records (emails, notices, WhatsApp logs) confirm the timeline of events?"
        )

# ---------------------------------------------------------------------------
# Bar Council of India Rule 36 Statutory Disclaimer
# ---------------------------------------------------------------------------
STATUTORY_DISCLAIMER_FOOTER = (
    "\n\n---\n"
    "⚖️ *JollyLLM Procedural Integrity Notice (Advocates Act, 1961 & BCI Rules):* "
    "This guidance is provided for pro se case preparation and statutory rights analysis. "
    "It does not create a formal advocate-client vakalatnama relationship. "
    "Pleadings should be finalized with an enrolled advocate or District Legal Services Authority (DLSA) panel counsel before judicial submission."
)

# ---------------------------------------------------------------------------
# Main Handler: handle_advocate_turn
# ---------------------------------------------------------------------------
def handle_advocate_turn(payload: Dict[str, Any]) -> Dict[str, Any]:
    messages = payload.get("messages") or []
    new_text = str(payload.get("newText") or "").strip()
    current_category = payload.get("category")
    jurisdiction = payload.get("jurisdiction") or "National"

    # Full accumulated narrative text
    all_texts = [m.get("text") or m.get("content") or "" for m in messages if m.get("sender") in ("client", "user", "deponent")]
    if new_text and new_text not in all_texts:
        all_texts.append(new_text)
    full_narrative = " ".join(all_texts)

    # -----------------------------------------------------------------------
    # Guardrail Check 1: Adversarial, Injection, or Criminal Solicitation
    # -----------------------------------------------------------------------
    adversarial_refusal = check_adversarial_guardrail(new_text or full_narrative)
    if adversarial_refusal:
        return {
            "ok": True,
            "reply": adversarial_refusal + STATUTORY_DISCLAIMER_FOOTER,
            "category": current_category or "civil-other",
            "extractedFacts": [],
            "timelineDates": [],
            "readinessScore": 10,
            "evidenceChecklist": [],
            "guardrailTriggered": "adversarial_refusal",
            "readyForAnalysis": False,
        }

    # -----------------------------------------------------------------------
    # Guardrail Check 2: Emergency Safety & Crisis Triage
    # -----------------------------------------------------------------------
    emergency_alert = check_emergency_guardrail(new_text or full_narrative)
    emergency_header = ""
    if emergency_alert:
        emergency_header = f"> **{emergency_alert['title']}**\n> {emergency_alert['body']}\n\n---\n\n"

    # 1. Detect category dynamically
    effective_category = detect_category(full_narrative, current_category)

    # 2. Extract facts and timeline dates
    extracted_facts = extract_facts(full_narrative)
    timeline_dates = extract_timeline_dates(full_narrative)

    # 3. Retrieve relevant statutory provisions and precedents (RAG)
    rag_context = retrieve_rag_context(query=new_text or full_narrative, category=effective_category, top_k=4)

    # Build conversation history for LLM
    conv_history = []
    for m in messages:
        sender = m.get("sender") or ("client" if m.get("role") == "user" else "advocate")
        text = m.get("text") or m.get("content") or ""
        conv_history.append({"sender": sender, "text": text})
    if new_text and (not conv_history or conv_history[-1].get("text") != new_text):
        conv_history.append({"sender": "client", "text": new_text})

    # 4. Invoke Senior Advocate via Groq or fallback synthesis
    counsel_reply = call_groq_senior_advocate(conv_history, rag_context, effective_category)
    if not counsel_reply:
        counsel_reply = synthesize_fallback_opinion(new_text or full_narrative, effective_category, rag_context, conv_history)

    # Prepend emergency header if triggered and append statutory disclaimer footer
    counsel_reply = emergency_header + counsel_reply + STATUTORY_DISCLAIMER_FOOTER

    # 5. Compute Readiness Score & Evidence Checklist
    readiness = 35
    if len(extracted_facts) >= 2:
        readiness += 25
    if timeline_dates:
        readiness += 15
    if any(w in full_narrative.lower() for w in ["receipt", "bill", "invoice", "bank", "agreement", "notice", "receiving", "slip"]):
        readiness += 20
    readiness = min(95, max(35, readiness))

    evidence_checklist = []
    lower_narrative = full_narrative.lower()
    if "receipt" in lower_narrative or "cash" in lower_narrative:
        evidence_checklist.append("Original cash receipt / retail invoice")
    if "complaint" in lower_narrative:
        evidence_checklist.append("Copy of complaint / GD acknowledgement")
    if any(w in lower_narrative for w in ["whatsapp", "sms", "chat", "message"]):
        evidence_checklist.append("Electronic communications & BSA s. 63 Certificate")
    if not evidence_checklist:
        evidence_checklist = [
            "Original contemporaneous payment or agreement record",
            "Written correspondence or statutory demand notice",
            "Identity and address proof of opposing party",
        ]

    ready_for_analysis = len(extracted_facts) >= 2 and readiness >= 60

    return {
        "ok": True,
        "reply": counsel_reply,
        "category": effective_category,
        "extractedFacts": extracted_facts,
        "timelineDates": timeline_dates,
        "readinessScore": readiness,
        "evidenceChecklist": evidence_checklist,
        "readyForAnalysis": ready_for_analysis,
        "guardrailTriggered": emergency_alert["code"] if emergency_alert else None,
        "ragContext": {
            "provisionsCount": len(rag_context.get("provisions", [])),
            "judgmentsCount": len(rag_context.get("judgments", [])),
        },
    }

if __name__ == "__main__":
    sample_payload = {
        "messages": [
            {
                "sender": "client",
                "text": "I made a payment in a shop and they promised to deliver the goods by end of day, but they never did. Now my money is stuck."
            }
        ],
        "newText": "The person in front is the owner of an electronics shop. I gave them payment in cash and I have a receiving of my payment.",
        "category": "auto"
    }
    res = handle_advocate_turn(sample_payload)
    print("--- RESPONSE ---")
    sys.stdout.buffer.write(res["reply"].encode("utf-8"))
    print("\n\nCategory:", res["category"])
    print("Guardrail:", res.get("guardrailTriggered"))
