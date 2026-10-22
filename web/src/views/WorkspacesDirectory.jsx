import { useState } from "react";
import { Icon, Tag } from "../ui.jsx";
import { Footer } from "./Landing.jsx";

const CATEGORY_MAP = {
  "domestic-violence": {
    label: "Domestic Violence & Shared Household",
    act: "Protection of Women from Domestic Violence Act, 2005 / BNS 85",
    color: "#feb2b2",
    badge: "rgba(229, 62, 62, 0.15)",
    border: "rgba(229, 62, 62, 0.4)",
  },
  "cheque-bounce": {
    label: "Dishonour of Cheque (Sec. 138 NI Act)",
    act: "Negotiable Instruments Act, 1881 / BNSS Summary Procedure",
    color: "#fbd38d",
    badge: "rgba(221, 107, 32, 0.15)",
    border: "rgba(221, 107, 32, 0.4)",
  },
  "tenancy-eviction": {
    label: "Unlawful Eviction & Rent Control",
    act: "State Rent Control Acts / Transfer of Property Act, 1882",
    color: "#9ae6b4",
    badge: "rgba(56, 161, 105, 0.15)",
    border: "rgba(56, 161, 105, 0.4)",
  },
  "consumer-dispute": {
    label: "Consumer Protection & Banking Fraud",
    act: "Consumer Protection Act, 2019 / RBI Ombudsman Directions",
    color: "#90cdf4",
    badge: "rgba(49, 130, 206, 0.15)",
    border: "rgba(49, 130, 206, 0.4)",
  },
  "employment-wage": {
    label: "Wage Recovery & Unlawful Termination",
    act: "Industrial Relations Code / Payment of Wages Act",
    color: "#d6bcfa",
    badge: "rgba(128, 90, 213, 0.15)",
    border: "rgba(128, 90, 213, 0.4)",
  },
  "civil-other": {
    label: "General Civil & Property Dispute",
    act: "Code of Civil Procedure, 1908 / Specific Relief Act",
    color: "var(--linen-300)",
    badge: "rgba(255, 255, 255, 0.05)",
    border: "rgba(255, 255, 255, 0.15)",
  },
};

export default function WorkspacesDirectory({
  workspaces = [],
  activeCase,
  onSelectWorkspace,
  onDeleteWorkspace,
  onNavigateNewWorkspace,
  go,
  meta,
  health,
  loadingWorkspace,
}) {
  const [filterCategory, setFilterCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);

  const filteredWorkspaces = workspaces.filter((ws) => {
    if (filterCategory !== "all" && ws.category !== filterCategory) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = (ws.title || "").toLowerCase().includes(q);
      const matchJuris = (ws.jurisdiction || "").toLowerCase().includes(q);
      const matchCat = (ws.category || "").toLowerCase().includes(q);
      return matchTitle || matchJuris || matchCat;
    }
    return true;
  });

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
            gap: 16,
            background: "var(--white)",
          }}
        >
          <div>
            <span className="badge-note" style={{ marginBottom: 4, display: "block" }}>
              Workspaces Directory
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
              Active Case Workspaces
            </h1>
            <p style={{ maxWidth: "68ch", color: "var(--text-soft)", margin: "4px 0 0", fontSize: "0.86rem", lineHeight: 1.55 }}>
              Each workspace keeps its own factual record, the documents filed against it, its chat
              history, and its opponent simulations. Nothing filed in one workspace is visible from
              another.
            </p>
          </div>

          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={onNavigateNewWorkspace}
          >
            + Register New Case
          </button>
        </div>

        <div className="shell" style={{ padding: "24px 24px" }}>
          {/* Active Workspace Banner if selected */}
          {activeCase ? (
            <div
              style={{
                marginBottom: 24,
                padding: "18px 22px",
                background: "var(--gray-50)",
                border: "2px solid var(--black)",
                borderRadius: "var(--radius-lg)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 16,
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span
                    style={{
                      color: "var(--black)",
                      fontSize: "0.7rem",
                      fontFamily: "var(--mono)",
                      fontWeight: 700,
                      background: "var(--white)",
                      border: "1px solid var(--border)",
                      padding: "2px 8px",
                      borderRadius: "var(--radius)",
                    }}
                  >
                    ★ CURRENTLY ACTIVE WORKSPACE
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: "0.7rem",
                      color: "var(--text-soft)",
                    }}
                  >
                    {activeCase.jurisdiction || "India"}
                  </span>
                </div>
                <h2 style={{ fontFamily: "var(--serif)", fontSize: "1.25rem", color: "var(--black)", margin: "4px 0 4px" }}>
                  {activeCase.title}
                </h2>
                <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-soft)", fontFamily: "var(--mono)" }}>
                  Domain: <b style={{ color: "var(--black)" }}>{activeCase.category}</b> · Facts:{" "}
                  <b>{activeCase.facts?.length || 0} recorded</b> · Dates:{" "}
                  <b>{activeCase.timeline?.length || 0} recorded</b>
                </p>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={() => go("advocate")}
                >
                  Consult Advocate 🛡️
                </button>
                <button
                  type="button"
                  className="btn btn--outline btn--sm"
                  onClick={() => go("opponent")}
                >
                  Opponent Simulator ⚔️
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => go("case")}
                >
                  View Dossier 📋
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  style={{ color: "#dc2626", borderColor: "var(--border)" }}
                  onClick={() => setDeleteTarget(activeCase)}
                  title="Delete active workspace"
                >
                  <Icon name="trash" size={12} />
                  Delete
                </button>
              </div>
            </div>
          ) : null}

          {/* Controls: Search and Category Filter */}
          <div
            style={{
              padding: "14px 18px",
              marginBottom: 24,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 16,
              background: "var(--gray-50)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
            }}
          >
            <div style={{ flex: 1, minWidth: "260px" }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search matter title, city jurisdiction, or statute..."
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: "var(--radius)",
                  background: "var(--white)",
                  border: "1px solid var(--border-strong)",
                  color: "var(--text)",
                  fontSize: "0.88rem",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: "0.72rem", fontFamily: "var(--mono)", color: "var(--text-faint)", textTransform: "uppercase" }}>
                Domain:
              </span>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                style={{
                  padding: "7px 12px",
                  borderRadius: "var(--radius)",
                  background: "var(--white)",
                  border: "1px solid var(--border-strong)",
                  color: "var(--text)",
                  fontSize: "0.82rem",
                  fontFamily: "var(--sans)",
                }}
              >
                <option value="all">All Domains ({workspaces.length})</option>
                <option value="domestic-violence">Domestic Violence</option>
                <option value="cheque-bounce">Cheque Bounce (Sec. 138)</option>
                <option value="tenancy-eviction">Tenancy &amp; Eviction</option>
                <option value="consumer-dispute">Consumer Dispute</option>
                <option value="employment-wage">Employment &amp; Wages</option>
                <option value="civil-other">General Civil</option>
              </select>
            </div>
          </div>

          {/* Workspaces Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 20 }}>
            {filteredWorkspaces.map((ws) => {
              const isActive = activeCase?.id === ws.id;
              const catInfo = CATEGORY_MAP[ws.category] || CATEGORY_MAP["civil-other"];

              return (
                <div
                  key={ws.id}
                  style={{
                    padding: "20px 22px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    borderRadius: "var(--radius-lg)",
                    border: `1px solid ${isActive ? "var(--black)" : "var(--border)"}`,
                    background: isActive ? "var(--gray-50)" : "var(--white)",
                    boxShadow: isActive ? "0 4px 16px rgba(0,0,0,0.08)" : "var(--shadow-sm)",
                    position: "relative",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <span
                        style={{
                          fontSize: "0.7rem",
                          fontFamily: "var(--mono)",
                          background: "var(--gray-100)",
                          color: "var(--black)",
                          padding: "3px 8px",
                          borderRadius: "var(--radius)",
                          fontWeight: 600,
                        }}
                      >
                        {catInfo.label}
                      </span>
                      {isActive ? (
                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontFamily: "var(--mono)",
                            background: "var(--black)",
                            color: "var(--white)",
                            padding: "2px 8px",
                            borderRadius: "var(--radius)",
                            fontWeight: 700,
                          }}
                        >
                          ACTIVE
                        </span>
                      ) : (
                        <span style={{ fontSize: "0.74rem", fontFamily: "var(--mono)", color: "var(--text-faint)" }}>
                          {ws.jurisdiction || "India"}
                        </span>
                      )}
                    </div>

                    <h3
                      style={{
                        fontFamily: "var(--serif)",
                        fontSize: "1.15rem",
                        color: "var(--black)",
                        margin: "0 0 8px",
                        fontWeight: 700,
                        lineHeight: 1.4,
                      }}
                    >
                      {ws.title}
                    </h3>

                    <p style={{ margin: "0 0 14px", fontSize: "0.8rem", color: "var(--text-soft)", lineHeight: 1.5 }}>
                      <b>Statutory Framework:</b> {catInfo.act}
                    </p>

                    <div
                      style={{
                        background: "var(--gray-50)",
                        padding: "8px 12px",
                        borderRadius: "var(--radius)",
                        marginBottom: 16,
                        border: "1px solid var(--border)",
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "0.72rem",
                        fontFamily: "var(--mono)",
                        color: "var(--text-soft)",
                      }}
                    >
                      <div>
                        <span style={{ color: "var(--black)", fontWeight: 700 }}>ID:</span>{" "}
                        {ws.id.slice(0, 14)}...
                      </div>
                      <div>
                        <span style={{ color: "var(--black)", fontWeight: 700 }}>FORUM:</span>{" "}
                        {ws.jurisdiction || "National"}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button
                      type="button"
                      className={`btn ${isActive ? "btn--primary" : "btn--outline"} btn--sm`}
                      style={{ flex: 1, justifyContent: "center" }}
                      disabled={loadingWorkspace && isActive}
                      onClick={async () => {
                        await onSelectWorkspace(ws.id);
                        go("advocate");
                      }}
                    >
                      {isActive ? "Active: Open Advocate 🛡️" : "Select & Open Workspace →"}
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      style={{ color: "#dc2626", borderColor: "var(--border)", padding: "0 10px", flexShrink: 0 }}
                      title={`Delete workspace: ${ws.title}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(ws);
                      }}
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Create New Workspace Card Gateway */}
            <div
              style={{
                padding: "24px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                textAlign: "center",
                border: "2px dashed var(--border-strong)",
                borderRadius: "var(--radius-lg)",
                background: "var(--gray-50)",
                minHeight: "240px",
              }}
            >
              <span style={{ fontSize: "2rem", marginBottom: 10 }}>⚖️</span>
              <h3 style={{ fontFamily: "var(--serif)", fontSize: "1.15rem", color: "var(--black)", margin: "0 0 6px" }}>
                Register New Case Workspace
              </h3>
              <p style={{ fontSize: "0.82rem", color: "var(--text-soft)", maxWidth: "32ch", margin: "0 0 16px", lineHeight: 1.5 }}>
                Undergo an AI Senior Advocate intake interview to extract facts, attach documents, and configure a dedicated workspace.
              </p>
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={onNavigateNewWorkspace}
              >
                + Start Intake Interview
              </button>
            </div>
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {deleteTarget && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0, 0, 0, 0.45)",
              backdropFilter: "blur(2px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 9999,
              padding: 16,
            }}
            onClick={() => setDeleteTarget(null)}
          >
            <div
              style={{
                background: "var(--white)",
                border: "1px solid var(--border-strong)",
                borderRadius: "var(--radius-lg)",
                padding: "28px 24px 24px",
                maxWidth: "460px",
                width: "100%",
                boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: "50%",
                    background: "#fee2e2",
                    color: "#dc2626",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon name="trash" size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.1rem", fontFamily: "var(--serif)", color: "var(--black)" }}>
                    Delete Case Workspace
                  </h3>
                  <span style={{ fontSize: "0.74rem", color: "var(--text-soft)", fontFamily: "var(--mono)" }}>
                    Action cannot be undone
                  </span>
                </div>
              </div>

              <p style={{ fontSize: "0.88rem", color: "var(--text)", lineHeight: 1.5, margin: "0 0 12px" }}>
                Are you sure you want to delete <b style={{ color: "var(--black)" }}>"{deleteTarget.title}"</b>?
              </p>
              <div
                style={{
                  fontSize: "0.78rem",
                  color: "var(--text-soft)",
                  lineHeight: 1.5,
                  margin: "0 0 24px",
                  background: "var(--gray-50)",
                  padding: "10px 14px",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)",
                }}
              >
                ⚠️ All associated facts, uploaded evidence, consultation messages, research results, and opponent simulations will be permanently erased.
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button
                  type="button"
                  className="btn btn--outline btn--sm"
                  onClick={() => setDeleteTarget(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn--sm"
                  style={{ background: "#dc2626", color: "#fff", borderColor: "#dc2626" }}
                  onClick={async () => {
                    const targetId = deleteTarget.id;
                    setDeleteTarget(null);
                    if (onDeleteWorkspace) {
                      await onDeleteWorkspace(targetId);
                    }
                  }}
                >
                  <Icon name="trash" size={12} />
                  Delete Workspace
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <Footer meta={meta} health={health} />
    </>
  );
}
