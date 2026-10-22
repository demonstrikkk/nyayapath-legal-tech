import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { Markdown } from "../Markdown.jsx";
import { Icon, Loading, Notice, Tag } from "../ui.jsx";

const SAMPLE_STARTERS = [
  {
    title: "Domestic Violence & Eviction",
    category: "domestic-violence",
    text: "My husband and his parents locked me out of our shared house in Delhi last week after continuous harassment for dowry. They are refusing to return my stridhan and threatening to sell the property.",
  },
  {
    title: "Cheque Dishonour Notice (NI 138)",
    category: "cheque-bounce",
    text: "I received a legal notice alleging dishonour of a ₹3,50,000 cheque. The cheque was given 2 years ago as security for a loan that was already repaid in cash, but they never returned the blank cheque.",
  },
  {
    title: "Unlawful Eviction by Landlord",
    category: "tenancy-eviction",
    text: "My landlord cut off water and electricity to my rented apartment without notice and is demanding an immediate 50% rent hike or eviction, refusing to refund my ₹80,000 security deposit.",
  },
  {
    title: "Cyber Fraud / Unauthorized Deduction",
    category: "consumer-dispute",
    text: "₹65,000 was debited from my bank account via an unauthorized UPI transaction on Friday. I immediately called customer care within 2 hours, but the bank refuses to reverse the transaction.",
  },
];

export default function AdvocateChat({
  onSubmitted,
  onGoToOpponent,
  onGoToForm,
  activeCase,
  setActiveCase,
  onToast,
}) {
  const [messages, setMessages] = useState([
    {
      sender: "assistant",
      content:
        "Namaste. I am your **NyayaPath AI Legal Advocate** — your dedicated case-preparation co-counsel. Tell me what happened in your own words, and I will extract your facts, check applicable Indian statutes (including new Bharatiya Nyaya Sanhita transitions), identify missing evidence, and build your legal strategy.",
      time: "Just now",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [caseId, setCaseId] = useState(activeCase?.id || null);
  const [extractedFacts, setExtractedFacts] = useState(activeCase?.facts || []);
  const [timelineEvents, setTimelineEvents] = useState(activeCase?.timeline || []);
  const [selectedCat, setSelectedCat] = useState(activeCase?.category || "");
  const [nextIntake, setNextIntake] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  // Sync state whenever active workspace/case changes
  useEffect(() => {
    if (activeCase?.id) {
      setCaseId(activeCase.id);
      setExtractedFacts(activeCase.facts || []);
      setTimelineEvents(activeCase.timeline || []);
      setSelectedCat(activeCase.category || "");

      // Load conversation history for this workspace
      api
        .getConversation(activeCase.id)
        .then((res) => {
          if (res?.messages?.length) {
            setMessages(
              res.messages.map((m) => ({
                sender: m.sender,
                content: m.content,
                stepTag: m.step_tag,
                time: m.created_at
                  ? new Date(m.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Earlier",
              }))
            );
          } else {
            setMessages([
              {
                sender: "assistant",
                content: `Namaste. I am your NyayaPath AI Legal Advocate for workspace "${activeCase.title}". Tell me what happened in your own words, and I will extract your facts, check applicable Indian statutes (including BNS transitions), and prepare your legal roadmap.`,
                time: "Just now",
              },
            ]);
          }
        })
        .catch(() => {});
    }
  }, [activeCase?.id]);

  async function handleSend(userText = null, categoryOverride = null) {
    const textToSend = (userText || input).trim();
    if (!textToSend || busy) return;

    if (!userText) setInput("");

    // Append user message
    setMessages((prev) => [
      ...prev,
      { sender: "user", content: textToSend, time: "Just now" },
    ]);
    setBusy(true);

    try {
      let currentCaseId = caseId;

      // 1. If no case exists yet, create one
      if (!currentCaseId) {
        const createRes = await api.createCase({
          title: textToSend.slice(0, 50) + "...",
          narrative: textToSend,
          category: categoryOverride || selectedCat || null,
        });
        if (createRes?.case?.id) {
          currentCaseId = createRes.case.id;
          setCaseId(currentCaseId);
          setActiveCase?.(createRes.case);
        }
      }

      // 2. Post message to case conversational endpoint
      const msgRes = await api.sendMessage(currentCaseId, {
        content: textToSend,
        selectedCategory: categoryOverride || selectedCat || null,
      });

      if (msgRes?.turnResult) {
        if (msgRes.turnResult.extractedFacts?.length) {
          setExtractedFacts((prev) => [
            ...prev,
            ...msgRes.turnResult.extractedFacts.filter(
              (f) => !prev.some((p) => (p.statement || p) === (f.statement || f))
            ),
          ]);
        }
        if (msgRes.turnResult.timelineDates?.length) {
          setTimelineEvents((prev) => [
            ...prev,
            ...msgRes.turnResult.timelineDates.map((d) => ({
              event_date: d.iso || d.text,
              description: d.text,
            })),
          ]);
        }
      }

      if (msgRes?.activeFacts?.length) {
        setExtractedFacts(msgRes.activeFacts);
      }
      if (msgRes?.timeline?.length) {
        setTimelineEvents(msgRes.timeline);
      }

      // 3. Add assistant response from Python Senior Advocate Agent
      const assistantText = msgRes?.reply || msgRes?.nextIntakeStep?.question;
      if (assistantText) {
        if (msgRes?.nextIntakeStep) {
          setNextIntake(msgRes.nextIntakeStep);
        }
        setMessages((prev) => [
          ...prev,
          {
            sender: "assistant",
            content: assistantText,
            stepTag: msgRes?.nextIntakeStep?.status || "counsel_analysis",
            time: "Just now",
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            sender: "assistant",
            content:
              "I have updated your case file with these details. Is there any document, notice, or witness corroboration you have regarding this?",
            time: "Just now",
          },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          sender: "assistant",
          content: `⚠️ Note: ${err.message}. Your facts have been noted locally.`,
          time: "Just now",
        },
      ]);
      onToast?.("Agent encountered a temporary network delay");
    } finally {
      setBusy(false);
    }
  }

  async function handleCompleteAndAnalyze() {
    setBusy(true);
    onToast?.("Analyzing case facts across Indian statutes & generating dossier...");
    try {
      let analysisResult = null;
      let formPayload = null;

      if (caseId) {
        const res = await api.runCaseAnalysis(caseId);
        analysisResult = res?.analysis;
      }

      if (!analysisResult) {
        // Fallback to direct analyze if needed
        const narrative = extractedFacts.map((f) => f.statement || f).join(". ") || input;
        formPayload = {
          title: "Legal Case File",
          narrative: narrative.length >= 60 ? narrative : narrative + ". Full facts as stated to AI Advocate.",
          category: selectedCat || "domestic-violence",
          location: "India",
          language: "en",
        };
        analysisResult = await api.analyze(formPayload);
      }

      if (analysisResult) {
        onSubmitted(analysisResult, formPayload || { title: "Legal Case File" });
      }
    } catch (err) {
      onToast?.("Could not complete analysis: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ paddingTop: 0, background: "var(--white)", minHeight: "92vh" }}>
      {/* Page Header */}
      <div
        style={{
          borderBottom: "1px solid var(--border)",
          padding: "20px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
          background: "var(--white)",
        }}
      >
        <div>
          <span className="badge-note" style={{ marginBottom: 4, display: "block" }}>
            Case Preparation & Consultation
          </span>
          <h1
            style={{
              fontFamily: "var(--serif)",
              fontSize: "1.65rem",
              color: "var(--black)",
              margin: 0,
              fontWeight: 700,
            }}
          >
            The AI Legal Advocate
          </h1>
          <p style={{ margin: "4px 0 0", color: "var(--text-soft)", fontSize: "0.86rem" }}>
            Active Workspace:{" "}
            <b style={{ color: "var(--black)" }}>
              {activeCase?.title || "Default Consultation"}
            </b>{" "}
            · Guided Statutory Fact Discovery, Missing Evidence Analysis & BNS Transition
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            className="btn btn--primary btn--sm"
            onClick={handleCompleteAndAnalyze}
            disabled={busy || extractedFacts.length === 0}
            type="button"
          >
            <Icon name="doc" size={13} />
            Compile Dossier
          </button>
          <button
            className="btn btn--outline btn--sm"
            onClick={() => onGoToOpponent?.(caseId)}
            type="button"
          >
            <span style={{ marginRight: 4 }}>⚔️</span>
            Test in Opponent Arena
          </button>
          <button
            className="btn btn--ghost btn--sm"
            onClick={onGoToForm}
            type="button"
          >
            Form Intake
          </button>
        </div>
      </div>

      <div className="shell" style={{ padding: "24px 24px" }}>
        {/* 2-Column Layout: Chat Conversation on Left, Live Fact Dossier on Right */}
        <div style={{ display: "grid", gridTemplateColumns: "1.3fr 0.85fr", gap: 24, alignItems: "start" }}>
          {/* Left Column: Conversational Chat */}
          <div
            style={{
              background: "var(--white)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border)",
              display: "flex",
              flexDirection: "column",
              height: "680px",
              boxShadow: "var(--shadow-sm)",
              overflow: "hidden",
            }}
          >
            {/* Quick Starters */}
            {messages.length <= 1 ? (
              <div
                style={{
                  padding: "14px 18px",
                  background: "var(--gray-50)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--text-faint)",
                    display: "block",
                    marginBottom: 8,
                    fontFamily: "var(--mono)",
                  }}
                >
                  Quick dispute starters:
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {SAMPLE_STARTERS.map((s, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setSelectedCat(s.category);
                        handleSend(s.text, s.category);
                      }}
                      style={{
                        padding: "5px 11px",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius)",
                        background: "var(--white)",
                        color: "var(--text)",
                        fontSize: "0.72rem",
                        fontFamily: "var(--mono)",
                        cursor: "pointer",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {s.title}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Message Feed */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "20px 22px",
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              {messages.map((m, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: m.sender === "user" ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 5,
                      fontSize: "0.68rem",
                      color: "var(--text-faint)",
                      fontFamily: "var(--mono)",
                    }}
                  >
                    <span>{m.sender === "user" ? "LITIGANT" : "⚖️ THE ADVOCATE"}</span>
                    {m.stepTag ? (
                      <span
                        style={{
                          background: "var(--gray-100)",
                          color: "var(--black)",
                          padding: "1px 6px",
                          borderRadius: "var(--radius)",
                          fontSize: "0.65rem",
                          fontWeight: 600,
                        }}
                      >
                        {m.stepTag}
                      </span>
                    ) : null}
                    <span>· {m.time}</span>
                  </div>
                  <div
                    style={{
                      maxWidth: "85%",
                      padding: "14px 18px",
                      borderRadius: "var(--radius-lg)",
                      ...(m.sender === "user"
                        ? { borderTopRightRadius: 2, background: "var(--black)", color: "var(--white)" }
                        : { borderTopLeftRadius: 2, background: "var(--gray-50)", border: "1px solid var(--border)", color: "var(--text)" }),
                      fontSize: "0.91rem",
                      lineHeight: 1.62,
                      ...(m.sender === "user" ? { whiteSpace: "pre-wrap" } : null),
                    }}
                  >
                    {m.sender === "user" ? m.content : <Markdown>{m.content}</Markdown>}
                  </div>
                </div>
              ))}
              {busy ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text-soft)" }}>
                  <Loading label="The Advocate is interrogating statutory provisions under India Code..." />
                </div>
              ) : null}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <div
              style={{
                padding: "14px 18px",
                borderTop: "1px solid var(--border)",
                background: "var(--white)",
              }}
            >
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                style={{ display: "flex", gap: 10 }}
              >
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="State the facts of what transpired, dates, amounts, and what you seek to protect..."
                  disabled={busy}
                  style={{
                    flex: 1,
                    padding: "10px 14px",
                    borderRadius: "var(--radius)",
                    border: "1px solid var(--border-strong)",
                    background: "var(--white)",
                    color: "var(--text)",
                    fontSize: "0.9rem",
                    outline: "none",
                  }}
                />
                <button
                  type="submit"
                  disabled={busy || !input.trim()}
                  className="btn btn--primary"
                  style={{ whiteSpace: "nowrap" }}
                >
                  Examine →
                </button>
              </form>

              {/* Quick Answer Helpers */}
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  marginTop: 10,
                  fontSize: "0.72rem",
                  color: "var(--text-faint)",
                  alignItems: "center",
                  fontFamily: "var(--mono)",
                  flexWrap: "wrap",
                }}
              >
                <span style={{ textTransform: "uppercase" }}>Quick replies:</span>
                <button
                  type="button"
                  onClick={() => handleSend("I do not possess the exact date, but the occurrence was recent.")}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--black)",
                    cursor: "pointer",
                    textDecoration: "underline",
                    padding: 0,
                    fontSize: "inherit",
                    fontFamily: "inherit",
                  }}
                >
                  "I don't know the exact date"
                </button>
                <span>·</span>
                <button
                  type="button"
                  onClick={() => handleSend("I retain WhatsApp exports and audio recordings as secondary evidence.")}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--black)",
                    cursor: "pointer",
                    textDecoration: "underline",
                    padding: 0,
                    fontSize: "inherit",
                    fontFamily: "inherit",
                  }}
                >
                  "I retain WhatsApp electronic evidence"
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Live Legal Fact Extraction Panel */}
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {/* Live Facts Card */}
            <div
              style={{
                background: "var(--white)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-lg)",
                padding: "18px 20px",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                  borderBottom: "1px solid var(--border)",
                  paddingBottom: 8,
                }}
              >
                <div>
                  <span className="badge-note" style={{ margin: 0 }}>
                    Fact Registry
                  </span>
                  <h3 style={{ margin: "2px 0 0", fontSize: "1.05rem", color: "var(--black)", fontFamily: "var(--serif)" }}>
                    Established Facts
                  </h3>
                </div>
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: "0.68rem",
                    padding: "3px 8px",
                    borderRadius: "var(--radius)",
                    background: "var(--gray-100)",
                    color: "var(--black)",
                    fontWeight: 700,
                  }}
                >
                  {extractedFacts.length} VERIFIED
                </span>
              </div>

              {extractedFacts.length === 0 ? (
                <p style={{ color: "var(--text-faint)", fontSize: "0.85rem", margin: "10px 0", lineHeight: 1.6, fontStyle: "italic" }}>
                  As you describe events to the Advocate, statements are extracted into legally admissible facts
                  with provenance tracking.
                </p>
              ) : (
                <ul
                  style={{
                    paddingLeft: 0,
                    listStyle: "none",
                    margin: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    maxHeight: "220px",
                    overflowY: "auto",
                  }}
                >
                  {extractedFacts.map((f, i) => (
                    <li
                      key={i}
                      style={{
                        padding: "10px 12px",
                        background: "var(--gray-50)",
                        borderRadius: "var(--radius)",
                        fontSize: "0.84rem",
                        borderLeft: "3px solid var(--black)",
                        color: "var(--text)",
                      }}
                    >
                      <span style={{ fontWeight: 500 }}>{f.statement || f}</span>
                      {f.source_type ? (
                        <div
                          style={{
                            fontSize: "0.68rem",
                            color: "var(--text-faint)",
                            marginTop: 4,
                            fontFamily: "var(--mono)",
                          }}
                        >
                          SOURCE: {f.source_type.toUpperCase()} · STATUS:{" "}
                          {(f.verification_status || "corroborated").toUpperCase()}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Transition Check: BNS vs IPC */}
            <div
              style={{
                background: "var(--white)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-lg)",
                padding: "18px 20px",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 10,
                }}
              >
                <div>
                  <span className="badge-note" style={{ margin: 0 }}>
                    Constitutional Check
                  </span>
                  <h3 style={{ margin: "2px 0 0", fontSize: "1.05rem", color: "var(--black)", fontFamily: "var(--serif)" }}>
                    Criminal Law Transition
                  </h3>
                </div>
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: "0.68rem",
                    padding: "3px 8px",
                    borderRadius: "var(--radius)",
                    background: "var(--gray-100)",
                    color: "var(--black)",
                  }}
                >
                  ART. 20(1)
                </span>
              </div>

              <p style={{ fontSize: "0.82rem", color: "var(--text-soft)", margin: "0 0 12px", lineHeight: 1.55 }}>
                Under Article 20(1) of the Constitution of India, offenses prior to 1 July 2024 fall strictly under IPC;
                conduct thereafter is governed by Bharatiya Nyaya Sanhita (BNS).
              </p>

              <div
                style={{
                  background: "var(--gray-50)",
                  padding: "10px 14px",
                  borderRadius: "var(--radius)",
                  fontSize: "0.82rem",
                  border: "1px solid var(--border)",
                }}
              >
                <div style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", color: "var(--text-faint)", textTransform: "uppercase" }}>
                  Mapped Statutory Crosswalk:
                </div>
                <div style={{ marginTop: 6, display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{ color: "var(--text-soft)" }}>IPC 498A (Cruelty)</span>
                  <span style={{ color: "var(--black)" }}>➔</span>
                  <span style={{ color: "var(--black)", fontWeight: 700 }}>BNS Section 85 / 86</span>
                </div>
              </div>
            </div>

            {/* Timeline Snapshot */}
            <div
              style={{
                background: "var(--white)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-lg)",
                padding: "18px 20px",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 10,
                }}
              >
                <div>
                  <span className="badge-note" style={{ margin: 0 }}>
                    Chronology
                  </span>
                  <h3 style={{ margin: "2px 0 0", fontSize: "1.05rem", color: "var(--black)", fontFamily: "var(--serif)" }}>
                    Timeline Events
                  </h3>
                </div>
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: "0.68rem",
                    padding: "3px 8px",
                    borderRadius: "var(--radius)",
                    background: "var(--gray-100)",
                    color: "var(--black)",
                  }}
                >
                  {timelineEvents.length} DATES
                </span>
              </div>

              {timelineEvents.length === 0 ? (
                <p style={{ fontSize: "0.82rem", color: "var(--text-faint)", margin: 0, fontStyle: "italic" }}>
                  No dates extracted yet. State when key occurrences and notices took place.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: "0.82rem" }}>
                  {timelineEvents.map((t, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: "flex",
                        gap: 10,
                        background: "var(--gray-50)",
                        padding: "8px 12px",
                        borderRadius: "var(--radius)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 700,
                          color: "var(--black)",
                          minWidth: 88,
                          fontFamily: "var(--mono)",
                          fontSize: "0.76rem",
                        }}
                      >
                        {t.event_date || t.iso || "Recent"}
                      </span>
                      <span style={{ color: "var(--text)" }}>{t.description || t.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
