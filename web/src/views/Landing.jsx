import { useEffect, useState } from "react";
import { Icon } from "../ui.jsx";

const CAPABILITIES = [
  {
    roman: "I.",
    title: "Conversational Case Intake",
    body:
      "Describe your case in plain language. Our AI asks clarifying questions like a senior lawyer to build a complete picture of your dispute.",
    badge: "ADAPTIVE INTERVIEW",
  },
  {
    roman: "II.",
    title: "AI Legal Advocate",
    body:
      "Get instant analysis of your case strength, actionable advice, and specific government authorities or helplines that can assist you.",
    badge: "CASE ANALYSIS",
  },
  {
    roman: "III.",
    title: "Opponent Simulator",
    body:
      "Face hostile opposing arguments before court. Understand what the other side will argue and how to counter it effectively.",
    badge: "MOCK TRIAL ARENA",
  },
  {
    roman: "IV.",
    title: "Statutory Core & Verified Law",
    body:
      "Every provision cited comes directly from official Indian law gazettes. No hallucinations — every citation is verified and traceable.",
    badge: "INDIA CODE GROUNDED",
  },
];

export default function Landing({
  onStart,
  onOpenSample,
  meta,
  health,
  samples,
  onBrowse,
  onStartAdvocate,
  onStartOpponent,
  onGoToDossier,
  onOpenWorkspaces,
  onNewWorkspace,
}) {
  const [trusted, setTrusted] = useState([]);

  useEffect(() => {
    if (!meta?.sources) return;
    setTrusted(meta.sources.slice(0, 3));
  }, [meta]);

  return (
    <main style={{ background: "var(--white)", minHeight: "100vh", color: "var(--text)" }}>
      {/* Hero */}
      <section style={{ borderBottom: "1px solid var(--border)", padding: "72px 0 64px" }}>
        <div className="shell">
          <div style={{ marginBottom: 12 }}>
            <span className="badge-note">JollyLLM — AI-Powered Indian Legal Assistant</span>
          </div>

          <h1 style={{
            fontFamily: "var(--serif)",
            fontSize: "clamp(2.2rem, 5vw, 3.8rem)",
            lineHeight: 1.12,
            fontWeight: 700,
            color: "var(--black)",
            margin: "0 0 18px",
            maxWidth: "780px",
          }}>
            Know your legal rights.{" "}
            <em style={{ fontStyle: "italic", color: "var(--gray-300)" }}>
              Verified. Grounded. AI-powered.
            </em>
          </h1>

          <p style={{
            fontSize: "1.05rem",
            color: "var(--gray-500)",
            maxWidth: "580px",
            margin: "0 0 32px",
            lineHeight: 1.7,
          }}>
            Register your case, get AI-driven legal analysis, understand your case strength,
            see actionable next steps, and simulate opponent arguments — all grounded in
            verified Indian law.
          </p>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn--primary"
              onClick={onNewWorkspace}
            >
              Register New Case
            </button>
            <button
              type="button"
              className="btn btn--outline"
              onClick={onStartAdvocate}
            >
              Open AI Advocate
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={onBrowse}
            >
              Browse Statutes
            </button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section style={{ padding: "48px 0", borderBottom: "1px solid var(--border)" }}>
        <div className="shell">
          <div style={{ marginBottom: 28 }}>
            <span className="badge-note">What JollyLLM does</span>
          </div>
          <div className="features-grid">
            {CAPABILITIES.map((cap, i) => (
              <div className="feature-card" key={i}>
                <div className="feature-card__num">{cap.roman}</div>
                <h3>{cap.title}</h3>
                <p>{cap.body}</p>
                <span className="feature-card__badge">{cap.badge}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section style={{ padding: "48px 0", borderBottom: "1px solid var(--border)" }}>
        <div className="shell">
          <div style={{ marginBottom: 28 }}>
            <span className="badge-note">How it works</span>
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 0,
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            overflow: "hidden",
          }}>
            {[
              { step: "01", title: "Select case type", desc: "Choose from all Indian legal categories, or let AI auto-classify your case." },
              { step: "02", title: "Describe the dispute", desc: "Narrate what happened. Upload supporting documents if available." },
              { step: "03", title: "AI asks & analyzes", desc: "The AI asks clarifying questions, then builds a complete legal picture." },
              { step: "04", title: "Get your strategy", desc: "Receive case strength score, actionable steps, authorities to contact, and opponent simulation." },
            ].map((s, i) => (
              <div key={i} style={{
                padding: "24px 20px",
                borderRight: i < 3 ? "1px solid var(--border)" : "none",
                borderBottom: "1px solid var(--border)",
              }}>
                <div style={{
                  fontFamily: "var(--mono)",
                  fontSize: "1.6rem",
                  fontWeight: 700,
                  color: "var(--gray-100)",
                  marginBottom: 10,
                  lineHeight: 1,
                }}>
                  {s.step}
                </div>
                <div style={{
                  fontFamily: "var(--serif)",
                  fontWeight: 700,
                  fontSize: "0.98rem",
                  color: "var(--black)",
                  marginBottom: 6,
                }}>
                  {s.title}
                </div>
                <div style={{ fontSize: "0.82rem", color: "var(--text-soft)", lineHeight: 1.6 }}>
                  {s.desc}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Quick actions */}
      <section style={{ padding: "48px 0", borderBottom: "1px solid var(--border)" }}>
        <div className="shell">
          <div style={{ marginBottom: 28 }}>
            <span className="badge-note">Quick actions</span>
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 12,
          }}>
            <div
              style={{
                border: "1px solid var(--border-strong)",
                borderRadius: "var(--radius-lg)",
                padding: "20px",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
              onClick={onNewWorkspace}
              role="button"
              tabIndex={0}
            >
              <div style={{ fontSize: "1.5rem", marginBottom: 10 }}>&#x2696;&#xFE0F;</div>
              <div style={{ fontFamily: "var(--serif)", fontWeight: 700, fontSize: "1rem", color: "var(--black)", marginBottom: 6 }}>
                Register a Case
              </div>
              <div style={{ fontSize: "0.82rem", color: "var(--text-soft)" }}>
                Start a new workspace by describing your legal dispute to the AI.
              </div>
            </div>

            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-lg)",
                padding: "20px",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
              onClick={onStartOpponent}
              role="button"
              tabIndex={0}
            >
              <div style={{ fontSize: "1.5rem", marginBottom: 10 }}>&#x1F3DB;&#xFE0F;</div>
              <div style={{ fontFamily: "var(--serif)", fontWeight: 700, fontSize: "1rem", color: "var(--black)", marginBottom: 6 }}>
                Opponent Simulator
              </div>
              <div style={{ fontSize: "0.82rem", color: "var(--text-soft)" }}>
                Test your case against AI-simulated opposing counsel arguments.
              </div>
            </div>

            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-lg)",
                padding: "20px",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
              onClick={onBrowse}
              role="button"
              tabIndex={0}
            >
              <div style={{ fontSize: "1.5rem", marginBottom: 10 }}>&#x1F4D6;</div>
              <div style={{ fontFamily: "var(--serif)", fontWeight: 700, fontSize: "1rem", color: "var(--black)", marginBottom: 6 }}>
                Browse Indian Statutes
              </div>
              <div style={{ fontSize: "0.82rem", color: "var(--text-soft)" }}>
                Search verified provisions from India Code and court decisions.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: "64px 0" }}>
        <div className="shell" style={{ textAlign: "center" }}>
          <h2 style={{
            fontFamily: "var(--serif)",
            fontSize: "1.8rem",
            fontWeight: 700,
            color: "var(--black)",
            margin: "0 0 12px",
          }}>
            Ready to understand your legal situation?
          </h2>
          <p style={{ color: "var(--gray-500)", margin: "0 0 28px", fontSize: "0.95rem" }}>
            Register your case in minutes. No login required. All processing is local.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn--primary btn--lg"
              onClick={onNewWorkspace}
            >
              Register a Case
            </button>
            <button
              type="button"
              className="btn btn--outline"
              onClick={onOpenWorkspaces}
            >
              View All Workspaces
            </button>
          </div>
        </div>
      </section>

      <Footer meta={meta} />
    </main>
  );
}

export function Footer({ meta }) {
  return (
    <footer style={{
      borderTop: "1px solid var(--border)",
      padding: "18px 0",
      background: "var(--gray-50)",
    }}>
      <div className="shell" style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 10,
      }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: "0.62rem", color: "var(--text-faint)", letterSpacing: "0.06em" }}>
          JollyLLM \u2014 AI-POWERED INDIAN LEGAL ASSISTANT \u2014 LOCAL-FIRST
        </span>
        <span style={{ fontFamily: "var(--mono)", fontSize: "0.62rem", color: "var(--text-faint)" }}>
          {meta?.sources?.length ? `${meta.sources.length} verified sources` : ""}
        </span>
      </div>
    </footer>
  );
}
