import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { Icon, Loading, Notice, Tag, Toast } from "./ui.jsx";
import Landing from "./views/Landing.jsx";
import Intake from "./views/Intake.jsx";
import Sources from "./views/Sources.jsx";
import PdfPanel from "./views/PdfPanel.jsx";
import CaseDocuments from "./views/CaseDocuments.jsx";
import AdvocateChat from "./views/AdvocateChat.jsx";
import OpponentArena from "./views/OpponentArena.jsx";
import WorkspacesDirectory from "./views/WorkspacesDirectory.jsx";
import NewWorkspaceInterview from "./views/NewWorkspaceInterview.jsx";
import FindLawyer from "./views/FindLawyer.jsx";
import {
  ActionPlan,
  AiBadge,
  AiBlock,
  LegalResearch,
  Overview,
  TimelineEvidence,
  OpponentSimulationView,
  buildPrintDocument,
} from "./views/Workspace.jsx";

/* -------------------------------------------------------------------------
   Routing. A three-view hash router is enough here and avoids pulling in a
   routing library for what is, in the end, a three-screen prototype.
   ------------------------------------------------------------------------- */

function useHashRoute() {
  const [route, setRoute] = useState(() => window.location.hash.slice(1) || "home");

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash.slice(1) || "home");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = useCallback((next) => {
    window.location.hash = next;
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  return [route, go];
}

/* -------------------------------------------------------------------------
   Top bar
   ------------------------------------------------------------------------- */

function NavLink({ label, route, current, go, target }) {
  const active = current === target;
  return (
    <a
      href={`#${target}`}
      onClick={(e) => { e.preventDefault(); go(target); }}
      style={{
        fontFamily: "var(--mono)",
        fontSize: "0.68rem",
        letterSpacing: "0.05em",
        color: active ? "var(--black)" : "var(--gray-500)",
        textDecoration: "none",
        padding: "5px 9px",
        borderRadius: "var(--radius)",
        background: active ? "var(--gray-100)" : "transparent",
        fontWeight: active ? 700 : 400,
        textTransform: "uppercase",
        transition: "all 0.15s",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </a>
  );
}

function TopBar({ route, go, health, hasCase, onReset }) {
  const state = !health ? "wait" : health.engine?.ok ? "on" : "off";
  const dense = health?.engine?.dense;
  const densePending = Boolean(dense && dense.state === "loading");
  const denseDead = Boolean(dense && dense.state === "unavailable");

  const label = !health
    ? "connecting"
    : !health.engine?.ok
      ? "service unavailable"
      : densePending
        ? "loading index"
        : denseDead
          ? "index unavailable"
          : `${health.corpus.provisions} provisions · ${health.corpus.judgments} decisions`;

  return (
    <header className="topbar no-print">
      {densePending ? (
        <div className="topbar__warming no-print">
          Loading the semantic model — keyword matching is active now, full semantic search ready shortly.
        </div>
      ) : null}
      {denseDead ? (
        <div className="topbar__warming topbar__warming--warn no-print">
          Semantic model unavailable — running on keyword matching only.
        </div>
      ) : null}
      <div className="topbar__inner">
        {/* Brand */}
        <a
          className="brand"
          href="#home"
          onClick={(e) => { e.preventDefault(); go("home"); }}
        >
          <span style={{ fontSize: "1.35rem", lineHeight: 1 }}>⚖️</span>
          <span style={{ display: "flex", flexDirection: "column" }}>
            <span style={{
              fontFamily: "var(--serif)",
              fontWeight: 700,
              fontSize: "1.05rem",
              color: "var(--black)",
              lineHeight: 1.1,
            }}>JollyLLM</span>
            <span style={{
              fontFamily: "var(--mono)",
              fontSize: "0.52rem",
              letterSpacing: "0.1em",
              color: "var(--gray-400)",
              textTransform: "uppercase",
            }}>AI Legal Assistant</span>
          </span>
        </a>

        {/* Nav */}
        <nav className="topbar__nav">
          <span className="topbar__status">
            <span className={`dot${state === "on" && !densePending ? "" : state === "off" ? " dot--off" : " dot--wait"}`} />
            {label}
          </span>
          <NavLink label="Home" route={route} current={route} go={go} target="home" />
          <NavLink label="AI Advocate" route={route} current={route} go={go} target="advocate" />
          <NavLink label="Opponent" route={route} current={route} go={go} target="opponent" />
          <NavLink label="Find Lawyer" route={route} current={route} go={go} target="lawyers" />
          <NavLink label="Statutes" route={route} current={route} go={go} target="sources" />
          {hasCase
            ? <NavLink label="Dossier" route={route} current={route} go={go} target="case" />
            : <NavLink label="New Case" route={route} current={route} go={go} target="new-workspace" />
          }
          <NavLink label="Workspaces" route={route} current={route} go={go} target="workspaces" />

          <button
            className="btn btn--primary btn--sm"
            onClick={() => go(hasCase ? "case" : "new-workspace")}
            type="button"
            style={{ marginLeft: 6 }}
          >
            {hasCase ? "View Dossier" : "Register Case"}
          </button>

          {hasCase ? (
            <button
              className="btn btn--ghost btn--sm"
              type="button"
              onClick={onReset}
              title="Clear active case"
            >
              <Icon name="reset" size={12} />
            </button>
          ) : null}
        </nav>
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------
   Workspace Switcher Bar & Modal
   Allows seamless toggling between multiple client legal workspaces
   ------------------------------------------------------------------------- */

function WorkspaceSwitcherBar({
  workspaces,
  activeCase,
  onSelectWorkspace,
  onOpenDirectory,
  onNewWorkspace,
  onDeleteWorkspace,
  loadingWorkspace,
}) {
  if (!workspaces.length && !activeCase) return null;
  return (
    <div
      className="no-print"
      style={{
        background: "var(--gray-50)",
        borderBottom: "1px solid var(--gray-200)",
        padding: "7px 0",
      }}
    >
      <div
        className="shell"
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <span style={{
          fontFamily: "var(--mono)",
          fontSize: "0.62rem",
          letterSpacing: "0.08em",
          color: "var(--gray-400)",
          textTransform: "uppercase",
          flexShrink: 0,
        }}>Workspace:</span>

        <select
          value={activeCase?.id || ""}
          onChange={(e) => onSelectWorkspace(e.target.value)}
          disabled={loadingWorkspace}
          aria-label="Select active workspace"
          style={{
            padding: "4px 10px",
            borderRadius: "var(--radius)",
            border: "1px solid var(--gray-300)",
            background: "var(--white)",
            color: "var(--text)",
            fontSize: "0.8rem",
            cursor: "pointer",
            maxWidth: "300px",
            fontFamily: "var(--sans)",
          }}
        >
          {workspaces.map((ws) => (
            <option key={ws.id} value={ws.id}>
              {ws.title}{ws.category ? ` — ${ws.category}` : ""}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={onOpenDirectory}
        >
          All ({workspaces.length})
        </button>

        <button
          type="button"
          className="btn btn--outline btn--sm"
          onClick={onNewWorkspace}
        >
          + New Case
        </button>

        {activeCase && onDeleteWorkspace ? (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            style={{ color: "#dc2626", borderColor: "var(--border)", padding: "3px 8px" }}
            title={`Delete active workspace: ${activeCase.title}`}
            onClick={() => {
              if (
                window.confirm(
                  `Permanently delete active workspace "${activeCase.title}"?\n\nThis will remove all associated facts, evidence, chat messages, and opponent simulations.`
                )
              ) {
                onDeleteWorkspace(activeCase.id);
              }
            }}
          >
            <Icon name="trash" size={12} />
          </button>
        ) : null}

        {loadingWorkspace ? (
          <span style={{ color: "var(--gray-400)", fontSize: "0.72rem", fontFamily: "var(--mono)" }}>
            Loading...
          </span>
        ) : null}

        {activeCase ? (
          <span style={{
            marginLeft: "auto",
            fontFamily: "var(--mono)",
            fontSize: "0.65rem",
            color: "var(--gray-400)",
            letterSpacing: "0.04em",
          }}>
            {activeCase.category ? activeCase.category.toUpperCase() : "CIVIL"}
            {activeCase.jurisdiction ? ` · ${activeCase.jurisdiction}` : ""}
            {activeCase.facts?.length ? ` · ${activeCase.facts.length} facts` : ""}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function NewWorkspaceModal({ open, onClose, onCreate }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("domestic-violence");
  const [jurisdiction, setJurisdiction] = useState("Delhi");

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(4px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 8,
          width: "90%",
          maxWidth: "480px",
          padding: "24px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <h3 style={{ margin: 0, fontSize: "1.2rem", color: "var(--navy-900)" }}>
            Create New Legal Workspace
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: "1.2rem",
              cursor: "pointer",
              color: "var(--ink-soft)",
            }}
          >
            ✕
          </button>
        </div>

        <p style={{ fontSize: "0.85rem", color: "var(--ink-soft)", margin: "0 0 16px", lineHeight: 1.5 }}>
          Create an isolated workspace for a new case matter. Each workspace retains its own facts,
          evidence timeline, AI Advocate conversation, and Opponent Simulator tests.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onCreate(title, category, jurisdiction);
            onClose();
          }}
          style={{ display: "flex", flexDirection: "column", gap: 14 }}
        >
          <div>
            <label
              style={{
                display: "block",
                fontSize: "0.82rem",
                fontWeight: 600,
                marginBottom: 5,
                color: "var(--navy-900)",
              }}
            >
              Workspace Title / Client Matter:
            </label>
            <input
              type="text"
              required
              placeholder="e.g., Mehta Consumer Banking Fraud Dispute"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{
                width: "100%",
                padding: "9px 12px",
                borderRadius: 4,
                border: "1px solid var(--navy-300)",
                fontSize: "0.9rem",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: "0.82rem",
                fontWeight: 600,
                marginBottom: 5,
                color: "var(--navy-900)",
              }}
            >
              Legal Category:
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{
                width: "100%",
                padding: "9px 12px",
                borderRadius: 4,
                border: "1px solid var(--navy-300)",
                fontSize: "0.9rem",
                boxSizing: "border-box",
              }}
            >
              <option value="domestic-violence">Domestic Violence (DV Act / BNS 85 / IPC 498A)</option>
              <option value="cheque-bounce">Cheque Bounce (Section 138 NI Act)</option>
              <option value="tenancy-eviction">Tenancy & Eviction (Rent Control)</option>
              <option value="consumer-dispute">Consumer Dispute & Banking Fraud</option>
              <option value="employment-wage">Employment & Wage Recovery</option>
              <option value="civil-other">General Civil & Property Dispute</option>
            </select>
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: "0.82rem",
                fontWeight: 600,
                marginBottom: 5,
                color: "var(--navy-900)",
              }}
            >
              Jurisdiction / City:
            </label>
            <input
              type="text"
              placeholder="e.g., Delhi, Mumbai, Bengaluru"
              value={jurisdiction}
              onChange={(e) => setJurisdiction(e.target.value)}
              style={{
                width: "100%",
                padding: "9px 12px",
                borderRadius: 4,
                border: "1px solid var(--navy-300)",
                fontSize: "0.9rem",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
            <button type="button" className="btn btn--quiet btn--sm" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn--primary btn--sm"
              disabled={!title.trim()}
            >
              Create Workspace
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
   Workspace screen
   ------------------------------------------------------------------------- */

function Workspace({ data, form, meta, samples, go, onReset, onDelete, onToast, caseId, documents, onDocumentsChanged }) {
  const [tab, setTab] = useState("overview");
  const [evidence, setEvidence] = useState(() => new Set());
  const [done, setDone] = useState(() => new Set());
  const [researchGroup, setResearchGroup] = useState("core");
  const [researchAct, setResearchAct] = useState("all");
  const [planStage, setPlanStage] = useState(0);
  const [planStep, setPlanStep] = useState(null);

  const toggleIn = (setter) => (key) =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleEvidence = toggleIn(setEvidence);
  const toggleDone = toggleIn(setDone);

  function copy() {
    const text = buildPrintDocument(data, form);
    navigator.clipboard
      ?.writeText(text)
      .then(() => onToast("Case dossier copied to the clipboard"))
      .catch(() => onToast("Copying is blocked in this browser — use Print instead"));
  }

  function download() {
    const text = buildPrintDocument(data, form);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `JollyLLM-${(data.summary.headline || "case").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    onToast("Dossier downloaded");
  }

  const doneCount = data.actionPlan.filter((s) => done.has(s.title)).length;
  const heldCount = data.evidence.filter((e) => evidence.has(e.item) || e.suggestedHeld).length;

  const tabs = [
    { id: "overview", label: "Overview", count: null, icon: "doc" },
    { id: "timeline", label: "Timeline & Evidence", count: data.timeline.total, icon: "clock" },
    { id: "research", label: "Legal Research", count: data.provisions.length + data.judgments.length, icon: "scale" },
    { id: "opponent", label: "Opponent Simulator", count: null, icon: "scale" },
    { id: "plan", label: "Action Plan", count: data.actionPlan.length, icon: "route" },
    { id: "documents", label: "Documents", count: null, icon: "upload" },
    { id: "ai", label: "AI Reading", count: null, icon: "info" },
  ];

  return (
    <>
      <section className="ws-bar no-print">
        <div className="shell">
          <div className="ws-bar__top">
            <div>
              <span className="badge-note" style={{ marginBottom: 6 }}>
                [ ENCLAVE V: CASE DOSSIER &amp; PREPARATION ]
              </span>
              <h1>{data.summary.headline}</h1>
              <div className="ws-bar__meta">
                <span>
                  <b>{data.summary.issueType}</b>
                </span>
                {data.input.location ? <span>{data.input.location}</span> : null}
                {data.input.startDate ? <span>from {data.input.startDate}</span> : null}
                <span>{data.language.label}</span>
                <span>
                  coverage <b>{data.uncertainty.reliability.label.toLowerCase()}</b>
                </span>
                <span>
                  {heldCount}/{data.evidence.length} evidence · {doneCount}/{data.actionPlan.length} steps
                </span>
                <AiBadge llm={data.llm} />
              </div>
            </div>

            <div className="ws-bar__actions">
              <button className="btn btn--cream btn--sm" onClick={() => window.print()} type="button">
                <Icon name="print" size={14} /> PRINT DOSSIER
              </button>
              <button className="btn btn--outline btn--sm" onClick={copy} type="button">
                <Icon name="copy" size={14} /> COPY
              </button>
              <button className="btn btn--outline btn--sm" onClick={download} type="button">
                DOWNLOAD
              </button>
              <button className="btn btn--ghost btn--sm" onClick={onReset} type="button">
                <Icon name="reset" size={13} /> CLEAR
              </button>
              {onDelete ? (
                <button
                  className="btn btn--ghost btn--sm"
                  style={{ color: "#dc2626" }}
                  onClick={onDelete}
                  type="button"
                  title="Permanently delete this workspace"
                >
                  <Icon name="trash" size={13} /> DELETE
                </button>
              ) : null}
            </div>
          </div>

          <div className="tabs" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                className="tab"
                data-on={tab === t.id}
                onClick={() => setTab(t.id)}
                type="button"
              >
                <Icon name={t.icon} size={14} />
                {t.label}
                {t.count !== null ? <span className="tab__count">{t.count}</span> : null}
              </button>
            ))}
          </div>
        </div>
      </section>

      <main className="ws-body">
        <div className="shell">
          {tab === "overview" ? <Overview data={data} meta={meta} onOpenTab={setTab} /> : null}
          {tab === "timeline" ? (
            <TimelineEvidence data={data} checked={evidence} onToggleEvidence={toggleEvidence} />
          ) : null}
          {tab === "research" ? (
            <LegalResearch
              data={data}
              meta={meta}
              group={researchGroup}
              onGroupChange={setResearchGroup}
              act={researchAct}
              onActChange={setResearchAct}
              onToast={onToast}
            />
          ) : null}
          {tab === "opponent" ? (
            <OpponentSimulationView data={data} onToast={onToast} />
          ) : null}
          {tab === "plan" ? (
            <ActionPlan
              data={data}
              done={done}
              onToggle={toggleDone}
              stage={planStage}
              onStageChange={setPlanStage}
              stepKey={planStep}
              onStepSelect={setPlanStep}
            />
          ) : null}
          {tab === "documents" ? (
            <>
              <Notice tone="info" title="Documents stay in this workspace">
                <p>
                  A file you upload here is stored against this case only, and its text is read for
                  dates and facts. No other workspace can see it. If a document will not read, type
                  what it says into the narrative instead.
                </p>
              </Notice>
              <PdfPanel caseId={caseId} onStored={onDocumentsChanged} />
              <CaseDocuments
                caseId={caseId}
                documents={documents}
                onChanged={onDocumentsChanged}
                onToast={onToast}
              />
              <div className="panel" style={{ marginTop: 22 }}>
                <div className="panel__head">
                  <div>
                    <h3>
                      <Icon name="route" size={15} /> Questions to answer before you go
                    </h3>
                    <p>These are the gaps that most often change the advice</p>
                  </div>
                </div>
                <div className="qs">
                  {data.followUps.map((q, i) => (
                    <div className="q" key={i}>
                      <div style={{ gridColumn: "2" }}>
                        <p className="q__text">{q.question}</p>
                        <span className="q__for">{q.forIssue}</span>
                      </div>
                      <div style={{ gridColumn: "3" }}>
                        <input type="text" placeholder="Your answer" aria-label={`Answer: ${q.question}`} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        {tab === "ai" ? (
            data.llm?.ok ? (
              <AiBlock llm={data.llm} />
            ) : (
              <div className="grid-2">
                <Notice tone="info" title="No model was used for this case">
                  <p>
                    {data.llm?.message ||
                      "Live AI is not configured, so every field in this workspace came from the bundled corpus and the retrieval engine."}
                  </p>
                  {data.llm?.reason ? (
                    <p style={{ marginTop: 8 }}>
                      Reason: <code>{data.llm.reason}</code>
                    </p>
                  ) : null}
                  {data.llm?.providerMessage ? (
                    <p style={{ marginTop: 8, fontSize: "0.82rem", color: "var(--ink-faint)" }}>
                      The provider said: {data.llm.providerMessage}
                    </p>
                  ) : null}
                  {data.llm?.retryAfterSeconds ? (
                    <p style={{ marginTop: 6, fontSize: "0.82rem", color: "var(--ink-faint)" }}>
                      The limit clears in about {Math.round(data.llm.retryAfterSeconds)} seconds. A
                      retry after that will use the model again.
                    </p>
                  ) : null}
                  {data.llm?.modelsTried?.length ? (
                    <p style={{ marginTop: 6, fontSize: "0.82rem", color: "var(--ink-faint)" }}>
                      Models tried: {data.llm.modelsTried.join(", ")}
                    </p>
                  ) : null}
                  {data.llm?.reason === "not_configured" ? (
                    <p style={{ marginTop: 10 }}>
                      To turn it on, copy <code>server/.env.example</code> to{" "}
                      <code>server/.env</code>, put a real provider key in it, and restart the API. The
                      key stays on the server and is never sent to the browser.
                    </p>
                  ) : null}
                </Notice>
                <Panel title="What you are looking at instead" icon="book">
                  <p style={{ fontSize: "0.86rem", color: "var(--ink-soft)", margin: 0 }}>
                    This is the deterministic path and it is complete on its own: the facts, timeline
                    and evidence are extracted by rule, the provisions and decisions come from the
                    verified corpus through the retrieval engine, and the action plan is read straight
                    from corpus records. Nothing is generated, so nothing can be hallucinated — at the
                    cost of being keyword-level rather than reading comprehension.
                  </p>
                </Panel>
              </div>
            )
          ) : null}
        </div>
      </main>
    </>
  );
}

/* -------------------------------------------------------------------------
   App
   ------------------------------------------------------------------------- */

export default function App() {
  const [routeWithQuery, go] = useHashRoute();
  // Query strings stay in the hash so a link can prefill directory filters
  // without adding a routing dependency.
  const route = routeWithQuery.split("?")[0];

  const [meta, setMeta] = useState(null);
  const [health, setHealth] = useState(null);
  const [samples, setSamples] = useState([]);
  const [bootError, setBootError] = useState(null);
  const [booting, setBooting] = useState(true);

  const [workspaces, setWorkspaces] = useState([]);
  const [activeCase, setActiveCase] = useState(null);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [isNewWsModalOpen, setIsNewWsModalOpen] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [form, setForm] = useState(null);
  const [intakePrefill, setIntakePrefill] = useState(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }, []);

  const selectWorkspace = useCallback(
    async (caseId) => {
      if (!caseId) return;
      setLoadingWorkspace(true);
      try {
        const res = await api.getCase(caseId);
        if (res?.case) {
          const caseData = {
            ...res.case,
            facts: res.facts || [],
            timeline: res.timeline || [],
            documents: res.documents || [],
            activePlan: res.activePlan,
            latestOpponent: res.latestOpponent,
          };
          setActiveCase(caseData);

          // Populate analysis so Case Workspace (#case) tab works across all features
          try {
            const anaRes = await api.runCaseAnalysis(caseId);
            if (anaRes?.analysis) {
              setAnalysis(anaRes.analysis);
              setForm({
                title: res.case.title,
                category: res.case.category,
                location: res.case.jurisdiction,
                language: res.case.language || "en",
              });
            }
          } catch {
            const factsText = (res.facts || []).map((f) => f.statement || f).join(". ");
            if (factsText.length >= 10) {
              const fallbackAna = await api.analyze({
                title: res.case.title,
                category: res.case.category || "civil-other",
                narrative:
                  factsText.length >= 60
                    ? factsText
                    : `${factsText}. Details under category ${res.case.category}.`,
                location: res.case.jurisdiction || "India",
                language: res.case.language || "en",
              });
              if (fallbackAna) {
                setAnalysis(fallbackAna);
                setForm({
                  title: res.case.title,
                  category: res.case.category,
                  location: res.case.jurisdiction,
                  language: res.case.language || "en",
                });
              }
            }
          }
          showToast(`Active workspace: ${res.case.title}`);
        }
      } catch (err) {
        showToast(`Could not load workspace: ${err.message}`);
      } finally {
        setLoadingWorkspace(false);
      }
    },
    [showToast]
  );

  /**
   * Re-read the case's document list. Upload and removal change the server
   * state, so the list on screen has to come back from the server rather
   * than be patched in the browser.
   */
  const refreshDocuments = useCallback(async () => {
    if (!activeCase?.id) return;
    try {
      const res = await api.listCaseDocuments(activeCase.id);
      setActiveCase((prev) => (prev ? { ...prev, documents: res?.documents || [] } : prev));
    } catch {
      // A failed refresh leaves the previous list on screen; the next action
      // will try again.
    }
  }, [activeCase?.id]);

  async function handleCreateWorkspace(newTitle, newCategory, newJurisdiction) {
    try {
      const res = await api.createCase({
        title: newTitle || "New Legal Workspace",
        category: newCategory || "domestic-violence",
        jurisdiction: newJurisdiction || "Delhi",
      });
      if (res?.case) {
        const listRes = await api.listCases();
        setWorkspaces(listRes?.cases || []);
        await selectWorkspace(res.case.id);
        go("advocate");
        showToast(`Created workspace: ${res.case.title}`);
      }
    } catch (err) {
      showToast(`Error creating workspace: ${err.message}`);
    }
  }

  async function handleDeleteWorkspace(caseId) {
    if (!caseId) return;
    try {
      await api.deleteCase(caseId);
      const listRes = await api.listCases().catch(() => ({ cases: [] }));
      const updatedList = listRes?.cases || workspaces.filter((ws) => ws.id !== caseId);
      setWorkspaces(updatedList);
      showToast("Workspace deleted");
      if (activeCase?.id === caseId) {
        if (updatedList.length > 0) {
          await selectWorkspace(updatedList[0].id);
        } else {
          setActiveCase(null);
          setAnalysis(null);
          setForm(null);
          go("workspaces");
        }
      }
    } catch (err) {
      showToast(`Error deleting workspace: ${err.message}`);
    }
  }

  /* --- boot ---------------------------------------------------------- */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [h, m, s, caseListRes] = await Promise.all([
          api.health(),
          api.meta(),
          api.samples(),
          api.listCases().catch(() => ({ cases: [] })),
        ]);
        if (!alive) return;
        setHealth(h);
        setMeta(m);
        setSamples(s.samples || []);
        const loadedCases = caseListRes?.cases || [];
        setWorkspaces(loadedCases);
        if (loadedCases.length > 0) {
          selectWorkspace(loadedCases[0].id);
        }
      } catch (err) {
        if (alive) setBootError(err);
      } finally {
        if (alive) setBooting(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [selectWorkspace]);

  /* --- poll while the semantic model is warming ------------------------- */
  useEffect(() => {
    if (!health?.engine?.dense || health.engine.dense.state !== "loading") return;
    let alive = true;
    const t = setInterval(async () => {
      try {
        const h = await api.health();
        if (alive) setHealth(h);
      } catch {
        /* keep the last known state; the next tick retries */
      }
    }, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [health?.engine?.dense?.state]);

  /* --- routing ------------------------------------------------------- */
  useEffect(() => {
    if (route === "case" && !analysis) go("advocate");
  }, [route, analysis, go]);

  /* --- actions ------------------------------------------------------- */
  function openSample(id) {
    const s = samples.find((x) => x.id === id);
    if (!s) return;
    setIntakePrefill({
      title: s.title,
      category: s.category,
      narrative: s.narrative,
      location: s.location || "",
      startDate: s.startDate || "",
      language: s.language || "en",
    });
    setActiveCase({
      title: s.title,
      category: s.category,
      jurisdiction: s.location || "India",
      facts: [{ statement: s.narrative }],
    });
    go("intake");
  }

  function onSubmitted(result, submittedForm) {
    setAnalysis(result);
    setForm(submittedForm);
    setActiveCase({
      id: result.caseId || null,
      title: submittedForm?.title || result.summary?.headline,
      facts: result.facts || [],
      timeline: result.timeline?.events || [],
      category: submittedForm?.category || result.classification?.[0]?.id,
      jurisdiction: submittedForm?.location || "India",
    });
    // Also refresh workspace list in case a new case was created
    api.listCases().then((res) => {
      if (res?.cases) setWorkspaces(res.cases);
    });
    go("case");
    showToast("Workspace ready");
  }

  function reset() {
    setAnalysis(null);
    setForm(null);
    setActiveCase(null);
    setIntakePrefill(null);
    setPdfDoc(null);
    go("advocate");
    showToast("Case cleared from this browser session");
  }

  function usePdfText(doc) {
    setIntakePrefill((p) => ({
      ...(p || { category: "", language: "en" }),
      narrative: `${p?.narrative ? p.narrative + "\n\n" : ""}${doc.text.slice(0, 8000)}`,
    }));
    showToast("Extracted text placed into the narrative");
  }

  /* --- boot states --------------------------------------------------- */
  if (booting) {
    return (
      <>
        <TopBar route={route} go={go} health={health} hasCase={false} onReset={reset} />
        <Loading label="Starting JollyLLM…" />
      </>
    );
  }

  if (bootError) {
    return (
      <>
        <TopBar route={route} go={go} health={null} hasCase={false} onReset={reset} />
        <main className="section">
          <div className="shell shell--narrow">
            <Notice tone="warn" title="The JollyLLM service is not reachable">
              <p>{bootError.message}</p>
              <p style={{ marginTop: 10 }}>
                Start it with <code>npm start</code> in the <code>server</code> folder, then reload
                this page. The API listens on port 8787.
              </p>
            </Notice>
          </div>
        </main>
      </>
    );
  }

  const hasCase = Boolean(analysis);

  return (
    <>
      <TopBar route={route} go={go} health={health} hasCase={hasCase} onReset={reset} />
      <WorkspaceSwitcherBar
        workspaces={workspaces}
        activeCase={activeCase}
        onSelectWorkspace={selectWorkspace}
        onOpenDirectory={() => go("workspaces")}
        onNewWorkspace={() => go("new-workspace")}
        onDeleteWorkspace={handleDeleteWorkspace}
        loadingWorkspace={loadingWorkspace}
      />

      {route === "home" ? (
        <Landing
          meta={meta}
          health={health}
          samples={samples}
          onStart={() => go("intake")}
          onStartAdvocate={() => go("advocate")}
          onStartOpponent={() => go("opponent")}
          onOpenWorkspaces={() => go("workspaces")}
          onNewWorkspace={() => go("new-workspace")}
          onOpenSample={openSample}
          onBrowse={() => go("sources")}
        />
      ) : null}

      {route === "advocate" ? (
        <AdvocateChat
          onSubmitted={onSubmitted}
          onGoToOpponent={() => go("opponent")}
          onGoToForm={() => go("intake")}
          activeCase={activeCase}
          setActiveCase={setActiveCase}
          onToast={showToast}
        />
      ) : null}

      {route === "opponent" ? (
        <OpponentArena
          activeCase={activeCase}
          onGoToAdvocate={() => go("advocate")}
          onToast={showToast}
        />
      ) : null}

      {route === "intake" ? (
        <Intake
          categories={meta?.categories || []}
          meta={meta}
          health={health}
          prefill={intakePrefill}
          pdfDoc={pdfDoc}
          onUsePdfText={usePdfText}
          onSubmitted={onSubmitted}
          onBack={() => go("home")}
        />
      ) : null}

      {route === "case" ? (
        analysis ? (
          <Workspace
            data={analysis}
            form={form}
            meta={meta}
            samples={samples}
            go={go}
            onReset={reset}
            caseId={activeCase?.id || ""}
            documents={activeCase?.documents || []}
            onDocumentsChanged={refreshDocuments}
            onDelete={() => {
              if (
                activeCase &&
                window.confirm(
                  `Permanently delete workspace "${activeCase.title}"?\n\nAll recorded facts, evidence, and chat history will be removed.`
                )
              ) {
                handleDeleteWorkspace(activeCase.id);
              }
            }}
            onToast={showToast}
          />
        ) : (
          <main style={{ paddingTop: 40, background: "var(--white)", minHeight: "85vh" }}>
            <div className="shell" style={{ maxWidth: 600, paddingTop: 60, textAlign: "center" }}>
              <span className="badge-note" style={{ display: "inline-block", marginBottom: 16 }}>
                Case Dossier
              </span>
              <h2 style={{ fontFamily: "var(--serif)", fontSize: "1.7rem", color: "var(--black)", margin: "0 0 12px" }}>
                {activeCase ? activeCase.title : "Select a Case Workspace"}
              </h2>
              <p style={{ color: "var(--gray-500)", fontSize: "0.92rem", lineHeight: 1.65, maxWidth: "54ch", margin: "0 auto 28px" }}>
                {loadingWorkspace
                  ? "Loading case data and running analysis..."
                  : activeCase?.facts?.length
                    ? "Analysis is ready. Click below to compile your full case dossier."
                    : "No case facts recorded yet. Use the AI Advocate to describe your dispute first."}
              </p>
              {loadingWorkspace ? (
                <Loading label="Loading..." />
              ) : (
                <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    onClick={() => activeCase && selectWorkspace(activeCase.id)}
                  >
                    Compile Dossier
                  </button>
                  <button
                    type="button"
                    className="btn btn--outline btn--sm"
                    onClick={() => go("advocate")}
                  >
                    Go to AI Advocate
                  </button>
                </div>
              )}
            </div>
          </main>
        )
      ) : null}

      {route === "lawyers" ? <FindLawyer meta={meta} /> : null}

      {route === "sources" ? (
        <Sources meta={meta} health={health} onBack={() => go("home")} />
      ) : null}

      {route === "workspaces" ? (
        <WorkspacesDirectory
          workspaces={workspaces}
          activeCase={activeCase}
          onSelectWorkspace={selectWorkspace}
          onDeleteWorkspace={handleDeleteWorkspace}
          onNavigateNewWorkspace={() => go("new-workspace")}
          go={go}
          meta={meta}
          health={health}
          loadingWorkspace={loadingWorkspace}
        />
      ) : null}

      {route === "new-workspace" ? (
        <NewWorkspaceInterview
          onCreateWorkspace={async (caseId) => {
            const listRes = await api.listCases();
            setWorkspaces(listRes?.cases || []);
            await selectWorkspace(caseId);
            go("advocate");
          }}
          onCancel={() => go("workspaces")}
          go={go}
          meta={meta}
          health={health}
          onToast={showToast}
        />
      ) : null}

      <Toast message={toast} />
    </>
  );
}