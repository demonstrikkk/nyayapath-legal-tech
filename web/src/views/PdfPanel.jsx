import { useRef, useState } from "react";
import { api } from "../api.js";
import { Empty, Icon, Notice, Tag } from "../ui.jsx";

const MAX_MB = 12;

/**
 * PDF upload for a case.
 *
 * When a case is given, the file is stored against that case: the server
 * keeps the extracted text, links it to the case, and pulls dates and facts
 * out of it. Without a case the file is only read, and the panel says so.
 */
export default function PdfPanel({ onExtracted, caseId = "", onStored }) {
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [doc, setDoc] = useState(null);
  const [err, setErr] = useState(null);

  async function handle(file) {
    if (!file) return;
    setErr(null);
    setDoc(null);

    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
      setErr({
        code: "wrong_type",
        title: "That is not a PDF",
        detail: `“${file.name}” does not look like a PDF. Export the document to PDF and upload that.`,
      });
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setErr({
        code: "too_large",
        title: "That file is too large",
        detail: `It is ${(file.size / 1024 / 1024).toFixed(1)} MB and the limit is ${MAX_MB} MB. Split it, or remove scanned images.`,
      });
      return;
    }
    if (file.size === 0) {
      setErr({
        code: "empty",
        title: "That file is empty",
        detail: "The file has no content. Export it again from the original application.",
      });
      return;
    }

    setBusy(true);
    setProgress(0);
    try {
      const result = caseId
        ? await api.uploadCaseDocument(caseId, file, setProgress)
        : await api.extractPdf(file, setProgress);
      if (caseId && result?.ok === false) {
        setErr({
          code: result.code,
          title: result.title || "The document could not be read",
          detail: result.detail || "The file was not stored.",
          payload: result,
        });
        return;
      }
      setDoc(result);
      onExtracted?.(result);
      if (caseId) await onStored?.(result);
    } catch (e) {
      setErr({
        code: e.code || "failed",
        title: "The document could not be read",
        detail: e.message,
        payload: e.payload,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="pdfbox no-print">
      <div className="pdfbox__head">
        <h3>Upload a case document</h3>
        <span style={{ fontSize: "0.78rem", color: "var(--ink-faint)" }}>
          PDF only · up to {MAX_MB} MB · text layer only, no OCR
        </span>
      </div>

      <div style={{ padding: 20 }}>
        <div
          className="drop"
          data-over={String(over)}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            handle(e.dataTransfer.files?.[0]);
          }}
        >
          <Icon name="upload" size={22} />
          <h3 style={{ marginTop: 10 }}>
            {busy ? `Reading the document… ${progress}%` : "Drop a PDF here"}
          </h3>
          <p>
            A notice, an FIR copy, a medical record or a written complaint. We read the text layer
            and pull out dates and facts. Scanned pages have no text layer, and this build cannot
            read them.
          </p>
          <button
            className="btn btn--primary btn--sm"
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            Choose a file
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(e) => {
              handle(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>

        {err ? (
          <div style={{ marginTop: 16 }}>
            <Notice tone="warn" title={err.title}>
              <p>{err.detail}</p>
              {err.payload?.ocrAvailable === false ? (
                <p style={{ marginTop: 8 }}>
                  <b>What to do instead.</b> Type the facts into the case narrative, or scan the pages
                  with a tool that produces a text layer, then upload the result.
                </p>
              ) : null}
            </Notice>
          </div>
        ) : null}

        {doc?.ok ? (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              <Tag tone="strong">{doc.pages} pages</Tag>
              <Tag tone="plain">{doc.charCount.toLocaleString("en-IN")} characters</Tag>
              <Tag tone="plain">{doc.wordCount.toLocaleString("en-IN")} words</Tag>
              <Tag tone="plain">{doc.language.label}</Tag>
              <Tag tone="strong">{doc.dates.length} date(s) found</Tag>
              <Tag tone="moderate">{doc.facts.length} fact(s) extracted</Tag>
            </div>

            {doc.notices?.map((n, i) => (
              <Notice key={i} tone={n.tone === "warn" ? "warn" : "info"}>
                {n.text}
              </Notice>
            ))}

            <div style={{ maxHeight: 260, overflowY: "auto", border: "1px solid var(--ivory-300)", borderRadius: "var(--radius)", background: "#fff", padding: 14, fontSize: "0.8rem", lineHeight: 1.6, color: "var(--ink-soft)" }}>
              <b style={{ display: "block", marginBottom: 6, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--brass-600)" }}>
                Extracted text {doc.truncated ? "(first part only)" : ""}
              </b>
              {doc.preview}
            </div>

            {doc.timeline.events.length ? (
              <div style={{ marginTop: 14 }}>
                <p style={{ margin: "0 0 6px", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--brass-600)", fontWeight: 600 }}>
                  Dates found in the document
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {doc.dates.slice(0, 14).map((d, i) => (
                    <span key={i} className="tag tag--plain">
                      {d.text}
                      {d.needsReview ? " ?" : ""}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 14 }}>
                <Empty title="No dates in this document" icon="clock">
                  That is not a problem in itself, but dates decide the order of events.
                </Empty>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}