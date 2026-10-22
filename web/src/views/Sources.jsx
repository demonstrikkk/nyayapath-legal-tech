import { useEffect, useMemo, useState } from "react";
import { api, API_BASE } from "../api.js";
import { Empty, Notice, Loading } from "../ui.jsx";
import { Footer } from "./Landing.jsx";

const ORIGINS = {
  curated: "Curated",
  imported: "Imported",
};

const TIERS = {
  local: "Local",
  regional: "Regional",
  national: "National",
};

/** Imported records are external input: only render ordinary web links. */
function safeSource(value) {
  const text = String(value || "").trim();
  return /^https?:\/\//i.test(text) ? text : "";
}

const style = {
  panel: { padding: "20px 24px" },
  label: {
    fontFamily: "var(--mono)",
    fontSize: "0.74rem",
    color: "var(--brass-300)",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  input: {
    background: "var(--noir-950)",
    border: "1px solid var(--noir-700)",
    color: "var(--linen-100)",
    borderRadius: 3,
    padding: "10px 14px",
    fontSize: "0.92rem",
    width: "100%",
  },
  muted: { color: "var(--linen-400)", fontSize: "0.8rem" },
};

function Badge({ children, tone = "brass" }) {
  const palette = tone === "local"
    ? { color: "var(--white)", border: "var(--black)", background: "var(--black)" }
    : tone === "regional"
      ? { color: "var(--black)", border: "var(--gray-500)", background: "var(--white)" }
      : tone === "imported"
        ? { color: "var(--text-soft)", border: "var(--gray-200)", background: "var(--gray-50)" }
        : { color: "var(--text)", border: "var(--gray-300)", background: "var(--white)" };
  return (
    <span
      style={{
        fontFamily: "var(--mono)",
        fontSize: "0.68rem",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        padding: "2px 7px",
        borderRadius: 2,
        border: `1px solid ${palette.border}`,
        background: palette.background,
        color: palette.color,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function RecordBadges({ record }) {
  return (
    <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
      {record.tier ? <Badge tone={record.tier}>{TIERS[record.tier] || record.tier}</Badge> : null}
      {record.state ? <Badge>{record.state}</Badge> : null}
      <Badge tone={record.origin === "imported" ? "imported" : "brass"}>
        {ORIGINS[record.origin] || "Curated"}
      </Badge>
    </span>
  );
}

function Provenance({ record }) {
  const provenance = record.provenance;
  if (!provenance) return null;
  const sourceUrl = safeSource(provenance.source_url);
  const quotes = Object.entries(provenance.quotes || {}).filter(
    ([, quote]) => String(quote || "").trim(),
  );
  return (
    <details
      style={{
        marginTop: 10,
        background: "var(--noir-950)",
        border: "1px solid var(--noir-700)",
        borderRadius: 3,
        padding: "10px 14px",
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          color: "var(--brass-300)",
          fontFamily: "var(--mono)",
          fontSize: "0.74rem",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        Source &amp; verification
      </summary>
      <dl style={{ margin: "10px 0 0", fontSize: "0.78rem", lineHeight: 1.6 }}>
        {sourceUrl ? (
          <>
            <dt style={style.muted}>Source</dt>
            <dd style={{ margin: "0 0 6px", wordBreak: "break-all" }}>
              <a
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
                style={{ color: "var(--brass-300)" }}
              >
                {sourceUrl}
              </a>
            </dd>
          </>
        ) : null}
        {provenance.retrieved_at ? (
          <>
            <dt style={style.muted}>Retrieved</dt>
            <dd style={{ margin: "0 0 6px" }}>{provenance.retrieved_at}</dd>
          </>
        ) : null}
        {provenance.verification ? (
          <>
            <dt style={style.muted}>Verification</dt>
            <dd style={{ margin: "0 0 6px" }}>{provenance.verification}</dd>
          </>
        ) : null}
        {provenance.content_hash ? (
          <>
            <dt style={style.muted}>Content hash</dt>
            <dd style={{ margin: "0 0 6px", fontFamily: "var(--mono)", wordBreak: "break-all" }}>
              {provenance.content_hash}
            </dd>
          </>
        ) : null}
      </dl>
      {quotes.length ? (
        <div style={{ marginTop: 8, borderTop: "1px solid var(--noir-700)", paddingTop: 8 }}>
          <span style={style.label}>Quote-backed evidence</span>
          {quotes.slice(0, 4).map(([name, quote]) => (
            <div key={name} style={{ marginTop: 8 }}>
              <b style={{ fontSize: "0.74rem", color: "var(--linen-300)", textTransform: "capitalize" }}>
                {name.replace(/_/g, " ")}
              </b>
              <p
                style={{
                  margin: "3px 0 0",
                  fontSize: "0.8rem",
                  color: "var(--linen-100)",
                  lineHeight: 1.55,
                  maxHeight: 180,
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                }}
              >
                {quote}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </details>
  );
}

function ProvisionCard({ p, acts, categories }) {
  const act = acts[p.act] || {};
  const actTitle = p.actShortTitle || act.shortTitle || p.act;
  const source = safeSource(p.sourceUrl || p.provenance?.source_url || act.sourceUrl);
  const category = p.category
    ? categories.find((c) => c.id === p.category)?.label || p.category
    : null;
  const quote = p.provenance?.quotes?.summary || p.provenance?.quotes?.holding;

  return (
    <article className="card-enclave" style={style.panel}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
            <span
              style={{
                fontFamily: "var(--mono)",
                fontSize: "0.8rem",
                fontWeight: 700,
                color: "var(--black)",
                background: "var(--gray-100)",
                border: "1px solid var(--gray-200)",
                padding: "2px 7px",
                borderRadius: 2,
              }}
            >
              {p.section ? `Sec. ${p.section}` : p.id}
            </span>
            <span style={{ ...style.muted, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {actTitle}
            </span>
            <RecordBadges record={p} />
            {category ? <Badge>{category}</Badge> : null}
          </div>

          <h3 style={{ fontFamily: "var(--serif)", fontSize: "1.18rem", color: "var(--black)", margin: "4px 0 8px", fontWeight: 500 }}>
            {p.heading || p.id}
          </h3>
          {p.summary ? (
            <p style={{ margin: "0 0 10px", color: "var(--linen-200)", fontSize: "0.9rem", lineHeight: 1.6 }}>
              {p.summary}
            </p>
          ) : null}

          {p.whyItMatters?.trim() ? (
            <details style={{ marginBottom: 8 }}>
              <summary style={{ cursor: "pointer", color: "var(--brass-300)", fontSize: "0.78rem" }}>
                Why it matters
              </summary>
              <p style={{ margin: "6px 0 0", color: "var(--linen-200)", fontSize: "0.84rem", lineHeight: 1.55 }}>
                {p.whyItMatters}
              </p>
            </details>
          ) : quote ? (
            <p
              style={{
                margin: "0 0 8px",
                borderLeft: "2px solid var(--brass-400)",
                paddingLeft: 10,
                color: "var(--linen-300)",
                fontSize: "0.82rem",
                lineHeight: 1.55,
              }}
            >
              “{quote}”
            </p>
          ) : null}

          <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", fontSize: "0.78rem" }}>
            {source ? (
              <a href={source} target="_blank" rel="noreferrer" style={{ color: "var(--brass-300)", fontFamily: "var(--mono)" }}>
                {p.sourceLabel || act.sourceLabel || "Source"} ↗
              </a>
            ) : null}
            {p.citation ? <span style={style.muted}>{p.citation}</span> : null}
            {typeof p.score === "number" ? (
              <span style={style.muted}>Sparse score {p.score.toFixed(3)}</span>
            ) : null}
          </div>

          <Provenance record={p} />
        </div>
      </div>
    </article>
  );
}

function JudgmentCard({ j }) {
  const source = safeSource(j.sourceUrl || j.provenance?.source_url);
  return (
    <article className="card-enclave" style={style.panel}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontFamily: "var(--serif)", fontSize: "1.18rem", color: "var(--black)", margin: "0 0 6px", fontWeight: 500 }}>
            {j.title}
          </h3>
          <p style={{ margin: "0 0 8px", fontFamily: "var(--mono)", fontSize: "0.78rem", color: "var(--brass-300)" }}>
            <span>{j.citation}</span>
            {j.court ? <> · <span>{j.court}</span></> : null}
            {j.year ? <> · <span>{j.year}</span></> : null}
          </p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            <RecordBadges record={j} />
            {(j.categories || []).slice(0, 3).map((c) => (
              <Badge key={c}>{c}</Badge>
            ))}
          </div>
        </div>
      </div>

      {j.factsPattern ? (
        <div style={{ background: "var(--noir-950)", border: "1px solid var(--noir-700)", padding: "12px 16px", borderRadius: 3, marginBottom: 10 }}>
          <span style={style.label}>Facts it turned on</span>
          <p style={{ margin: "4px 0 0", color: "var(--linen-100)", fontSize: "0.86rem", lineHeight: 1.6 }}>
            {j.factsPattern}
          </p>
        </div>
      ) : null}

      {j.ratio || j.holding ? (
        <details style={{ marginBottom: 8 }}>
          <summary style={{ cursor: "pointer", color: "var(--brass-300)", fontSize: "0.78rem" }}>
            {j.ratio ? "The principle it stands for" : "What the Court held"}
          </summary>
          <p style={{ margin: "6px 0 0", color: "var(--linen-100)", fontSize: "0.86rem", lineHeight: 1.6 }}>
            {j.ratio || j.holding}
          </p>
        </details>
      ) : null}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", fontSize: "0.78rem" }}>
        {source ? (
          <a href={source} target="_blank" rel="noreferrer" style={{ color: "var(--brass-300)", fontFamily: "var(--mono)" }}>
            Read the source ↗
          </a>
        ) : null}
        <a
          href={`https://indiankanoon.org/search/?formInput=${encodeURIComponent(j.citation || j.title)}`}
          target="_blank"
          rel="noreferrer"
          style={{ color: "var(--linen-300)", fontFamily: "var(--mono)" }}
        >
          Verify on Indian Kanoon ↗
        </a>
      </div>

      <Provenance record={j} />
    </article>
  );
}

function haystack(record) {
  const provenance = record.provenance || {};
  return [
    record.id, record.act, record.section, record.heading, record.title,
    record.summary, record.whyItMatters, record.citation, record.court,
    record.factsPattern, record.holding, record.ratio,
    ...(record.keywords || []), ...(record.signalTerms || []),
    record.category, ...(record.categories || []),
    ...Object.values(provenance.quotes || {}),
  ].filter(Boolean).join(" ").toLowerCase();
}

function matches(record, filters, kind) {
  if (filters.q) {
    const text = haystack(record);
    if (!filters.q.toLowerCase().split(/\s+/).every((token) => text.includes(token))) {
      return false;
    }
  }
  if (filters.category) {
    const categories = kind === "judgment"
      ? record.categories || []
      : record.category ? [record.category] : [];
    if (!categories.includes(filters.category)) return false;
  }
  if (filters.act && record.act !== filters.act) return false;
  if (filters.tier && String(record.tier || "").toLowerCase() !== filters.tier.toLowerCase()) return false;
  if (filters.state && String(record.state || "").toLowerCase() !== filters.state.toLowerCase()) return false;
  if (filters.origin && (record.origin || (record.provenance ? "imported" : "curated")) !== filters.origin) return false;
  return true;
}

function Stat({ value, label, detail }) {
  return (
    <div className="card-enclave" style={{ padding: "16px 18px" }}>
      <p style={{ margin: 0, fontFamily: "var(--serif)", fontSize: "1.6rem", color: "var(--black)" }}>{value}</p>
      <p style={{ margin: "2px 0 0", ...style.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</p>
      {detail ? <p style={{ margin: "4px 0 0", ...style.muted }}>{detail}</p> : null}
    </div>
  );
}

export default function Sources({ meta, health, onBack }) {
  const [tab, setTab] = useState("provisions");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [act, setAct] = useState("");
  const [tier, setTier] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [origin, setOrigin] = useState("");
  const [provisions, setProvisions] = useState([]);
  const [judgments, setJudgments] = useState([]);
  const [corpus, setCorpus] = useState(null);
  const [edition, setEdition] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [p, j, c, e] = await Promise.all([
          api.provisions(),
          api.judgments(),
          api.corpus(),
          api.edition().catch(() => null),
        ]);
        if (!alive) return;
        setProvisions(p.provisions || []);
        setJudgments(j.judgments || []);
        setCorpus(c);
        setEdition(e);
      } catch (err) {
        if (alive) setError(err);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const categories = meta?.categories || [];
  const acts = meta?.acts || {};
  const facets = corpus?.facets || {};
  const counts = corpus?.counts;
  const editionMeta = corpus?.edition || meta?.edition;

  const filters = useMemo(
    () => ({ q: query.trim(), category, act, tier, state: stateFilter, origin }),
    [query, category, act, tier, stateFilter, origin],
  );

  const filteredProvisions = useMemo(
    () => provisions.filter((p) => matches(p, filters, "provision")),
    [provisions, filters],
  );
  const filteredJudgments = useMemo(
    () => judgments.filter((j) => matches(j, filters, "judgment")),
    [judgments, filters],
  );

  const editionProvisions = edition?.provisions || [];
  const editionJudgments = edition?.judgments || [];
  const filteredEditionProvisions = useMemo(
    () => editionProvisions.filter((p) => matches(p, filters, "provision")),
    [editionProvisions, filters],
  );
  const filteredEditionJudgments = useMemo(
    () => editionJudgments.filter((j) => matches(j, filters, "judgment")),
    [editionJudgments, filters],
  );

  const hasFilters = Boolean(query || category || act || tier || stateFilter || origin);
  const clearFilters = () => {
    setQuery("");
    setCategory("");
    setAct("");
    setTier("");
    setStateFilter("");
    setOrigin("");
  };

  const tabs = [
    { id: "provisions", label: "Provisions", count: filteredProvisions.length },
    { id: "judgments", label: "Judgments", count: filteredJudgments.length },
    ...(edition
      ? [{
          id: "edition",
          label: "Imported edition",
          count: filteredEditionProvisions.length + filteredEditionJudgments.length,
        }]
      : []),
  ];

  return (
    <>
      <main className="section" style={{ paddingTop: 24, background: "var(--noir-950)", minHeight: "92vh" }}>
        <div className="shell">
          <div
            style={{
              marginBottom: 20,
              paddingBottom: 18,
              borderBottom: "1px solid var(--noir-700)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              flexWrap: "wrap",
              gap: 16,
            }}
          >
            <div>
              <span className="badge-note" style={{ marginBottom: 6 }}>
                [ LEGAL CORPUS &amp; DATASET PROVENANCE ]
              </span>
              <h1 style={{ fontFamily: "var(--serif)", fontSize: "2.1rem", color: "var(--black)", margin: "4px 0 8px", fontWeight: 400, letterSpacing: "-0.01em" }}>
                The Complete <em>Legal Corpus</em>
              </h1>
              <p style={{ maxWidth: "72ch", color: "var(--linen-300)", margin: 0, fontSize: "0.92rem", lineHeight: 1.6 }}>
                Every record JollyLLM can retrieve: the hand-curated corpus plus the imported datagoblin legal edition.
                Curated records win on overlap; imported records add coverage and carry their source, quote and verification.
              </p>
            </div>
            {onBack ? (
              <button className="btn btn--outline btn--sm" onClick={onBack} type="button">
                ← BACK
              </button>
            ) : null}
          </div>

          {counts ? (
            <div className="grid-3" style={{ gap: 12, marginBottom: 16 }}>
              <Stat
                value={counts.merged.total}
                label="Merged records"
                detail={`${counts.merged.provisions} provisions · ${counts.merged.judgments} judgments`}
              />
              <Stat
                value={counts.curated.total}
                label="Curated"
                detail={`${counts.curated.provisions} provisions · ${counts.curated.judgments} judgments`}
              />
              <Stat
                value={counts.imported.total}
                label="Imported net-new"
                detail={`${counts.imported.provisions} provisions · ${counts.imported.judgments} judgments`}
              />
            </div>
          ) : null}

          {editionMeta ? (
            <div className="card-enclave" style={{ ...style.panel, marginBottom: 16, display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <div>
                <span style={style.label}>Synced edition</span>
                <p style={{ margin: "4px 0 2px", color: "var(--black)", fontFamily: "var(--serif)", fontSize: "1.05rem" }}>
                  {editionMeta.name || "legal edition"} {editionMeta.version ? `v${editionMeta.version}` : ""}
                </p>
                <p style={{ margin: 0, ...style.muted }}>
                  {counts?.edition
                    ? `${counts.edition.provisions} provisions · ${counts.edition.judgments} judgments from the scraped dataset`
                    : "Imported records are merged into the corpus above."}
                  {editionMeta.generatedAt ? ` · generated ${editionMeta.generatedAt}` : ""}
                  {editionMeta.homeJurisdiction ? ` · home ${editionMeta.homeJurisdiction}` : ""}
                </p>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <a className="btn btn--outline btn--sm" href={`${API_BASE}/corpus/export.csv`} download>
                  MERGED CSV ↓
                </a>
                {edition ? (
                  <a className="btn btn--outline btn--sm" href={`${API_BASE}/corpus/export.csv?scope=edition`} download>
                    EDITION CSV ↓
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="card-enclave" style={{ ...style.panel, marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
              <div>
                <span style={style.label}>Browse the dataset</span>
                <p style={{ margin: "2px 0 0", ...style.muted }}>
                  {hasFilters
                    ? `${filteredProvisions.length + filteredJudgments.length} merged records match the filters`
                    : "All records, not only the ones retrieved for a case."}
                </p>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {tabs.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="tech-pill"
                    onClick={() => setTab(item.id)}
                    style={{
                      cursor: "pointer",
                      background: tab === item.id ? "var(--black)" : "transparent",
                      borderColor: tab === item.id ? "var(--black)" : "var(--border)",
                      color: tab === item.id ? "var(--white)" : "var(--text-soft)",
                    }}
                  >
                    {item.label.toUpperCase()} ({item.count})
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="corpus-q" style={style.label}>Search</label>
                <input
                  id="corpus-q"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="primary evidence, bail, BSA 57"
                  style={style.input}
                />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="corpus-category" style={style.label}>Issue domain</label>
                <select id="corpus-category" value={category} onChange={(e) => setCategory(e.target.value)} style={style.input}>
                  <option value="">All domains</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="corpus-act" style={style.label}>Act</label>
                <select id="corpus-act" value={act} onChange={(e) => setAct(e.target.value)} style={style.input}>
                  <option value="">All acts</option>
                  {Object.entries(acts)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([code, a]) => (
                      <option key={code} value={code}>{a.shortTitle || code}</option>
                    ))}
                </select>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="corpus-tier" style={style.label}>Tier</label>
                <select id="corpus-tier" value={tier} onChange={(e) => setTier(e.target.value)} style={style.input}>
                  <option value="">All tiers</option>
                  {Object.keys(facets.tiers || {}).map((value) => (
                    <option key={value} value={value}>{TIERS[value] || value}</option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="corpus-state" style={style.label}>State</label>
                <select id="corpus-state" value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} style={style.input}>
                  <option value="">All states</option>
                  {Object.keys(facets.states || {}).map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="corpus-origin" style={style.label}>Origin</label>
                <select id="corpus-origin" value={origin} onChange={(e) => setOrigin(e.target.value)} style={style.input}>
                  <option value="">Curated + imported</option>
                  <option value="curated">Curated</option>
                  <option value="imported">Imported</option>
                </select>
              </div>
            </div>

            {hasFilters ? (
              <button type="button" className="btn btn--ghost btn--sm" onClick={clearFilters} style={{ marginTop: 12 }}>
                CLEAR FILTERS
              </button>
            ) : null}
          </div>

          {error ? (
            <Notice tone="warn" title="Could not load the corpus">
              {error.message}
            </Notice>
          ) : null}

          {loading ? (
            <div style={{ textAlign: "center", padding: "60px 20px" }}>
              <Loading label="Loading the legal corpus..." />
            </div>
          ) : tab === "edition" ? (
            <div>
              {edition ? (
                <div className="card-enclave" style={{ ...style.panel, marginBottom: 16 }}>
                  <span style={style.label}>Raw imported edition</span>
                  <p style={{ margin: "4px 0 0", color: "var(--linen-200)", fontSize: "0.86rem", lineHeight: 1.6 }}>
                    Exactly the {edition.counts?.total ?? editionProvisions.length + editionJudgments.length} records synced from the datagoblin dataset
                    {edition.corpus_generated_at ? ` (corpus generated ${edition.corpus_generated_at})` : ""}.
                    Curated records are not shown here; overlaps appear in the merged tabs as curated.
                  </p>
                </div>
              ) : null}
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {filteredEditionProvisions.map((p) => (
                  <ProvisionCard key={`e-${p.id}`} p={p} acts={acts} categories={categories} />
                ))}
                {filteredEditionJudgments.map((j) => (
                  <JudgmentCard key={`e-${j.id}`} j={j} />
                ))}
                {!filteredEditionProvisions.length && !filteredEditionJudgments.length ? (
                  <Empty title="Nothing matched">
                    No imported record matches these filters. Clear the filters or try a broader term.
                  </Empty>
                ) : null}
              </div>
            </div>
          ) : tab === "provisions" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {filteredProvisions.map((p) => (
                <ProvisionCard key={p.id} p={p} acts={acts} categories={categories} />
              ))}
              {!filteredProvisions.length ? (
                <Empty title="Nothing matched">
                  No provision matches these filters. Clear the filters or try a broader term.
                </Empty>
              ) : null}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {filteredJudgments.map((j) => (
                <JudgmentCard key={j.id} j={j} />
              ))}
              {!filteredJudgments.length ? (
                <Empty title="No decision matched" icon="book">
                  No judgment matches these filters. Clear the filters or try a broader term.
                </Empty>
              ) : null}
            </div>
          )}

          <div style={{ marginTop: 32 }}>
            <span className="badge-note">[ CANONICAL CODES &amp; STATUTES IN FORCE ]</span>
            <div className="grid-3" style={{ marginTop: 12, gap: 16 }}>
              {Object.entries(acts).map(([code, a]) => {
                const metaLine = [
                  a.actNo,
                  a.kind,
                  a.inForceFrom ? `in force ${a.inForceFrom}` : "",
                ].filter(Boolean).join(" · ");
                const count = provisions.filter((p) => p.act === code).length;
                const actSource = safeSource(a.sourceUrl);
                return (
                  <div className="card-enclave" key={code} style={{ padding: 18 }}>
                    <p style={{ margin: "0 0 4px", fontFamily: "var(--serif)", fontSize: "1.05rem", color: "var(--black)", fontWeight: 600 }}>
                      {a.shortTitle || code}
                    </p>
                    <p style={{ margin: "0 0 8px", ...style.muted, fontFamily: "var(--mono)" }}>
                      {metaLine || code}
                    </p>
                    {a.repealed ? (
                      <p style={{ margin: "0 0 8px", ...style.muted }}>Replaced: {a.repealed}</p>
                    ) : null}
                    <p style={{ margin: "0 0 8px", ...style.muted }}>
                      {count} provision{count === 1 ? "" : "s"} in the merged corpus
                    </p>
                    {actSource ? (
                      <a href={actSource} target="_blank" rel="noreferrer" style={{ fontSize: "0.78rem", color: "var(--brass-300)", fontFamily: "var(--mono)" }}>
                        {a.sourceLabel || "Official text"} ↗
                      </a>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      <Footer meta={meta} health={health} />
    </>
  );
}
