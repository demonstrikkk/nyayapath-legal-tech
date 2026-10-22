import { useState } from "react";
import { api } from "../api.js";
import { Empty, Icon, Notice, Tag } from "../ui.jsx";

function size(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The documents already stored against one workspace.
 *
 * Each row is a file this workspace received: its name, size, page count and
 * the date it was taken in. The stored text can be read back, and a document
 * can be withdrawn. The list is built from the case the server returned, so
 * it only ever shows what belongs to that workspace.
 */
export default function CaseDocuments({ caseId, documents = [], onChanged, onToast }) {
  const [openId, setOpenId] = useState("");
  const [text, setText] = useState("");
  const [loadingId, setLoadingId] = useState("");
  const [busyId, setBusyId] = useState("");

  async function open(doc) {
    if (openId === doc.id) {
      setOpenId("");
      setText("");
      return;
    }
    setLoadingId(doc.id);
    try {
      const res = await api.getCaseDocument(caseId, doc.id);
      setOpenId(doc.id);
      setText(res?.document?.extracted_text || "");
    } catch (err) {
      onToast?.(`Could not read the document: ${err.message}`);
    } finally {
      setLoadingId("");
    }
  }

  async function remove(doc) {
    if (!window.confirm(`Remove "${doc.filename}" from this workspace?`)) return;
    setBusyId(doc.id);
    try {
      await api.deleteCaseDocument(caseId, doc.id);
      if (openId === doc.id) {
        setOpenId("");
        setText("");
      }
      await onChanged?.();
      onToast?.("Document removed from this workspace");
    } catch (err) {
      onToast?.(`Could not remove the document: ${err.message}`);
    } finally {
      setBusyId("");
    }
  }

  if (!documents.length) {
    return (
      <div className="panel" style={{ marginTop: 22 }}>
        <div className="panel__head">
          <div>
            <h3>
              <Icon name="doc" size={15} /> Documents in this workspace
            </h3>
            <p>Nothing has been filed here yet</p>
          </div>
        </div>
        <div style={{ padding: 18 }}>
          <Empty title="No documents in this workspace" icon="doc">
            Upload a notice, agreement, receipt or statement above. It is stored against this
            workspace only.
          </Empty>
        </div>
      </div>
    );
  }

  return (
    <div className="panel" style={{ marginTop: 22 }}>
      <div className="panel__head">
        <div>
          <h3>
            <Icon name="doc" size={15} /> Documents in this workspace
          </h3>
          <p>
            {documents.length} file{documents.length === 1 ? "" : "s"} held against this case only
          </p>
        </div>
      </div>
      <div style={{ padding: 8, display: "grid", gap: 2 }}>
        {documents.map((doc) => (
          <div key={doc.id} style={{ padding: "10px 12px", borderBottom: "1px solid var(--ivory-200)" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
                justifyContent: "space-between",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: "0.87rem",
                    color: "var(--navy-800)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {doc.filename}
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                    marginTop: 4,
                    fontSize: "0.72rem",
                    color: "var(--ink-faint)",
                  }}
                >
                  <Tag tone="plain">{size(doc.size_bytes)}</Tag>
                  <Tag tone="plain">{doc.page_count || 1} page(s)</Tag>
                  <Tag tone="plain">
                    {new Date(doc.created_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </Tag>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  className="btn btn--outline btn--sm"
                  onClick={() => open(doc)}
                  disabled={loadingId === doc.id}
                >
                  {loadingId === doc.id ? "Reading..." : openId === doc.id ? "Hide text" : "View text"}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => remove(doc)}
                  disabled={busyId === doc.id}
                  title="Remove this document from the workspace"
                  style={{ color: "#dc2626" }}
                >
                  <Icon name="trash" size={12} />
                </button>
              </div>
            </div>

            {openId === doc.id ? (
              <div
                style={{
                  marginTop: 10,
                  maxHeight: 260,
                  overflowY: "auto",
                  border: "1px solid var(--ivory-300)",
                  borderRadius: "var(--radius)",
                  background: "#fff",
                  padding: 14,
                  fontSize: "0.8rem",
                  lineHeight: 1.6,
                  color: "var(--ink-soft)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {text || "No text could be read from this file."}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <Notice tone="info" title="Where these live">
        <p>
          Each document is stored against this workspace and is reachable only through it. Removing
          one here deletes the stored text from this case.
        </p>
      </Notice>
    </div>
  );
}
