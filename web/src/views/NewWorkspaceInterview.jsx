import { useState, useRef, useEffect } from "react";
import { api } from "../api.js";
import { Markdown } from "../Markdown.jsx";
import { Icon, Loading } from "../ui.jsx";
import { Footer } from "./Landing.jsx";

export const ALL_LEGAL_CATEGORIES = [
  {
    id: "auto-detect",
    name: "🤖 Auto-Detect (AI classifies from facts & documents)",
    group: "Intelligent Classification",
    act: "Multi-domain Indian Statutory Analysis",
    description: "Unsure of the category? Describe your dispute or upload documents; our AI will analyze applicable statutes and categorize automatically.",
  },
  {
    id: "domestic-violence",
    name: "Domestic Violence & Matrimonial Cruelty",
    group: "Family & Matrimonial",
    act: "Protection of Women from Domestic Violence Act, 2005 / BNS 85, 86 (IPC 498A)",
    description: "Physical, emotional, verbal or economic abuse, dowry harassment, lockout from shared household, and maintenance.",
  },
  {
    id: "matrimonial-family",
    name: "Matrimonial, Divorce & Child Custody",
    group: "Family & Matrimonial",
    act: "Hindu Marriage Act, 1955 / Special Marriage Act / BNSS 144 (CrPC 125)",
    description: "Divorce, judicial separation, permanent alimony, interim maintenance, child custody, and restitution of conjugal rights.",
  },
  {
    id: "cheque-bounce",
    name: "Cheque Dishonour / Section 138 NI Act",
    group: "Financial & Commercial",
    act: "Negotiable Instruments Act, 1881 (Sec. 138 - 148)",
    description: "Dishonour of cheques due to insufficient funds, stop payment instructions, statutory 15-day demand notices, and criminal complaints.",
  },
  {
    id: "tenancy-eviction",
    name: "Tenancy, Rent Dispute & Eviction",
    group: "Civil & Property",
    act: "State Rent Control Acts / Transfer of Property Act, 1882",
    description: "Illegal lockout, disconnection of essential amenities, arbitrary rent hikes, forfeiture of security deposit, and eviction defense.",
  },
  {
    id: "property-dispute",
    name: "Property Title, Land Encroachment & Partition",
    group: "Civil & Property",
    act: "Code of Civil Procedure, 1908 / Specific Relief Act, 1963",
    description: "Title disputes, boundary demarcation, illegal possession, joint family partition suits, and temporary/permanent injunctions.",
  },
  {
    id: "consumer-dispute",
    name: "Consumer Protection & Service Deficiency",
    group: "Consumer & Corporate",
    act: "Consumer Protection Act, 2019 / E-Commerce Rules",
    description: "Defective goods, unfair trade practices, warranty denial, airline cancellations, insurance claim repudiation, and deficiency of service.",
  },
  {
    id: "cyber-banking",
    name: "Cyber Crime, Banking Phishing & Fraud",
    group: "Cyber & Tech",
    act: "Information Technology Act, 2000 / RBI Zero-Liability Framework",
    description: "Unauthorized UPI/ATM debits, identity theft, phishing scams, SIM swap fraud, online extortion, and social media impersonation.",
  },
  {
    id: "employment-labor",
    name: "Employment Termination & Unpaid Wages",
    group: "Employment & Labor",
    act: "Industrial Disputes Act, 1947 / Payment of Wages Act / POSH Act, 2013",
    description: "Wrongful termination, unpaid salary/gratuity/PF, non-compete disputes, workplace sexual harassment (POSH), and severance denial.",
  },
  {
    id: "builder-rera",
    name: "Real Estate & Builder Delay (RERA)",
    group: "Real Estate & Housing",
    act: "Real Estate (Regulation and Development) Act, 2016 (Sec. 18)",
    description: "Delayed possession of flat/villa, unilateral layout changes, structural defects, interest on delayed possession, and refund claims.",
  },
  {
    id: "criminal-defense",
    name: "Criminal Defense, Bail & FIR Quashing",
    group: "Criminal Law",
    act: "Bharatiya Nyaya Sanhita, 2023 / BNSS (Sec. 480/482 Bail, Sec. 528 FIR Quash)",
    description: "Anticipatory bail, regular bail, quashing of false FIRs, police harassment, and defense against cognizable offences.",
  },
  {
    id: "commercial-debt",
    name: "Commercial Contracts & Debt Recovery",
    group: "Financial & Commercial",
    act: "Commercial Courts Act, 2015 / Indian Contract Act, 1872 / IBC / DRT",
    description: "Vendor payment defaults, breach of service contracts, summary suits under Order XXXVII CPC, and insolvency notices.",
  },
  {
    id: "motor-accident",
    name: "Motor Accident Claims (MACT)",
    group: "Torts & Insurance",
    act: "Motor Vehicles Act, 1988 (Sec. 166 / 163A)",
    description: "Compensation for road traffic accidents, third-party insurance liability, fatal accident claims, and permanent disability awards.",
  },
  {
    id: "ipr-trademark",
    name: "Intellectual Property & Trademark Infringement",
    group: "IP & Tech",
    act: "Trade Marks Act, 1999 / Copyright Act, 1957 / Patents Act",
    description: "Passing off, counterfeit goods, copyright piracy, domain squatting, cease-and-desist notices, and trademark injunctions.",
  },
  {
    id: "medical-negligence",
    name: "Medical Negligence & Hospital Liability",
    group: "Torts & Consumer",
    act: "Consumer Protection Act, 2019 / BNS Sec. 106",
    description: "Surgical errors, misdiagnosis, lack of informed consent, hospital negligence, and death due to medical dereliction.",
  },
  {
    id: "defamation",
    name: "Defamation (Civil & Criminal)",
    group: "Torts & Criminal",
    act: "Bharatiya Nyaya Sanhita, 2023 (Sec. 356) / Civil Law of Torts",
    description: "Reputational harm via print, television, digital publications, public slander, and malicious false statements.",
  },
  {
    id: "succession-inheritance",
    name: "Inheritance, Will Probate & Succession",
    group: "Civil & Property",
    act: "Indian Succession Act, 1925 / Hindu Succession Act, 1956",
    description: "Probate of wills, letters of administration, legal heir certificates, succession certificates, and ancestral property division.",
  },
  {
    id: "civil-other",
    name: "General Civil & Miscellaneous Dispute",
    group: "General Civil",
    act: "Code of Civil Procedure, 1908",
    description: "Injunctions, declaration suits, recovery of movable property, nuisance, and other non-criminal civil proceedings.",
  },
];

const PRESET_ARCHETYPES = [
  {
    id: "dv",
    title: "Matrimonial Exclusion & Harassment",
    category: "domestic-violence",
    jurisdiction: "Delhi",
    prompt:
      "I was married in November 2022 and resided at my marital home in Greater Kailash, Delhi. On 20 June 2024, my husband and in-laws physically locked me out of the premises, retained my stridhan jewelry, and sent threatening WhatsApp messages. I am currently living with my parents.",
  },
  {
    id: "ni138",
    title: "Cheque Dishonour of ₹15,00,000",
    category: "cheque-bounce",
    jurisdiction: "Mumbai",
    prompt:
      "I advanced a friendly business loan of ₹15,00,000 via RTGS in January 2024. The borrower issued a cheque on 10 August 2024 drawn on HDFC Bank, which was returned dishonoured on 14 August with memo 'Funds Insufficient'. I sent a statutory demand notice on 28 August 2024.",
  },
  {
    id: "tenancy",
    title: "Arbitrary Eviction & Deposit Forfeiture",
    category: "tenancy-eviction",
    jurisdiction: "Bengaluru",
    prompt:
      "I have been a tenant in an apartment in Indiranagar, Bengaluru under an 11-month lease since October 2023. The landlord disconnected water and electricity supply on 5 September 2024 and refuses to refund my ₹2,50,000 security deposit unless I vacate within 48 hours without legal notice.",
  },
  {
    id: "cyber",
    title: "Unauthorized Bank Phishing Debit",
    category: "cyber-banking",
    jurisdiction: "Hyderabad",
    prompt:
      "On 12 July 2024, ₹3,40,000 was fraudulently debited in three transactions from my salary account without my sharing any OTP or clicking malicious links. I lodged a complaint on National Cyber Crime portal (1930) within 3 hours and informed the bank within 24 hours.",
  },
  {
    id: "rera",
    title: "Builder 3-Year Possession Delay",
    category: "builder-rera",
    jurisdiction: "Gurugram",
    prompt:
      "I booked a 3BHK flat in Sector 65 Gurugram in 2019 with committed possession date of March 2022. I have paid 90% of the total ₹1.1 Crore cost. The builder has stopped construction, demands additional escalation charges, and refuses to pay statutory monthly interest under RERA Section 18.",
  },
];

export default function NewWorkspaceInterview({
  onCreateWorkspace,
  onCancel,
  go,
  meta,
  health,
  onToast,
}) {
  const [category, setCategory] = useState("auto-detect");
  const [caseTitle, setCaseTitle] = useState("");
  const [jurisdiction, setJurisdiction] = useState("Delhi");
  const [input, setInput] = useState("");

  // Document state
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [isExtractingDoc, setIsExtractingDoc] = useState(false);
  const [docSummary, setDocSummary] = useState("");

  // Interactive interrogation conversation
  const [messages, setMessages] = useState([
    {
      id: "m0",
      sender: "advocate",
      name: "Senior Advocate Deshmukh",
      time: "Initial Intake",
      text:
        "Welcome to NyayaPath Legal Enclave. I am Senior Advocate Deshmukh.\n\nTo properly register and prepare your case workspace, I need to interrogate the factual foundation of your dispute. Please describe what happened in your own words, and upload any notices, agreements, bank statements, or WhatsApp evidence.\n\nI will analyze applicable Indian statutes (including BNS/BNSS criminal transitions), identify missing legal proofs, ask clarifying questions, and configure your case workspace.",
    },
  ]);

  const [extractedFacts, setExtractedFacts] = useState([]);
  const [timelineEvents, setTimelineEvents] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [readinessScore, setReadinessScore] = useState(20);
  const [detectedCategoryName, setDetectedCategoryName] = useState("");

  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isAnalyzing]);

  function handleSelectPreset(preset) {
    setCaseTitle(preset.title);
    setCategory(preset.category);
    setJurisdiction(preset.jurisdiction);
    setInput(preset.prompt);
  }

  // Handle document upload & text extraction
  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsExtractingDoc(true);
    onToast?.(`Reading document "${file.name}"...`);

    try {
      let extractedText = "";

      if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
        try {
          const res = await api.extractPdf(file);
          if (res?.text) {
            extractedText = res.text;
          }
        } catch (pdfErr) {
          // Fallback or read as text
          extractedText = `[PDF Document: ${file.name}, size: ${(file.size / 1024).toFixed(1)} KB]`;
        }
      } else {
        // Text / Markdown / Plain text
        extractedText = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (ev) => resolve(ev.target.result || "");
          reader.onerror = () => resolve("");
          reader.readAsText(file);
        });
      }

      const fileRecord = {
        name: file.name,
        size: `${(file.size / 1024).toFixed(1)} KB`,
        text: extractedText,
        uploadedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setUploadedFiles((prev) => [...prev, fileRecord]);
      setDocSummary(`Attached: ${file.name} (${fileRecord.size})`);
      onToast?.(`Document "${file.name}" attached successfully`);

      // Automatically append key document context into the interview
      const previewSnippet = extractedText.slice(0, 400).trim();
      const docNoticeMsg = {
        id: "doc_" + Date.now(),
        sender: "client",
        name: "Litigant Deponent",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        text: `[Attached Supporting Document: ${file.name}]\nDocument excerpt: "${previewSnippet}${extractedText.length > 400 ? "..." : ""}"`,
      };

      setMessages((prev) => [...prev, docNoticeMsg]);

      // Trigger automatic lawyer review of the document
      triggerLawyerReview(
        `Litigant uploaded document: ${file.name}. Content: ${extractedText.slice(0, 1500)}`
      );
    } catch (err) {
      onToast?.(`Could not process document: ${err.message}`);
    } finally {
      setIsExtractingDoc(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // Trigger Lawyer Review & Classification via Advanced Python Legal RAG Agent
  async function triggerLawyerReview(textToReview, explicitMessages = null) {
    setIsAnalyzing(true);

    const msgsToSend = (explicitMessages || messages).map((m) => ({
      sender: m.sender === "advocate" ? "assistant" : "client",
      text: m.text,
    }));

    try {
      const res = await api.intakeChat({
        messages: msgsToSend,
        newText: textToReview,
        category: category !== "auto-detect" ? category : null,
        jurisdiction: jurisdiction || "India",
      });

      if (res && res.ok) {
        // Auto-assign detected category if currently auto-detect
        if (res.category) {
          const matched = ALL_LEGAL_CATEGORIES.find((c) => c.id === res.category);
          if (matched) {
            setCategory(res.category);
            setDetectedCategoryName(matched.name);
            if (!caseTitle) {
              setCaseTitle(`${matched.name} Matter`);
            }
          }
        }

        // Sync extracted facts
        if (Array.isArray(res.extractedFacts) && res.extractedFacts.length > 0) {
          setExtractedFacts((prev) => {
            const set = new Set([...prev, ...res.extractedFacts]);
            return Array.from(set).slice(0, 10);
          });
        }

        // Sync extracted timeline events
        if (Array.isArray(res.timelineDates) && res.timelineDates.length > 0) {
          setTimelineEvents((prev) => Array.from(new Set([...prev, ...res.timelineDates])));
        }

        // Sync readiness score
        if (typeof res.readinessScore === "number") {
          setReadinessScore(res.readinessScore);
        }

        const replyMsg = {
          id: "a_" + Date.now(),
          sender: "advocate",
          name: "Senior Advocate Deshmukh",
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          text: res.reply,
        };

        setMessages((prev) => [...prev, replyMsg]);
      } else {
        throw new Error(res?.error || "Agent response failed");
      }
    } catch (err) {
      console.warn("Legal RAG agent error:", err);
      // Clean fallback if API times out or is unreachable
      const fallbackMsg = {
        id: "a_" + Date.now(),
        sender: "advocate",
        name: "Senior Advocate Deshmukh",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        text: `I have recorded your statement: "${textToReview}".\n\nUnder Indian procedure, we must examine your documentary receipts and verify the opposing party details.\n\nKey Evidentiary Questions for Trial Readiness:\n1. Who is the exact party or registered shop name against whom you seek recovery?\n2. What was the exact payment date and amount on your receipt?\n3. Have you sent a formal legal demand notice?`,
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setIsAnalyzing(false);
    }
  }

  // Handle user sending follow-up text in interview
  async function handleSend(customText) {
    const textToSend = (customText || input).trim();
    if (!textToSend || isAnalyzing) return;

    const userMsg = {
      id: "u_" + Date.now(),
      sender: "client",
      name: "Litigant Deponent",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      text: textToSend,
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    await triggerLawyerReview(textToSend, nextMessages);
  }

  // Finalize workspace creation
  async function handleCreateWorkspaceConfirmed() {
    const finalTitle = caseTitle.trim() || "New Legal Matter Workspace";
    const finalCat =
      category === "auto-detect"
        ? detectedCategoryName
          ? detectedCategoryName.toLowerCase().includes("cheque")
            ? "cheque-bounce"
            : detectedCategoryName.toLowerCase().includes("domestic")
            ? "domestic-violence"
            : detectedCategoryName.toLowerCase().includes("tenancy")
            ? "tenancy-eviction"
            : detectedCategoryName.toLowerCase().includes("cyber")
            ? "consumer-dispute"
            : detectedCategoryName.toLowerCase().includes("rera")
            ? "consumer-dispute"
            : "civil-other"
          : "civil-other"
        : category;

    setIsSubmitting(true);

    try {
      // 1. Create workspace in DB
      const res = await api.createCase({
        title: finalTitle,
        category: finalCat,
        jurisdiction: jurisdiction,
        narrative: extractedFacts.join(". "),
      });

      if (res?.case) {
        // 2. Persist recorded consultation messages to this workspace
        try {
          for (const msg of messages.slice(1)) {
            await api.sendMessage(res.case.id, {
              content: msg.text,
              sender: msg.sender === "client" ? "user" : "assistant",
            });
          }
        } catch {
          // Non-blocking
        }

        onToast?.(`Workspace "${finalTitle}" initialized successfully`);
        await onCreateWorkspace(res.case.id);
      }
    } catch (err) {
      onToast?.(`Error creating workspace: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  const selectedCatObj = ALL_LEGAL_CATEGORIES.find((c) => c.id === category) || ALL_LEGAL_CATEGORIES[0];

  return (
    <>
      <main style={{ paddingTop: 0, background: "var(--white)", minHeight: "92vh" }}>
        {/* Page Top Header */}
        <div
          style={{
            borderBottom: "1px solid var(--border)",
            padding: "20px 24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
            background: "var(--white)",
          }}
        >
          <div>
            <span className="badge-note" style={{ marginBottom: 4, display: "block" }}>
              Case Registration Enclave
            </span>
            <h1
              style={{
                fontFamily: "var(--serif)",
                fontSize: "1.65rem",
                color: "var(--black)",
                margin: "0",
                fontWeight: 700,
              }}
            >
              Register Case Workspace
            </h1>
            <p
              style={{
                maxWidth: "68ch",
                color: "var(--gray-500)",
                margin: "5px 0 0",
                fontSize: "0.86rem",
                lineHeight: 1.55,
              }}
            >
              Select your legal dispute category (or choose Auto-Detect), describe the facts, and attach supporting
              documents. Senior Advocate AI will interrogate ambiguities and set up an isolated case workspace.
            </p>
          </div>

          <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>
            ← Back to Workspaces
          </button>
        </div>

        <div className="shell" style={{ padding: "24px 24px" }}>
          {/* Dispute Quick Starters */}
          <div
            style={{
              padding: "12px 16px",
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              background: "var(--gray-50)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
            }}
          >
            <span
              style={{
                fontSize: "0.7rem",
                fontFamily: "var(--mono)",
                color: "var(--text-faint)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Example Cases:
            </span>
            {PRESET_ARCHETYPES.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelectPreset(p)}
                style={{
                  padding: "4px 10px",
                  border: `1px solid ${category === p.category ? "var(--black)" : "var(--border)"}`,
                  borderRadius: "var(--radius)",
                  background: category === p.category ? "var(--black)" : "var(--white)",
                  color: category === p.category ? "var(--white)" : "var(--text-soft)",
                  fontSize: "0.72rem",
                  fontFamily: "var(--mono)",
                  cursor: "pointer",
                  transition: "all 0.15s",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                {p.title}
              </button>
            ))}
          </div>

          {/* 2-Column Layout: Left Chat + Document Upload | Right Configuration Sidebar */}
          <div style={{ display: "grid", gridTemplateColumns: "1.45fr 0.95fr", gap: 24, alignItems: "start" }}>
            {/* Left: Interactive Consultation & Document Zone */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                height: "680px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-lg)",
                overflow: "hidden",
                background: "var(--white)",
              }}
            >
              {/* Consultation Header */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderBottom: "1px solid var(--border)",
                  padding: "12px 18px",
                  background: "var(--gray-50)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: "50%",
                      background: "var(--black)",
                      color: "var(--white)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: "var(--mono)",
                      fontSize: "0.7rem",
                      fontWeight: 700,
                    }}
                  >
                    ⚖️
                  </div>
                  <div>
                    <div
                      style={{
                        fontFamily: "var(--serif)",
                        fontSize: "0.95rem",
                        fontWeight: 700,
                        color: "var(--black)",
                      }}
                    >
                      Senior Advocate Deshmukh
                    </div>
                    <div
                      style={{
                        fontSize: "0.68rem",
                        color: "var(--text-faint)",
                        fontFamily: "var(--mono)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      Statutory Intake & Case Preparation Counsel
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {detectedCategoryName ? (
                    <span
                      style={{
                        fontSize: "0.68rem",
                        fontFamily: "var(--mono)",
                        background: "var(--gray-100)",
                        padding: "3px 8px",
                        borderRadius: "var(--radius)",
                        color: "var(--black)",
                        fontWeight: 600,
                      }}
                    >
                      Detected: {detectedCategoryName}
                    </span>
                  ) : null}
                  <span
                    style={{
                      fontSize: "0.65rem",
                      fontFamily: "var(--mono)",
                      color: "#16a34a",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: "#22c55e",
                        display: "inline-block",
                      }}
                    />
                    Active
                  </span>
                </div>
              </div>

              {/* Chat Messages */}
              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "16px 18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                }}
              >
                {messages.map((m) => {
                  const isAdvocate = m.sender === "advocate";
                  return (
                    <div
                      key={m.id}
                      style={{
                        alignSelf: isAdvocate ? "flex-start" : "flex-end",
                        maxWidth: "88%",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "0.64rem",
                          fontFamily: "var(--mono)",
                          color: "var(--text-faint)",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          marginBottom: 4,
                          textAlign: isAdvocate ? "left" : "right",
                        }}
                      >
                        {m.name} · {m.time}
                      </div>
                      <div
                        style={{
                          background: isAdvocate ? "var(--gray-50)" : "var(--black)",
                          border: `1px solid ${isAdvocate ? "var(--border)" : "var(--black)"}`,
                          borderRadius: "var(--radius-lg)",
                          ...(isAdvocate ? { borderTopLeftRadius: 2 } : { borderTopRightRadius: 2 }),
                          padding: "12px 16px",
                          fontSize: "0.87rem",
                          color: isAdvocate ? "var(--text)" : "var(--white)",
                          lineHeight: 1.62,
                          ...(isAdvocate ? null : { whiteSpace: "pre-line" }),
                        }}
                      >
                        {isAdvocate ? <Markdown>{m.text}</Markdown> : m.text}
                      </div>
                    </div>
                  );
                })}

                {isAnalyzing ? (
                  <div
                    style={{
                      alignSelf: "flex-start",
                      padding: "10px 14px",
                      background: "var(--gray-50)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius)",
                      borderTopLeftRadius: 2,
                    }}
                  >
                    <Loading label="Interrogating statutory provisions and facts..." />
                  </div>
                ) : null}

                <div ref={chatEndRef} />
              </div>

              {/* Supporting Document Bar */}
              <div
                style={{
                  borderTop: "1px solid var(--border)",
                  padding: "8px 14px",
                  background: "var(--gray-50)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: "0.68rem",
                      color: "var(--text-faint)",
                      textTransform: "uppercase",
                    }}
                  >
                    📎 Supporting Documents:
                  </span>
                  {uploadedFiles.length > 0 ? (
                    uploadedFiles.map((f, i) => (
                      <span
                        key={i}
                        style={{
                          fontSize: "0.7rem",
                          fontFamily: "var(--mono)",
                          background: "var(--white)",
                          border: "1px solid var(--border)",
                          padding: "2px 8px",
                          borderRadius: "var(--radius)",
                          color: "var(--black)",
                        }}
                      >
                        {f.name} ({f.size})
                      </span>
                    ))
                  ) : (
                    <span style={{ fontSize: "0.72rem", color: "var(--text-faint)", fontStyle: "italic" }}>
                      Upload notice, lease, loan agreement, or bank statement
                    </span>
                  )}
                </div>

                <div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    style={{ display: "none" }}
                    accept=".pdf,.txt,.doc,.docx"
                  />
                  <button
                    type="button"
                    className="btn btn--outline btn--sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isExtractingDoc}
                  >
                    {isExtractingDoc ? "Extracting..." : "+ Upload Document"}
                  </button>
                </div>
              </div>

              {/* Input Bar */}
              <div
                style={{
                  borderTop: "1px solid var(--border)",
                  padding: "12px 14px",
                  background: "var(--white)",
                }}
              >
                <div style={{ display: "flex", gap: 8 }}>
                  <textarea
                    rows={2}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Describe what happened: dates, notices served, monetary amounts, opposing party actions..."
                    style={{
                      flex: 1,
                      padding: "9px 12px",
                      border: "1px solid var(--border-strong)",
                      borderRadius: "var(--radius)",
                      color: "var(--text)",
                      fontSize: "0.87rem",
                      resize: "none",
                      fontFamily: "var(--sans)",
                      background: "var(--white)",
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    disabled={!input.trim() || isAnalyzing}
                    onClick={() => handleSend()}
                    style={{ minWidth: "90px", justifyContent: "center", alignSelf: "flex-end" }}
                  >
                    Analyze →
                  </button>
                </div>
              </div>
            </div>

            {/* Right: Case Configuration Sidebar */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-lg)",
                  overflow: "hidden",
                  background: "var(--white)",
                }}
              >
                <div
                  style={{
                    padding: "12px 16px",
                    borderBottom: "1px solid var(--border)",
                    background: "var(--gray-50)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span className="badge-note">Workspace Dossier Configuration</span>
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: "0.68rem",
                      color: readinessScore >= 60 ? "#16a34a" : "var(--text-soft)",
                      fontWeight: 700,
                    }}
                  >
                    {readinessScore}% Ready
                  </span>
                </div>

                <div style={{ padding: "16px" }}>
                  {/* Title */}
                  <div style={{ marginBottom: 14 }}>
                    <label
                      style={{
                        fontSize: "0.74rem",
                        color: "var(--text-faint)",
                        fontFamily: "var(--mono)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        marginBottom: 4,
                      }}
                    >
                      Workspace Matter Title
                    </label>
                    <input
                      type="text"
                      value={caseTitle}
                      onChange={(e) => setCaseTitle(e.target.value)}
                      placeholder="e.g. Sharma Domestic Violence Dispute"
                    />
                  </div>

                  {/* Category Selection */}
                  <div style={{ marginBottom: 14 }}>
                    <label
                      style={{
                        fontSize: "0.74rem",
                        color: "var(--text-faint)",
                        fontFamily: "var(--mono)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        marginBottom: 4,
                      }}
                    >
                      Legal Dispute Domain (or Auto-Detect)
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      style={{ fontSize: "0.82rem", background: "var(--white)" }}
                    >
                      {ALL_LEGAL_CATEGORIES.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>

                    <div
                      style={{
                        marginTop: 6,
                        fontSize: "0.72rem",
                        color: "var(--text-soft)",
                        lineHeight: 1.45,
                        background: "var(--gray-50)",
                        padding: "6px 10px",
                        borderRadius: "var(--radius)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <b>Governing Law:</b> {selectedCatObj.act}
                    </div>
                  </div>

                  {/* Jurisdiction */}
                  <div style={{ marginBottom: 14 }}>
                    <label
                      style={{
                        fontSize: "0.74rem",
                        color: "var(--text-faint)",
                        fontFamily: "var(--mono)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        marginBottom: 4,
                      }}
                    >
                      Jurisdiction / City Forum
                    </label>
                    <input
                      type="text"
                      value={jurisdiction}
                      onChange={(e) => setJurisdiction(e.target.value)}
                      placeholder="e.g. Delhi, Mumbai, Bengaluru"
                    />
                  </div>

                  {/* Case Readiness Meter */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <span
                        style={{
                          fontSize: "0.68rem",
                          fontFamily: "var(--mono)",
                          color: "var(--text-faint)",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                        }}
                      >
                        Interrogation Sufficiency
                      </span>
                      <span
                        style={{
                          fontSize: "0.68rem",
                          fontFamily: "var(--mono)",
                          color: readinessScore >= 60 ? "#16a34a" : "var(--text-soft)",
                          fontWeight: 700,
                        }}
                      >
                        {readinessScore >= 70 ? "Pleadings Ready" : readinessScore >= 45 ? "Sufficient Facts" : "Preliminary Intake"}
                      </span>
                    </div>
                    <div
                      style={{
                        height: 5,
                        background: "var(--gray-100)",
                        borderRadius: 3,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${readinessScore}%`,
                          background: readinessScore >= 60 ? "#16a34a" : "var(--black)",
                          transition: "width 0.4s ease",
                        }}
                      />
                    </div>
                  </div>

                  {/* Extracted Facts */}
                  <div style={{ marginBottom: 16 }}>
                    <div
                      style={{
                        fontSize: "0.68rem",
                        fontFamily: "var(--mono)",
                        color: "var(--text-faint)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        marginBottom: 6,
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span>Verified Statements ({extractedFacts.length})</span>
                      <span>{timelineEvents.length} dates recorded</span>
                    </div>
                    <div
                      style={{
                        maxHeight: "120px",
                        overflowY: "auto",
                        background: "var(--gray-50)",
                        borderRadius: "var(--radius)",
                        padding: "8px 12px",
                        border: "1px solid var(--border)",
                        fontSize: "0.76rem",
                      }}
                    >
                      {extractedFacts.length ? (
                        <ul
                          style={{
                            margin: 0,
                            paddingLeft: 16,
                            color: "var(--text)",
                            lineHeight: 1.55,
                          }}
                        >
                          {extractedFacts.map((f, i) => (
                            <li key={i}>{f}</li>
                          ))}
                        </ul>
                      ) : (
                        <span style={{ color: "var(--text-faint)", fontStyle: "italic" }}>
                          Facts and statutory dates will extract here as you converse...
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Initialize Button */}
                  <button
                    type="button"
                    className="btn btn--primary"
                    style={{ width: "100%", justifyContent: "center" }}
                    disabled={isSubmitting || !caseTitle.trim()}
                    onClick={handleCreateWorkspaceConfirmed}
                  >
                    {isSubmitting ? "Initializing Enclave..." : "Initialize Case Workspace →"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer meta={meta} health={health} />
    </>
  );
}
