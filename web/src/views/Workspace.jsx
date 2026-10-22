import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { Icon, Meter, Notice, Panel, Tag, Empty } from "../ui.jsx";

function AiBadge({ llm, compact }) {
  const live = llm?.mode === "ai" && llm?.ok;
  const title = live
    ? `Live model analysis via ${llm.provider} (${llm.model})`
    : `Deterministic output - no model was used${
        llm?.message ? `: ${llm.message}` : ""
      }`;

  return (
    <span
      className={`tag ${live ? "tag--strong" : "tag--plain"}`}
      title={title}
      style={{ cursor: "help" }}
    >
      <Icon name={live ? "check" : "lock"} size={11} />
      {compact
        ? live
          ? "AI assisted"
          : "Verified sources only"
        : live
          ? `Live AI analysis - ${llm.provider} / ${llm.model}`
          : "Deterministic - corpus only"}
    </span>
  );
}

function AiBlock({ llm }) {
  const r = llm?.result;
  if (!r) return null;

  return (
    <div style={{ display: "grid", gap: 22 }}>
      {r.caseSummary ? (
        <Panel
          title="Case summary, written from your account"
          icon="doc"
          sub="Generated from your narrative plus the retrieved sources"
          right={<AiBadge llm={llm} compact />}
        >
          <p style={{ fontSize: "0.92rem", lineHeight: 1.68, color: "var(--ink)", margin: 0 }}>
            {r.caseSummary}
          </p>
        </Panel>
      ) : null}

      <div className="grid-2">
        <Panel title="Issues identified" icon="layers" right={<AiBadge llm={llm} compact />}>
          {r.keyIssues?.length ? (
            <ul className="gaps">
              {r.keyIssues.map((k, i) => (
                <li key={i}>{k}</li>
              ))}
            </ul>
          ) : (
            <p style={{ fontSize: "0.86rem", color: "var(--ink-faint)", margin: 0 }}>
              The model did not return any.
            </p>
          )}
        </Panel>

        <Panel title="What we still need to know" icon="search" right={<AiBadge llm={llm} compact />}>
          {r.missingInformation?.length ? (
            <ul className="gaps">
              {r.missingInformation.map((k, i) => (
                <li key={i}>{k}</li>
              ))}
            </ul>
          ) : (
            <p style={{ fontSize: "0.86rem", color: "var(--ink-faint)", margin: 0 }}>
              The model did not identify anything missing.
            </p>
          )}
        </Panel>
      </div>

      {r.actionSuggestions?.length ? (
        <Panel title="Suggested next steps" icon="route" right={<AiBadge llm={llm} compact />}>
          {r.actionSuggestions.map((a, i) => (
            <div
              key={i}
              style={{ padding: "12px 0", borderBottom: i < r.actionSuggestions.length - 1 ? "1px solid var(--ivory-200)" : 0 }}
            >
              <p style={{ margin: "0 0 3px", fontWeight: 600, fontSize: "0.89rem", color: "var(--navy-800)" }}>
                {a.step}
              </p>
              {a.why ? (
                <p style={{ margin: 0, fontSize: "0.83rem", color: "var(--ink-soft)", lineHeight: 1.55 }}>
                  {a.why}
                </p>
              ) : null}
            </div>
          ))}
          <p style={{ fontSize: "0.78rem", color: "var(--ink-faint)", marginTop: 12, marginBottom: 0 }}>
            These sit alongside the Action Plan, which is the version to follow because every step in
            it is tied to a source record.
          </p>
        </Panel>
      ) : null}

      {r.evidenceToGather?.length ? (
        <Panel title="Additional evidence worth keeping" icon="doc" right={<AiBadge llm={llm} compact />}>
          <ul className="gaps">
            {r.evidenceToGather.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {r.uncertainty ? (
        <Notice tone="warn" title="What the model could not confirm">
          <p>{r.uncertainty}</p>
        </Notice>
      ) : null}

      <Notice tone="info" title="How to read this section">
        <p>
          The model was given only the provisions and decisions retrieved for your narrative, and was
          instructed to use nothing else. Anything it produced that referenced a statute not in that
          list was stripped out. Identity, wording and deadlines still come from the corpus, never
          from the model. It has not been checked by a lawyer.
        </p>
      </Notice>
    </div>
  );
}

/* ==========================================================================
   Tab 1 — Overview
   ========================================================================== */

function EvidenceCompass({ data, meta, onOpenTab }) {
  const provisions = data.provisions || [];
  const judgments = data.judgments || [];
  const evidence = data.evidence || [];
  const strong = provisions.filter(
    (p) => p.relevance === "core-for-this-issue" || p.relevance === "strong",
  ).length;
  const mentioned = evidence.filter((e) => e.suggestedHeld).length;
  const topProvision = provisions[0];
  const topJudgment = judgments[0];
  const lastReviewed = meta?.provisionsMeta?.lastReviewed;
  const liveAi = data.llm?.mode === "ai" && data.llm?.ok;

  return (
    <aside className="compass" aria-labelledby="compass-title">
      <div className="compass__head">
        <span className="compass__eyebrow">Evidence compass</span>
        <h3 id="compass-title">What this case drew on</h3>
        <p>Bundled corpus records, not conclusions about your case.</p>
      </div>

      <dl className="compass__counts">
        <div>
          <dt>Provisions</dt>
          <dd>
            {provisions.length}
            <small>{strong ? `${strong} core or strong` : "no strong match"}</small>
          </dd>
        </div>
        <div>
          <dt>Judgments</dt>
          <dd>
            {judgments.length}
            <small>{judgments.length ? "citation search linked" : "none matched"}</small>
          </dd>
        </div>
        <div>
          <dt>Evidence</dt>
          <dd>
            {evidence.length}
            <small>{mentioned ? `${mentioned} mentioned in account` : "checklist only"}</small>
          </dd>
        </div>
      </dl>

      {topProvision || topJudgment ? (
        <div className="compass__retrieved">
          <p className="compass__label">
            <Tag tone="strong">Retrieved</Tag> From the corpus
          </p>
          {topProvision ? (
            <a
              className="compass__source"
              href={topProvision.sourceUrl || undefined}
              target={topProvision.sourceUrl ? "_blank" : undefined}
              rel={topProvision.sourceUrl ? "noreferrer" : undefined}
            >
              <b>
                {topProvision.actShortTitle || topProvision.act}, s. {topProvision.section}
              </b>
              <span>{topProvision.heading}</span>
            </a>
          ) : null}
          {topJudgment ? (
            <a
              className="compass__source"
              href={topJudgment.verifyUrl}
              target="_blank"
              rel="noreferrer"
            >
              <b>{topJudgment.title}</b>
              <span>
                {topJudgment.citation} · verify citation ↗
              </span>
            </a>
          ) : null}
        </div>
      ) : null}

      <div className="compass__verify">
        <p className="compass__label">
          <Tag tone="warn">Not verified</Tag> For this case
        </p>
        <ul>
          <li>Source authenticity and current legal text were not re-checked during this analysis.</li>
          <li>Whether a provision applies to your facts has not been assessed by a lawyer.</li>
          <li>
            {liveAi
              ? "AI explanations are machine-generated and not lawyer-reviewed."
              : "Deterministic output: corpus records only; no model was used."}
          </li>
        </ul>
      </div>

      <div className="compass__foot">
        <span>
          {lastReviewed
            ? `Corpus last reviewed ${lastReviewed}; not re-checked for this case.`
            : "Corpus records were not re-verified for this case."}
        </span>
        <button className="brief-link" type="button" onClick={() => onOpenTab("research")}>
          Open legal research <Icon name="arrow" size={13} />
        </button>
      </div>
    </aside>
  );
}

function Overview({ data, meta, onOpenTab }) {
  const { summary, classification, facts, uncertainty, applicability, stats, language, llm } = data;
  const [supportOpen, setSupportOpen] = useState(false);
  const supportRef = useRef(null);

  useEffect(() => {
    const beforePrint = () => {
      if (supportRef.current) supportRef.current.open = true;
      setSupportOpen(true);
    };
    window.addEventListener("beforeprint", beforePrint);
    return () => window.removeEventListener("beforeprint", beforePrint);
  }, []);

  function revealSupport() {
    setSupportOpen(true);
    window.requestAnimationFrame(() => {
      supportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  const topFacts = facts.slice(0, 3);
  const topProvisions = data.provisions.slice(0, 3);
  const nextSteps = data.actionPlan.slice(0, 4);
  const sourceCount = data.provisions.length + data.judgments.length;

  return (
    <>
      <section className="brief no-print" aria-label="Case briefing">
        <div className="brief-summary">
          <div className="brief-summary__main">
            <p className="brief-summary__eyebrow">Situation summary</p>
            <h2 className="brief-summary__title">{summary.headline}</h2>
            <p className="brief-summary__text">{summary.aiSummary || summary.opening}</p>

            {summary.aiSummary ? (
              <p className="brief-summary__disclaimer">
                <Tag tone="strong">Machine paraphrase</Tag>{" "}
                {llm?.notices?.[0] ||
                  "Restates the facts you entered. No section, citation or deadline is taken from this text."}
              </p>
            ) : null}

            <dl className="brief-meta">
              {[
                ["Issue", summary.issueType],
                ["Place", data.input.location || "Not given"],
                [
                  "Timeline",
                  `${data.timeline.total} dated event${data.timeline.total === 1 ? "" : "s"}${
                    data.timeline.uncertainCount ? ` · ${data.timeline.uncertainCount} to check` : ""
                  }`,
                ],
                ["Coverage", uncertainty.reliability.label],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>

            <div className="brief-summary__tools">
              <button className="btn btn--primary btn--sm" type="button" onClick={() => onOpenTab("plan")}>
                Go to action plan <Icon name="arrow" size={13} />
              </button>
              <button className="btn btn--ghost btn--sm" type="button" onClick={() => onOpenTab("research")}>
                View legal sources
              </button>
              <AiBadge llm={llm} compact />
            </div>
          </div>

          <EvidenceCompass data={data} meta={meta} onOpenTab={onOpenTab} />
        </div>

        <div className="brief-grid">
          <section className="brief-card">
            <header className="brief-card__head">
              <span className="brief-card__label">Key findings</span>
              <span className="brief-card__count">{facts.length} from your account</span>
            </header>
            {topFacts.length ? (
              <ol className="brief-list">
                {topFacts.map((f, i) => (
                  <li key={i}>
                    <span className="brief-list__n">{String(i + 1).padStart(2, "0")}</span>
                    <div>
                      <p className="brief-list__text">{f.text}</p>
                      <span className="brief-list__meta">
                        relevance {Math.round(f.relevance * 100)}%
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="brief-empty">No facts could be extracted from this account.</p>
            )}
            <button className="brief-link" type="button" onClick={revealSupport}>
              See all facts and analysis <Icon name="arrow" size={13} />
            </button>
          </section>

          <section className="brief-card">
            <header className="brief-card__head">
              <span className="brief-card__label">Legal basis</span>
              <span className="brief-card__count">
                {sourceCount} source{sourceCount === 1 ? "" : "s"}
              </span>
            </header>
            {topProvisions.length ? (
              <ol className="brief-list">
                {topProvisions.map((p, i) => (
                  <li key={p.id || i}>
                    <span className="brief-list__n">{String(i + 1).padStart(2, "0")}</span>
                    <div>
                      {p.sourceUrl ? (
                        <a
                          className="brief-list__text brief-list__link"
                          href={p.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {p.actShortTitle || p.act}, s. {p.section}
                        </a>
                      ) : (
                        <p className="brief-list__text">
                          {p.actShortTitle || p.act}, s. {p.section}
                        </p>
                      )}
                      <span className="brief-list__meta">{p.heading}</span>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="brief-empty">
                {data.retrievalNote || "No provision in the corpus matched this account."}
              </p>
            )}
            <button className="brief-link" type="button" onClick={() => onOpenTab("research")}>
              Open legal research <Icon name="arrow" size={13} />
            </button>
          </section>

          <section className="brief-card">
            <header className="brief-card__head">
              <span className="brief-card__label">Next steps</span>
              <span className="brief-card__count">{data.actionPlan.length} in the plan</span>
            </header>
            {nextSteps.length ? (
              <ol className="brief-list brief-list--steps">
                {nextSteps.map((s) => (
                  <li key={s.order}>
                    <span className="brief-list__n">{s.order}</span>
                    <div>
                      <p className="brief-list__text">{s.title}</p>
                      {s.deadline ? (
                        <span className="brief-list__meta">
                          {s.deadlineKind === "from-source" ? "Time limit from the statute: " : "On timing: "}
                          {s.deadline}
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="brief-empty">No action plan is available for this issue type.</p>
            )}
            <button className="brief-link" type="button" onClick={() => onOpenTab("plan")}>
              Open full action plan <Icon name="arrow" size={13} />
            </button>
          </section>
        </div>
      </section>

      <details
        className="support"
        id="supporting-evidence"
        ref={supportRef}
        open={supportOpen}
        onToggle={(e) => setSupportOpen(e.currentTarget.open)}
      >
        <summary className="support__summary">
          <span className="support__chevron">
            <Icon name="chevron" size={15} />
          </span>
          <span className="support__summary-text">
            <span className="support__title">Supporting evidence and detailed analysis</span>
            <span className="support__sub">
              {facts.length} facts · {data.provisions.length} provisions · {data.judgments.length} judgments ·{" "}
              {data.evidence.length} evidence items · coverage, gaps and forum
            </span>
          </span>
          <span className="support__badges">
            <Tag tone="plain">{data.timeline.total} dates</Tag>
            <Tag tone="plain">{language.label}</Tag>
            <Tag tone="plain">{stats.words} words</Tag>
          </span>
        </summary>

        <div className="support__body">
          <div className="grid-2">
            <div>
              <Panel title="Case summary" icon="doc" sub="Assembled from your own words only">
                <p style={{ fontSize: "0.94rem", lineHeight: 1.66, color: "var(--ink)" }}>
                  {summary.aiSummary || summary.opening}
                </p>

                {summary.aiSummary ? (
                  <p style={{ fontSize: "0.78rem", color: "var(--ink-faint)", marginTop: 0 }}>
                    <Tag tone="strong">Machine paraphrase</Tag>{" "}
                    {llm?.notices?.[0] ||
                      "Restates the facts you entered. No section, citation or deadline is taken from this text."}
                  </p>
                ) : null}

                <dl
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
                    gap: 14,
                    margin: "16px 0 0",
                    padding: "14px 16px",
                    background: "var(--ivory-100)",
                    borderRadius: "var(--radius)",
                  }}
                >
                  {[
                    ["Issue type", summary.issueType],
                    ["Language", language.label],
                    ["Narrative", `${stats.words} words, ${stats.sentences} sentences`],
                    [
                      "Dated events",
                      `${data.timeline.total} found${data.timeline.uncertainCount ? `, ${data.timeline.uncertainCount} uncertain` : ""}`,
                    ],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt
                        style={{
                          fontSize: "0.68rem",
                          textTransform: "uppercase",
                          letterSpacing: "0.09em",
                          color: "var(--ink-faint)",
                          marginBottom: 2,
                        }}
                      >
                        {k}
                      </dt>
                      <dd style={{ margin: 0, fontSize: "0.855rem", color: "var(--navy-800)", fontWeight: 500 }}>
                        {v}
                      </dd>
                    </div>
                  ))}
                </dl>
              </Panel>

              <Panel
                title="Important facts identified"
                icon="layers"
                sub="Every line below is a sentence from your narrative. Nothing has been added to your account."
                right={<Tag tone="plain">{facts.length} of {stats.sentences} sentences</Tag>}
                flush
              >
                {facts.length ? (
                  <div>
                    {facts.map((f, i) => (
                      <div className="fact" key={i}>
                        <span className="fact__rank">{String(i + 1).padStart(2, "0")}</span>
                        <div>
                          <p className="fact__text">{f.text}</p>
                          <p className="fact__why">
                            {f.why} · relevance {Math.round(f.relevance * 100)}%
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty title="No facts could be extracted">
                    The narrative was too short or too general. Add what was done, by whom, and when.
                  </Empty>
                )}
              </Panel>

              <Panel title="How this issue was classified" icon="search" sub="Issue types matched against your narrative">
                {classification.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      padding: "13px 0",
                      borderBottom: "1px solid var(--ivory-200)",
                      display: "flex",
                      gap: 14,
                      alignItems: "flex-start",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontWeight: 600, color: "var(--navy-800)", fontSize: "0.9rem" }}>
                        {c.label} <span style={{ color: "var(--ink-faint)", fontWeight: 400 }}>{c.labelHi}</span>
                      </p>
                      <p style={{ margin: "3px 0 0", fontSize: "0.79rem", color: "var(--ink-soft)" }}>
                        {c.reason}
                        {c.matchedSignals?.length ? ` — matched: ${c.matchedSignals.join(", ")}` : ""}
                      </p>
                      <p style={{ margin: "3px 0 0", fontSize: "0.77rem", color: "var(--ink-faint)" }}>
                        Forum: {c.forum}
                      </p>
                    </div>
                    {c.score !== null && c.score !== undefined ? (
                      <Tag tone={c.score >= 4 ? "strong" : "moderate"}>score {c.score}</Tag>
                    ) : (
                      <Tag tone="core">your choice</Tag>
                    )}
                  </div>
                ))}
              </Panel>
            </div>

            <div>
              <Panel title="How well we could cover this" icon="clock" sub="Our own assessment, not a guarantee">
                <Meter
                  score={uncertainty.reliability.score}
                  band={uncertainty.reliability.band}
                  label={uncertainty.reliability.label}
                />
                <p style={{ fontSize: "0.85rem", color: "var(--ink-soft)", marginTop: 12, marginBottom: 8 }}>
                  {uncertainty.reliability.explanation}
                </p>
                <ul className="factors">
                  {uncertainty.reliability.factors.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </Panel>

              {data.hiddenFacts?.length ? (
                <Panel
                  title="What your account implies, and what it leaves out"
                  icon="alert"
                  sub="Each item is tied to words you wrote, or to something we could not find"
                >
                  <p style={{ fontSize: "0.84rem", color: "var(--ink-soft)", marginTop: 0 }}>
                    Courts turn on details that people leave out of their own account. These are the ones your
                    narrative points at, and the ones it does not. Nothing here is asserted that you did not
                    write.
                  </p>
                  <ul className="hiddenfacts">
                    {data.hiddenFacts.map((h) => (
                      <li key={h.id} className={`hiddenfact hiddenfact--${h.kind}`}>
                        <div className="hiddenfact__head">
                          <Tag tone={h.kind === "implied" ? "strong" : "moderate"}>
                            {h.kind === "implied" ? "implied" : "missing"}
                          </Tag>
                          <b>{h.label}</b>
                        </div>
                        <p className="hiddenfact__detail">{h.detail}</p>
                        <p className="hiddenfact__basis">{h.basis}</p>
                        {h.evidence ? <q className="hiddenfact__quote">{h.evidence}</q> : null}
                      </li>
                    ))}
                  </ul>
                </Panel>
              ) : null}

              <Panel title="What we could not establish" icon="alert">
                {uncertainty.gaps.length ? (
                  <ul className="gaps">
                    {uncertainty.gaps.map((g, i) => (
                      <li key={i}>{g}</li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ fontSize: "0.86rem", color: "var(--ink-soft)", margin: 0 }}>
                    Nothing material was missing from the narrative.
                  </p>
                )}
              </Panel>

              {applicability?.note ? (
                <Panel title="Which law applies" icon="scale">
                  <p style={{ fontSize: "0.865rem", color: "var(--ink-soft)", margin: 0, lineHeight: 1.62 }}>
                    {applicability.note}
                  </p>
                </Panel>
              ) : null}

              <Panel title="Where to go" icon="route">
                {classification.slice(0, 2).map((c) => (
                  <div key={c.id} style={{ marginBottom: 14 }}>
                    <p style={{ margin: "0 0 3px", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--brass-600)", fontWeight: 600 }}>
                      {c.label}
                    </p>
                    <p style={{ margin: 0, fontSize: "0.865rem", color: "var(--ink-soft)" }}>{c.forum}</p>
                    {c.emergency ? (
                      <p style={{ margin: "6px 0 0", fontSize: "0.8rem", color: "var(--clay-600)" }}>
                        {c.emergency}
                      </p>
                    ) : null}
                  </div>
                ))}
              </Panel>

              {data.uncertainty.aiUncertainty ? (
                <Notice tone="warn" title="Additional uncertainty flagged by the model">
                  <p>{data.uncertainty.aiUncertainty}</p>
                </Notice>
              ) : null}

              <Notice tone="info" title="Before you use this">
                <p>
                  A match between a provision and your facts is a starting point, not a conclusion. Courts
                  decide these questions on evidence, and a lawyer has to weigh what we have not read.
                </p>
              </Notice>
            </div>
          </div>

          <div className="support__tabs">
            <button className="btn btn--ghost btn--sm" type="button" onClick={() => onOpenTab("timeline")}>
              Timeline and evidence
            </button>
            <button className="btn btn--ghost btn--sm" type="button" onClick={() => onOpenTab("research")}>
              Provisions and judgments
            </button>
            <button className="btn btn--ghost btn--sm" type="button" onClick={() => onOpenTab("plan")}>
              Action plan and referrals
            </button>
            <button className="btn btn--ghost btn--sm" type="button" onClick={() => onOpenTab("documents")}>
              Documents
            </button>
          </div>
        </div>
      </details>
    </>
  );
}

/* ==========================================================================
   Tab 2 — Timeline and evidence
   ========================================================================== */

function TimelineEvidence({ data, checked, onToggleEvidence }) {
  const [filter, setFilter] = useState("all");
  const events = data.timeline.events;
  const shown = filter === "all" ? events : events.filter((e) => !e.needsReview !== (filter === "certain"));
  const held = data.evidence.filter((e) => checked.has(e.item) || e.suggestedHeld).length;

  return (
    <div className="grid-2">
      <div>
        <Panel
          title="Chronological timeline"
          icon="clock"
          sub={`${events.length} dated event${events.length === 1 ? "" : "s"} read from your narrative`}
          right={
            events.length > 1 ? (
              <div className="langbar">
                <button type="button" data-on={filter === "all"} onClick={() => setFilter("all")}>
                  All
                </button>
                <button
                  type="button"
                  data-on={filter === "certain"}
                  onClick={() => setFilter("certain")}
                >
                  Certain
                </button>
                <button
                  type="button"
                  data-on={filter === "check"}
                  onClick={() => setFilter("check")}
                >
                  Check these
                </button>
              </div>
            ) : null
          }
          flush
        >
          {shown.length ? (
            <div className="tl">
              {shown.map((e, i) => (
                <div className="tl__item" key={`${e.date}-${i}`}>
                  <div className="tl__date">
                    {new Date(e.date + "T00:00:00Z")
                      .toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        timeZone: "UTC",
                      })
                      .replace(/^(\d+)/, "$1")}
                    <small>{e.dateText}</small>
                    {e.needsReview ? (
                      <small style={{ color: "var(--clay-600)", marginTop: 3 }}>
                        check this date
                      </small>
                    ) : null}
                  </div>
                  <div className="tl__node">
                    <span className="tl__line" />
                    <span className={`tl__dot${e.needsReview ? " tl__dot--uncertain" : ""}`} />
                  </div>
                  <p className="tl__text">{e.event}</p>
                </div>
              ))}
            </div>
          ) : (
            <Empty title="No dates were found" icon="clock">
              The workspace could not build a timeline. Add dates to the narrative — even approximate
              ones help, and anything uncertain is marked.
            </Empty>
          )}
        </Panel>

        {data.timeline.uncertainCount > 0 ? (
          <Notice tone="warn" title="Some dates are ambiguous">
            <p>
              {data.timeline.uncertainCount} entr{data.timeline.uncertainCount === 1 ? "y is" : "ies are"}{" "}
              based on a bare year or on a numeric date that could be read two ways, such as 03/04/2026.
              Confirm them before relying on the order of events.
            </p>
          </Notice>
        ) : null}
      </div>

      <div>
        <Panel
          title="Evidence you can gather"
          icon="doc"
          sub="Tick what you already have. Suggested items are ones your narrative mentions."
          right={
            <Tag tone={held === data.evidence.length ? "strong" : "moderate"}>
              {held}/{data.evidence.length}
            </Tag>
          }
          flush
        >
          {data.evidence.length ? (
            <div>
              {data.evidence.map((e) => {
                const id = checked.has(e.item) || e.suggestedHeld;
                return (
                  <label className="ev" key={e.item} data-held={String(id)}>
                    <input
                      type="checkbox"
                      checked={id}
                      onChange={() => onToggleEvidence(e.item)}
                    />
                    <div className="ev__body">
                      <p className="ev__item">{e.item}</p>
                      <p className="ev__meta">
                        <b>Where from:</b> {e.source}
                        {e.suggestedHeld ? (
                          <span className="ev__suggest"> · your narrative mentions this</span>
                        ) : null}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          ) : (
            <Empty title="No evidence list for this issue type yet">
              The checklist is derived from the issue category. Choose a different category in intake
              if this does not fit.
            </Empty>
          )}
        </Panel>

        <Panel title="Questions that would change the answer" icon="search" sub="Answering these is the fastest way to get a better result">
          <ul className="gaps">
            {data.followUps.slice(0, 6).map((q, i) => (
              <li key={i}>
                {q.question}
                <span style={{ display: "block", fontSize: "0.73rem", color: "var(--ink-faint)" }}>
                  {q.forIssue}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

/* ==========================================================================
   Tab 3 — Legal research
   ========================================================================== */

function ProvisionCard({ p }) {
  const tone =
    p.relevance === "strong"
      ? "strong"
      : p.relevance === "core-for-this-issue"
        ? "core"
        : p.relevance === "moderate"
          ? "moderate"
          : "weak";

  const label =
    p.relevance === "core-for-this-issue"
      ? "core for this issue"
      : p.relevance;

  return (
    <article className="prov">
      <div className="prov__top">
        <span className="prov__num">s. {p.section}</span>
        <div className="prov__head">
          <p className="prov__act">{p.actShortTitle || p.act}</p>
          <h4 className="prov__title">{p.heading}</h4>
          <p className="prov__summary">{p.summary}</p>
          {p.whyItMatters ? (
            <p className="prov__why">
              <b>Why it matters. </b>
              {p.whyItMatters}
            </p>
          ) : null}

          {p.aiWhy ? (
            <p
              className="prov__why"
              style={{ background: "var(--ivory-100)", borderLeftColor: "var(--navy-600)", color: "var(--ink-soft)" }}
            >
              <b style={{ color: "var(--navy-700)" }}>Why this may apply to your facts. </b>
              {p.aiWhy}
              <span style={{ display: "block", fontSize: "0.72rem", color: "var(--ink-faint)", marginTop: 5 }}>
                Machine-generated explanation, not checked by a lawyer.
              </span>
            </p>
          ) : null}
          {p.repealedAct ? (
            <p style={{ fontSize: "0.76rem", color: "var(--ink-faint)", margin: "0 0 9px" }}>
              Replaced the {p.repealedAct} section numbering from 1 July 2024.
            </p>
          ) : null}

          <div className="prov__foot">
            {p.sourceUrl ? (
              <a href={p.sourceUrl} target="_blank" rel="noreferrer">
                {p.sourceLabel || "Official text"} ↗
              </a>
            ) : null}
            {p.fromIssueCategory ? <span>Matched via: {p.fromIssueCategory}</span> : null}
          </div>

          {p.matchedTerms?.length ? (
            <div className="prov__terms">
              {p.matchedTerms.slice(0, 8).map((t) => (
                <span className="prov__term" key={t}>
                  {t}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="prov__side">
          <Tag tone={tone} title="Strength of the textual match">
            {label}
          </Tag>
          {p.score !== null && p.score !== undefined ? (
            <span className="prov__score">{p.score.toFixed(3)}</span>
          ) : (
            <span className="prov__score">by rule</span>
          )}
        </div>
      </div>
    </article>
  );
}

const RESEARCH_GROUPS = [
  {
    id: "core",
    label: "Core for this issue",
    hint: "Central provisions for this issue type",
    matches: (p) => p.relevance === "core-for-this-issue",
  },
  {
    id: "strong",
    label: "Strong",
    hint: "Direct textual matches",
    matches: (p) => p.relevance === "strong",
  },
  {
    id: "weak",
    label: "Weak",
    hint: "Moderate and weak matches, labelled as such",
    matches: (p) => p.relevance !== "core-for-this-issue" && p.relevance !== "strong",
  },
];

function JudgmentCard({ j }) {
  const tone =
    j.relevance === "strong" ? "strong" : j.relevance === "moderate" ? "moderate" : "weak";

  return (
    <article className="judg judg--compact">
      <div className="judg__head">
        <div>
          <h4 className="judg__cite">{j.title}</h4>
          <p className="judg__court">
            <span>{j.citation}</span>
            <span>{j.court}</span>
            <span>{j.year}</span>
            {j.bench ? <span>{j.bench}</span> : null}
          </p>
        </div>
        <Tag tone={tone}>{j.relevance} match</Tag>
      </div>

      <div className="judg__block judg__block--compact">
        <b>Why we surfaced it</b>
        <p>{j.relevance}</p>
      </div>

      <details className="judg__more">
        <summary>Facts, holding and citation check</summary>
        <div className="judg__more-body">
          <div className="judg__block">
            <b>Facts it turned on</b>
            <p>{j.factsPattern}</p>
          </div>
          {j.ratio ? (
            <div className="judg__block judg__block--ratio">
              <b>The principle it stands for</b>
              <p>{j.ratio}</p>
              <span className="judg__ratio-note">
                Distilled from the holding recorded in our corpus. Read the full judgment before you put
                this in front of a court.
              </span>
            </div>
          ) : null}
          <div className="judg__block">
            <b>What the Court held — our paraphrase, not its words</b>
            <p>{j.holding}</p>
          </div>
          {j.aiWhy ? (
            <div className="judg__block">
              <b>How this may relate to your facts — machine-generated</b>
              <p>{j.aiWhy}</p>
            </div>
          ) : null}
        </div>
      </details>

      <div className="judg__foot">
        <a href={j.verifyUrl} target="_blank" rel="noreferrer">
          Verify this citation ↗
        </a>
        <span style={{ color: "var(--ink-faint)" }}>text match {j.score?.toFixed(3)}</span>
      </div>
    </article>
  );
}

const EDGE_LABELS = {
  "same-filing-step": "cited in one filing",
  "same-issue-cross-statute": "same issue, two statutes",
  "shared-legal-vocabulary": "same conduct, two enactments",
  curated: "linked in the knowledge base",
};

/**
 * The cross-statute graph: which section of one Act connects to which section of
 * another, and why. Every link carries the reason it exists rather than asking
 * the reader to take the connection on trust.
 */
function CrossStatuteGraph({ graph }) {
  const [openEdge, setOpenEdge] = useState(null);
  if (!graph?.nodes?.length || !graph?.edges?.length) return null;

  const labelOf = (id) => {
    const n = graph.nodes.find((x) => x.id === id);
    if (!n) return id;
    return `s. ${n.section}`;
  };
  const shortAct = (id) => {
    const n = graph.nodes.find((x) => x.id === id);
    if (!n) return "";
    return (n.actShortTitle || n.act || "").split(",")[0].replace("The ", "");
  };

  return (
    <Panel
      title="How these sections connect"
      icon="route"
      sub={`${graph.stats.edges} link${graph.stats.edges === 1 ? "" : "s"} across ${graph.stats.statuteCount} statutes`}
    >
      <p style={{ fontSize: "0.84rem", color: "var(--ink-soft)", marginTop: 0 }}>
        {graph.note}
      </p>

      <div className="graphstatutes">
        {graph.stats.statutes.map((a) => (
          <span key={a}>{a}</span>
        ))}
      </div>

      <ul className="graphedges">
        {graph.edges.map((e, i) => {
          const isOpen = openEdge === i;
          return (
            <li key={`${e.source}-${e.target}-${e.kind}`}>
              <button type="button" onClick={() => setOpenEdge(isOpen ? null : i)}>
                <span className="graphedges__pair">
                  <b>{labelOf(e.source)}</b>
                  <span className="graphedges__acts">
                    {shortAct(e.source)} &rarr; {shortAct(e.target)}
                  </span>
                </span>
                <span className="graphedges__why">
                  {isOpen ? e.why : (EDGE_LABELS[e.kind] || e.kind)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="graphnote">
        A link is not an argument. It means two sections were found to address the same conduct, were
        cited in the same step, or share distinctive legal vocabulary — and the reason is shown so you
        can disagree with it.
      </p>
    </Panel>
  );
}

/** The written applications a self-represented person actually files. */
function FormsPanel({ forms, meta }) {
  if (!forms?.length) return null;
  return (
    <Panel
      title="Forms and written applications"
      icon="doc"
      sub={`${forms.length} paper${forms.length === 1 ? "" : "s"} to file or ask for`}
    >
      {forms.map((f) => (
        <div key={f.id} className="formcard">
          <div className="formcard__head">
            <h4>{f.name}</h4>
            {f.section ? (
              <span className="formcard__sec">
                {f.statute}
                {f.section ? `, s. ${f.section}` : ""}
              </span>
            ) : (
              <span className="formcard__sec">{f.statute}</span>
            )}
          </div>

          <dl className="formcard__rows">
            <div>
              <dt>Where</dt>
              <dd>{f.forum}</dd>
            </div>
            <div>
              <dt>How to get it</dt>
              <dd>{f.howToGet}</dd>
            </div>
            {f.canAskTogether?.length ? (
              <div>
                <dt>Ask together</dt>
                <dd>{f.canAskTogether.join(" · ")}</dd>
              </div>
            ) : null}
            {f.whatToAttach?.length ? (
              <div>
                <dt>Take with you</dt>
                <dd>{f.whatToAttach.join(" · ")}</dd>
              </div>
            ) : null}
          </dl>

          {f.note ? <p className="formcard__note">{f.note}</p> : null}
          {f.verifyWith ? (
            <p className="formcard__verify">Confirm with: {f.verifyWith}</p>
          ) : null}
          {f.forIssue ? (
            <p className="formcard__verify">Also applies to: {f.forIssue}</p>
          ) : null}
        </div>
      ))}
      <p className="graphnote">
        These describe the application and where it goes. The prescribed form is set by each State and
        changes — ask the court or the legal aid desk for the current one before you file.
      </p>
    </Panel>
  );
}

/**
 * Search the live datagoblin legal dataset.
 *
 * Only the search text is sent. The dataset's key stays on the server, and
 * the client's case material never leaves this browser. When no live dataset
 * is configured the panel says so instead of showing an empty result as
 * though the search had found nothing.
 */
function DatasetSearch({ onToast }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .legalDatasetStatus()
      .then((s) => setStatus(s))
      .catch(() => setStatus({ configured: false }));
  }, []);

  async function run(e) {
    e?.preventDefault?.();
    const text = query.trim();
    if (!text) return;
    setBusy(true);
    try {
      const res = await api.searchLegalDataset(text, 20);
      setResult(res);
      if (res?.configured === false) {
        onToast?.("No live dataset is configured; the bundled corpus is the source here.");
      }
    } catch (err) {
      onToast?.(`The dataset search failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  const configured = status?.configured === true;
  const records = result?.records || [];

  return (
    <Panel
      title="Search the live legal dataset"
      icon="search"
      sub={
        configured
          ? "Keyword match over the dataset's stored page text"
          : "No live dataset is configured for this instance"
      }
    >
      {!configured ? (
        <Notice tone="info" title="The bundled corpus is the source here">
          <p>
            This instance is not connected to a live datagoblin dataset, so the provisions and
            decisions shown on this page come from the bundled corpus. A live dataset would add
            records scraped from official sources, searched on the server.
          </p>
        </Notice>
      ) : null}

      <form onSubmit={run} style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. dishonour of cheque, notice, 15 days"
          aria-label="Search the live legal dataset"
          disabled={!configured}
          style={{
            flex: "1 1 260px",
            padding: "8px 11px",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
            background: "var(--white)",
            color: "var(--text)",
            fontSize: "0.86rem",
          }}
        />
        <button type="submit" className="btn btn--primary btn--sm" disabled={!configured || busy}>
          {busy ? "Searching..." : "Search"}
        </button>
      </form>

      {result?.configured === false ? (
        <Notice tone="warn" title="Searched the bundled corpus instead">
          <p>{result.detail}</p>
        </Notice>
      ) : null}

      {result?.configured && records.length ? (
        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          <p style={{ fontSize: "0.76rem", color: "var(--ink-faint)", margin: 0 }}>
            {result.total} record{result.total === 1 ? "" : "s"} matched
            {result.datasetId ? ` in dataset ${result.datasetId}` : ""}
          </p>
          <Notice tone="info" title="How this was matched">
            <p>
              The dataset is searched as text, so a record is returned when the words appear in the
              page it was read from. This is a keyword match, not a judgement that the record applies
              to your case — read the quoted text and check it against your facts.
            </p>
          </Notice>
          {records.map((row, i) => {
            // A datagoblin row is { record_id, fields: { name: { value, source } } }.
            const fields = row?.fields || row || {};
            const field = (name) => {
              const f = fields[name];
              // A field that is not there reads as empty, not as
              // "[object Object]".
              if (f === undefined || f === null) return { value: "", quote: "", url: "" };
              const raw = typeof f === "object" ? f.value : f;
              const src = typeof f === "object" && f ? f.source || {} : {};
              return {
                value: raw === null || raw === undefined ? "" : String(raw),
                quote: String(src.quote || ""),
                url: String(src.url || ""),
              };
            };
            const title = field("document_title");
            const citation = field("citation");
            const court = field("court");
            const summary = field("summary");
            const holding = field("holding");
            const docType = field("document_type");
            const quote = summary.quote || holding.quote || "";
            const url = title.url || citation.url;

            return (
              <div
                key={i}
                style={{ border: "1px solid var(--ivory-300)", borderRadius: "var(--radius)", padding: 12 }}
              >
                <div style={{ fontWeight: 600, fontSize: "0.86rem", color: "var(--navy-800)" }}>
                  {url ? (
                    <a href={url} target="_blank" rel="noreferrer">
                      {title.value || citation.value}
                    </a>
                  ) : (
                    title.value || citation.value
                  )}
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                    marginTop: 5,
                    fontSize: "0.72rem",
                    color: "var(--ink-faint)",
                  }}
                >
                  {citation.value ? <Tag tone="plain">{citation.value}</Tag> : null}
                  {court.value ? <Tag tone="plain">{court.value}</Tag> : null}
                  {docType.value ? <Tag tone="plain">{docType.value}</Tag> : null}
                </div>
                {quote ? (
                  <p
                    style={{
                      margin: "8px 0 0",
                      fontSize: "0.8rem",
                      lineHeight: 1.6,
                      color: "var(--ink-soft)",
                      borderLeft: "2px solid var(--ivory-300)",
                      paddingLeft: 10,
                    }}
                  >
                    {quote.length > 420 ? `${quote.slice(0, 420)}...` : quote}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {result?.configured && !records.length && !busy ? (
        <Empty title="No record matched" icon="search">
          Nothing in the live dataset matched that wording. The bundled corpus is still searched by
          the analysis on this case.
        </Empty>
      ) : null}
    </Panel>
  );
}

function LegalResearch({ data, meta, group, onGroupChange, act, onActChange, onToast }) {
  const tabRefs = useRef({});
  const groupCounts = useMemo(
    () =>
      Object.fromEntries(
        RESEARCH_GROUPS.map((g) => [g.id, data.provisions.filter(g.matches).length]),
      ),
    [data.provisions],
  );

  const groupProvisions = useMemo(() => {
    const selected = RESEARCH_GROUPS.find((g) => g.id === group) || RESEARCH_GROUPS[0];
    return data.provisions.filter(selected.matches);
  }, [data.provisions, group]);

  const actsUsed = useMemo(() => {
    const set = new Set(groupProvisions.map((p) => p.act));
    return [...set];
  }, [groupProvisions]);

  useEffect(() => {
    if (act !== "all" && !groupProvisions.some((p) => p.act === act)) {
      onActChange("all");
    }
  }, [act, groupProvisions, onActChange]);

  const shown =
    act === "all" ? groupProvisions : groupProvisions.filter((p) => p.act === act);
  const activeGroup = RESEARCH_GROUPS.find((g) => g.id === group) || RESEARCH_GROUPS[0];
  const hasModerate = shown.some((p) => p.relevance === "moderate");

  function onTabKeyDown(event) {
    const ids = RESEARCH_GROUPS.map((g) => g.id);
    const index = ids.indexOf(activeGroup.id);
    let next = null;

    if (event.key === "ArrowRight") next = ids[(index + 1) % ids.length];
    else if (event.key === "ArrowLeft") next = ids[(index - 1 + ids.length) % ids.length];
    else if (event.key === "Home") next = ids[0];
    else if (event.key === "End") next = ids[ids.length - 1];

    if (next) {
      event.preventDefault();
      onGroupChange(next);
      window.requestAnimationFrame(() => tabRefs.current[next]?.focus());
    }
  }

  const emptyCopy = {
    core: "No provision was marked core for this issue type in the current analysis.",
    strong: "No strong textual match was retrieved for this account.",
    weak: "No moderate or weak textual matches were retrieved for this account.",
  };

  return (
    <>
      {data.retrievalNote ? (
        <Notice tone="warn" title="Retrieval engine unavailable">
          <p>{data.retrievalNote}</p>
        </Notice>
      ) : null}

      <Notice tone="info" title="How these were matched">
        <p>
          Two retrievers run over the same bundled corpus and their scores are blended. The first is
          sparse TF-IDF, which is exact about statutory wording. The second is a 384-dimension
          multilingual sentence-embedding model, which scores meaning — so a narrative that never uses
          the word &ldquo;cruelty&rdquo; can still reach the section about cruelty. Neither reads your case and
          decides what applies; both are matching over a fixed corpus. A weak match is labelled weak,
          and a provision central to the issue type is marked as such even if the wording barely
          overlaps.
        </p>
      </Notice>

      <div className="research-tabs" role="tablist" aria-label="Provision match strength">
        {RESEARCH_GROUPS.map((g) => (
          <button
            key={g.id}
            ref={(el) => {
              tabRefs.current[g.id] = el;
            }}
            id={`research-tab-${g.id}`}
            type="button"
            role="tab"
            aria-selected={activeGroup.id === g.id}
            aria-controls={`research-panel-${g.id}`}
            tabIndex={activeGroup.id === g.id ? 0 : -1}
            className="research-tab"
            data-on={activeGroup.id === g.id}
            onClick={() => onGroupChange(g.id)}
            onKeyDown={onTabKeyDown}
          >
            <span className="research-tab__label">{g.label}</span>
            <span className="research-tab__count">{groupCounts[g.id]}</span>
            <span className="research-tab__hint">{g.hint}</span>
          </button>
        ))}
      </div>

      <div className="grid-2 research-grid">
        <div>
          <Panel
            title="Potentially applicable provisions"
            icon="scale"
            sub={`${shown.length} in this group across ${actsUsed.length} statute${actsUsed.length === 1 ? "" : "s"}`}
            right={
              actsUsed.length > 1 ? (
                <div className="langbar" aria-label="Filter by statute">
                  <button type="button" data-on={act === "all"} onClick={() => onActChange("all")}>
                    All
                  </button>
                  {actsUsed.map((a) => (
                    <button key={a} type="button" data-on={act === a} onClick={() => onActChange(a)}>
                      {(meta?.acts?.[a]?.shortTitle || a).split(",")[0].replace("The ", "")}
                    </button>
                  ))}
                </div>
              ) : null
            }
            flush
          >
            <div
              id={`research-panel-${activeGroup.id}`}
              role="tabpanel"
              aria-labelledby={`research-tab-${activeGroup.id}`}
              tabIndex={0}
            >
              {activeGroup.id === "weak" && hasModerate ? (
                <p className="research-note">
                  This group includes moderate textual matches. Each card keeps its original match
                  label; they are kept here so a moderate match is never presented as strong.
                </p>
              ) : null}

              {shown.length ? (
                shown.map((p) => <ProvisionCard key={p.id} p={p} />)
              ) : (
                <Empty title="No provisions in this group" icon="book">
                  {emptyCopy[activeGroup.id]}
                </Empty>
              )}
            </div>
          </Panel>
        </div>

        <div>
          <Panel
            title="Judgments that may help"
            icon="book"
            sub="Real reported decisions, with the citation. Verify before you rely on any of them."
            flush
          >
            {data.judgments.length ? (
              data.judgments.map((j) => <JudgmentCard key={j.id} j={j} />)
            ) : (
              <Empty title="No decision in our corpus matched" icon="book">
                The corpus holds 14 well-known decisions. None matched your fact pattern. We do not
                substitute an unrelated case to fill the space — search Indian Kanoon yourself, or
                ask a lawyer to run a proper citation search.
              </Empty>
            )}
          </Panel>

          {data.forms?.length ? <FormsPanel forms={data.forms} meta={meta} /> : null}

          {data.crossForms?.length ? <FormsPanel forms={data.crossForms} meta={meta} /> : null}

          <CrossStatuteGraph graph={data.graph} />

          <Panel title="Our knowledge base" icon="info">
            <p style={{ fontSize: "0.84rem", color: "var(--ink-soft)", marginBottom: 10 }}>
              {meta?.provisionsMeta?.description}
            </p>
            <ul className="gaps">
              <li>{meta?.provisionsMeta?.verificationNote}</li>
              <li>{meta?.judgmentsMeta?.limitation}</li>
            </ul>
            <p style={{ fontSize: "0.78rem", color: "var(--ink-faint)", marginTop: 10, marginBottom: 0 }}>
              Retrieval engine: {data.uncertainty.engine}
            </p>
          </Panel>

          <div style={{ marginTop: 18 }}>
            <DatasetSearch onToast={onToast} />
          </div>
        </div>
      </div>
    </>
  );
}

/* ==========================================================================
   Tab 4 — Action plan
   ========================================================================== */

const PLAN_STAGE_SIZE = 3;

function buildPlanStages(steps) {
  const stages = [];
  for (let i = 0; i < steps.length; i += PLAN_STAGE_SIZE) {
    const group = steps.slice(i, i + PLAN_STAGE_SIZE);
    const first = group[0];
    const last = group[group.length - 1];
    stages.push({
      id: `plan-stage-${i / PLAN_STAGE_SIZE}`,
      label:
        group.length === 1
          ? `Step ${first.order}`
          : `Steps ${first.order}–${last.order}`,
      steps: group,
    });
  }
  return stages;
}

function PlanStepCard({ step, done, selected, onToggle, onSelect }) {
  return (
    <div className="plan-step" data-done={String(done)} data-on={String(selected)}>
      <button
        className="plan-step__open"
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
      >
        <span className="plan-step__n">
          {done ? <Icon name="check" size={12} /> : step.order}
        </span>
        <span className="plan-step__body">
          <span className="plan-step__title">{step.title}</span>
          <span className="plan-step__meta">
            {done
              ? "Marked done"
              : step.deadline
                ? "Timing guidance available"
                : "Open for full instructions"}
          </span>
        </span>
        <Icon name="chevron" size={14} />
      </button>
      <label className="plan-step__check" title={done ? "Undo completion" : "Mark complete"}>
        <input
          type="checkbox"
          checked={done}
          onChange={() => onToggle(step.title)}
          aria-label={`${done ? "Undo completion of" : "Mark complete"} step ${step.order}`}
        />
        <span>{done ? "Done" : "Mark"}</span>
      </label>
    </div>
  );
}

function PlanStepDetail({ step, done, onToggle, isCross }) {
  return (
    <aside className="plan-detail" aria-live="polite">
      <div className="plan-detail__head">
        <span className="plan-detail__eyebrow">
          {isCross ? "Related step" : `Step ${step.order}`}
        </span>
        <h3>{step.title}</h3>
        <div>
          <Tag tone={done ? "strong" : "plain"}>
            {done ? "Marked done" : "Not marked done"}
          </Tag>
        </div>
      </div>

      {isCross ? (
        <p className="plan-detail__cross">
          Also relevant if this is also a {step.forIssue?.toLowerCase()} matter.
        </p>
      ) : null}

      <p className="plan-detail__why">{step.why}</p>

      {step.deadline ? (
        <p className={`deadline${step.deadlineKind === "advisory" ? " deadline--advisory" : ""}`}>
          <b>
            {step.deadlineKind === "from-source" ? "Time limit from the statute" : "On timing"}
          </b>
          {step.deadline}
        </p>
      ) : null}

      {step.steps ? (
        <div className="plan-detail__block">
          <b>How to do it</b>
          <p>{step.steps}</p>
        </div>
      ) : null}

      <div className="plan-detail__block">
        <b>Documents to bring</b>
        <p>{step.evidenceNeeded}</p>
      </div>

      {step.provisionRefs?.length || step.channelRefs?.length ? (
        <div className="plan-detail__block">
          <b>Related sources</b>
          <div className="step__refs">
            {step.provisionRefs?.map((r) => (
              <a
                key={r.id}
                className="tag tag--plain"
                href={r.sourceUrl}
                target="_blank"
                rel="noreferrer"
                title={r.heading}
                style={{ textDecoration: "none" }}
              >
                {r.label}
              </a>
            ))}
            {step.channelRefs?.map((c) => (
              <a
                key={c.id}
                className="tag tag--moderate"
                href={c.sourceUrl}
                target="_blank"
                rel="noreferrer"
                style={{ textDecoration: "none" }}
                title={c.when}
              >
                {c.name}: {c.value}
              </a>
            ))}
          </div>
        </div>
      ) : null}

      <div className="plan-detail__actions">
        <button
          className={done ? "btn btn--ghost btn--sm" : "btn btn--primary btn--sm"}
          type="button"
          onClick={() => onToggle(step.title)}
        >
          {done ? "Undo completion" : "Mark step complete"}
        </button>
      </div>

      <p className="plan-detail__note">
        This only tracks your own progress in this session. It does not file anything or confirm
        that a legal step has been completed.
      </p>
    </aside>
  );
}

function CrossStatuteStep({ step, done, onToggle }) {
  return (
    <details className="cross-step">
      <summary>
        <span>
          <b>{step.title}</b>
          <small>
            {step.forIssue ? `Also relevant: ${step.forIssue}` : "Related issue"} ·{" "}
            {done ? "marked done" : "not marked done"}
          </small>
        </span>
        <Tag tone={done ? "strong" : "plain"}>{done ? "Done" : "Open"}</Tag>
      </summary>
      <div className="cross-step__body">
        <PlanStepDetail step={step} done={done} onToggle={onToggle} isCross />
      </div>
    </details>
  );
}

function ActionPlan({ data, done, onToggle, stage, onStageChange, stepKey, onStepSelect }) {
  const completed = data.actionPlan.filter((s) => done.has(s.title)).length;
  const pct = data.actionPlan.length ? Math.round((completed / data.actionPlan.length) * 100) : 0;
  const stages = useMemo(() => buildPlanStages(data.actionPlan), [data.actionPlan]);
  const activeIndex = stages.length ? Math.min(Math.max(stage, 0), stages.length - 1) : 0;
  const currentStage = stages[activeIndex];
  const activeStep = currentStage
    ? currentStage.steps.find((s) => s.title === stepKey) || currentStage.steps[0]
    : null;
  const stageRefs = useRef({});
  const stageDone = currentStage
    ? currentStage.steps.filter((s) => done.has(s.title)).length
    : 0;

  const urgent = data.referrals.filter((r) => ["police-112", "cyber-1930", "childline"].includes(r.id));

  function selectStage(index) {
    onStageChange(index);
    onStepSelect(stages[index]?.steps[0]?.title || null);
  }

  function onStageKeyDown(event) {
    if (!stages.length) return;
    let next = null;
    if (event.key === "ArrowRight") next = (activeIndex + 1) % stages.length;
    else if (event.key === "ArrowLeft") next = (activeIndex - 1 + stages.length) % stages.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = stages.length - 1;

    if (next !== null) {
      event.preventDefault();
      selectStage(next);
      window.requestAnimationFrame(() => stageRefs.current[next]?.focus());
    }
  }

  return (
    <>
      <div className="no-print">
        <Panel
          title="Action workspace"
          icon="route"
          sub={`${completed} of ${data.actionPlan.length} steps marked done${currentStage ? ` · ${currentStage.label} selected` : ""}`}
          right={
            <div className="meter" style={{ minWidth: 150 }}>
              <div className="meter__bar">
                <div className="meter__fill meter__fill--good" style={{ width: `${pct}%` }} />
              </div>
              <span className="meter__val">{pct}%</span>
            </div>
          }
          flush
        >
          {stages.length ? (
            <>
              <div
                className="stagebar"
                role="tablist"
                aria-label="Action plan stages"
                onKeyDown={onStageKeyDown}
              >
                {stages.map((s, i) => {
                  const doneInStage = s.steps.filter((step) => done.has(step.title)).length;
                  return (
                    <button
                      key={s.id}
                      ref={(el) => {
                        stageRefs.current[i] = el;
                      }}
                      id={`plan-stage-tab-${i}`}
                      type="button"
                      role="tab"
                      aria-selected={i === activeIndex}
                      aria-controls={`plan-stage-panel-${i}`}
                      tabIndex={i === activeIndex ? 0 : -1}
                      className="stagebar__tab"
                      data-on={i === activeIndex}
                      onClick={() => selectStage(i)}
                    >
                      <span className="stagebar__k">Stage {i + 1}</span>
                      <span className="stagebar__label">{s.label}</span>
                      <span className="stagebar__count">
                        {doneInStage}/{s.steps.length}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div
                className="plan-workspace"
                id={`plan-stage-panel-${activeIndex}`}
                role="tabpanel"
                aria-labelledby={`plan-stage-tab-${activeIndex}`}
              >
                <div className="plan-steps">
                  <div className="plan-steps__head">
                    <div>
                      <p className="plan-steps__eyebrow">Stage {activeIndex + 1}</p>
                      <h3>{currentStage.label}</h3>
                    </div>
                    <span className="plan-steps__count">
                      {stageDone}/{currentStage.steps.length} done
                    </span>
                  </div>
                  {currentStage.steps.map((step) => (
                    <PlanStepCard
                      key={step.title}
                      step={step}
                      done={done.has(step.title)}
                      selected={activeStep?.title === step.title}
                      onToggle={onToggle}
                      onSelect={() => onStepSelect(step.title)}
                    />
                  ))}
                </div>

                {activeStep ? (
                  <PlanStepDetail
                    step={activeStep}
                    done={done.has(activeStep.title)}
                    onToggle={onToggle}
                  />
                ) : (
                  <Empty title="Choose a step">
                    Select a step to read its full instructions.
                  </Empty>
                )}
              </div>
            </>
          ) : (
            <Empty title="No action plan for this issue type yet">
              Choose a category at intake and a plan will be produced from the corpus.
            </Empty>
          )}
        </Panel>

        {data.crossStatute?.length ? (
          <details className="plan-extra">
            <summary>
              <span>
                <b>If this is also another kind of problem</b>
                <small>
                  {data.crossStatute.length} related step
                  {data.crossStatute.length === 1 ? "" : "s"} because more than one issue type matched
                </small>
              </span>
              <Icon name="chevron" size={15} />
            </summary>
            <div className="plan-extra__body">
              {data.crossStatute.map((s) => (
                <CrossStatuteStep
                  key={s.title}
                  step={s}
                  done={done.has(s.title)}
                  onToggle={onToggle}
                />
              ))}
            </div>
          </details>
        ) : null}
      </div>

      <div className="plan-bottom">
        <Panel
          title="Where to get help"
          icon="phone"
          sub="Free, and available to anyone entitled under the Legal Services Authorities Act, 1987"
        >
          <div className="refs refs--grid">
            {urgent.map((r) => (
              <div className="ref ref--urgent" key={r.id}>
                <div>
                  <p className="ref__name">{r.name}</p>
                  <p className="ref__when">{r.when}</p>
                  <p className="ref__note">{r.note}</p>
                </div>
                <a className="ref__value" href={r.sourceUrl} target="_blank" rel="noreferrer">
                  {r.value}
                </a>
              </div>
            ))}
            {data.referrals
              .filter((r) => !["police-112", "cyber-1930", "childline"].includes(r.id))
              .map((r) => (
                <div className="ref" key={r.id}>
                  <div>
                    <p className="ref__name">
                      {r.name} {!r.verified ? <Tag tone="warn">confirm</Tag> : null}
                    </p>
                    <p className="ref__when">{r.when}</p>
                    <p className="ref__note">{r.note}</p>
                  </div>
                  <a className="ref__value" href={r.sourceUrl} target="_blank" rel="noreferrer">
                    {r.value}
                  </a>
                </div>
              ))}
          </div>
        </Panel>

        <div>
          <Notice tone="warn" title="One thing we will not do">
            <p>
              We will not print a deadline that no source states. Where a period matters and our
              corpus does not fix one, the step says so and tells you who to ask. A wrong date
              printed confidently is worse than an honest gap.
            </p>
          </Notice>

          <Notice tone="info" title="Take this with you">
            <p>
              Print this page and take it to a lawyer or a Legal Services Authority volunteer. The
              printed dossier includes the provisions, the decisions and the evidence list, with the
              source links written out in full.
            </p>
          </Notice>
        </div>
      </div>

      <div className="print-only plan-print">
        <h2>Action plan</h2>
        {data.actionPlan.map((s) => (
          <section key={s.title}>
            <h3>
              Step {s.order}. {s.title}
            </h3>
            <p>{s.why}</p>
            {s.steps ? (
              <p>
                <b>How: </b>
                {s.steps}
              </p>
            ) : null}
            <p>
              <b>Documents: </b>
              {s.evidenceNeeded}
            </p>
            {s.deadline ? (
              <p>
                <b>Timing: </b>
                {s.deadline}
              </p>
            ) : null}
            {s.provisionRefs?.length ? (
              <p>
                <b>Related sources: </b>
                {s.provisionRefs.map((r) => r.label).join("; ")}
              </p>
            ) : null}
          </section>
        ))}
      </div>
    </>
  );
}

/* ==========================================================================
   Export
   ========================================================================== */

export function buildPrintDocument(data, form) {
  const L = [];
  const push = (s = "") => L.push(s);

  push("JollyLLM — preliminary case dossier");
  push("=".repeat(64));
  push("");
  push(`Matter:            ${data.summary.headline}`);
  push(`Issue type:        ${data.summary.issueType}`);
  if (data.input.location) push(`Place:             ${data.input.location}`);
  if (data.input.startDate) push(`First incident:    ${data.input.startDate}`);
  push(`Language:          ${data.language.label}`);
  push(`Generated:         ${new Date(data.generatedAt).toLocaleString("en-IN")}`);
  push("");
  push(
    "This dossier was produced by an automated research prototype from a bundled corpus of",
  );
  push(
    "Indian statute. It is legal information, not legal advice, and it is not a conclusion",
  );
  push(
    "about your case. Provision numbers and citations were checked against official sources,",
  );
  push(
    "but the application of the law to your facts has to be assessed by a qualified lawyer.",
  );
  push("");
  push(`Coverage assessment: ${data.uncertainty.reliability.label} (${Math.round(data.uncertainty.reliability.score * 100)}%)`);
  for (const g of data.uncertainty.gaps) push(`  - ${g}`);
  push("");

  push("1. ACCOUNT AS RECORDED");
  push("-".repeat(64));
  push(data.input.narrative);
  push("");

  push("2. FACTS IDENTIFIED (sentences from the account above)");
  push("-".repeat(64));
  data.facts.forEach((f, i) => push(`${i + 1}. ${f.text}`));
  push("");

  push("3. TIMELINE");
  push("-".repeat(64));
  if (data.timeline.events.length) {
    data.timeline.events.forEach((e) =>
      push(`  ${e.date}  [${e.dateText}]${e.needsReview ? "  (CHECK DATE)" : ""}\n      ${e.event}`),
    );
  } else {
    push("  No dates could be read from the account.");
  }
  push("");

  push("4. PROVISIONS THAT MAY APPLY");
  push("-".repeat(64));
  data.provisions.forEach((p) => {
    push(`  ${p.actShortTitle || p.act}, s. ${p.section} — ${p.heading}`);
    push(`      Match: ${p.relevance}${p.score != null ? ` (${p.score.toFixed(3)})` : ""}`);
    push(`      ${p.summary}`);
    if (p.sourceUrl) push(`      Source: ${p.sourceUrl}`);
    push("");
  });

  push("5. JUDGMENTS");
  push("-".repeat(64));
  if (data.judgments.length) {
    data.judgments.forEach((j) => {
      push(`  ${j.title}, ${j.citation} (${j.court}, ${j.year})`);
      push(`      Facts: ${j.factsPattern}`);
      push(`      Held (paraphrase): ${j.holding}`);
      push(`      Verify: ${j.verifyUrl}`);
      push("");
    });
  } else {
    push("  No decision in the bundled corpus matched this fact pattern.");
  }

  push("6. EVIDENCE TO GATHER");
  push("-".repeat(64));
  data.evidence.forEach((e) => push(`  [ ] ${e.item}\n      Source: ${e.source}`));
  push("");

  push("7. ACTION PLAN");
  push("-".repeat(64));
  data.actionPlan.forEach((s) => {
    push(`  Step ${s.order}. ${s.title}`);
    push(`      Why: ${s.why}`);
    if (s.steps) push(`      How: ${s.steps}`);
    push(`      Documents: ${s.evidenceNeeded}`);
    if (s.deadline) push(`      TIMING: ${s.deadline}`);
    if (s.provisionRefs?.length)
      push(`      Basis: ${s.provisionRefs.map((r) => r.label).join("; ")}`);
    push("");
  });

  push("8. WHERE TO GET HELP");
  push("-".repeat(64));
  data.referrals.forEach((r) => {
    push(`  ${r.name} — ${r.value}`);
    push(`      ${r.when}`);
    if (r.sourceUrl) push(`      ${r.sourceUrl}`);
  });
  push("");
  push("-".repeat(64));
  push("Generated by JollyLLM. Verify every citation before relying on it.");

  return L.join("\n");
}

/* -------------------------------------------------------------------------
   Courtroom Opponent Simulation View
   ------------------------------------------------------------------------- */

function OpponentSimulationView({ data, onToast }) {
  const [loading, setLoading] = useState(false);
  const [simulation, setSimulation] = useState(null);
  const [scenarioInput, setScenarioInput] = useState("");

  const oppData = simulation || data?.opponentSimulation || null;

  async function runSim(customScenario = null) {
    setLoading(true);
    try {
      // If data.caseId exists or create temp case
      const payload = {
        title: data.summary?.headline || data.input?.title || "Legal Dispute",
        narrative: (data.facts || []).map((f) => f.text || f.statement).join(". ") || data.input?.narrative || "",
        category: data.classification?.[0]?.id || data.input?.category || "domestic-violence",
        jurisdiction: data.input?.location || "India",
      };

      // Call API
      const caseRes = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then((r) => r.json());

      if (caseRes?.case?.id) {
        const simRes = await fetch(`/api/cases/${caseRes.case.id}/opponent-simulation`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customScenario }),
        }).then((r) => r.json());

        if (simRes?.simulation?.report) {
          setSimulation(simRes.simulation.report);
          onToast?.("Courtroom opponent simulation generated");
        }
      }
    } catch (err) {
      onToast?.("Could not run opponent simulation: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <Notice tone="info" title="Courtroom Opponent Simulation Agent">
        <p>
          This simulator acts as an aggressive opposing counsel to pressure-test your case. It
          identifies evidentiary vulnerabilities, anticipates adversarial defenses, and generates
          challenging cross-examination questions so you can prepare effectively before approaching court.
        </p>
      </Notice>

      {!oppData ? (
        <Panel title="Run Adversarial Case Simulation" icon="scale">
          <p style={{ color: "var(--ink-soft)", fontSize: "0.92rem", marginBottom: 16 }}>
            Click below to generate a deep adversarial analysis of your case facts under Indian Law,
            including evidence admissibility challenges under the Bharatiya Sakshya Adhiniyam, 2023.
          </p>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button
              className="btn btn--brass"
              onClick={() => runSim()}
              disabled={loading}
              type="button"
            >
              {loading ? "Simulating Opposing Counsel..." : "Launch Opponent Simulation"}
            </button>
          </div>
        </Panel>
      ) : (
        <>
          {/* Opposing Theory */}
          <Panel
            title="Opposing Counsel's Core Theory of the Case"
            icon="scale"
            sub="The primary alternative narrative and statutory defenses the other side will argue"
            right={<Tag tone="danger">Adversarial Position</Tag>}
          >
            <div
              style={{
                background: "var(--crimson-50, #fff5f5)",
                borderLeft: "4px solid var(--crimson, #c53030)",
                padding: "14px 18px",
                borderRadius: "0 6px 6px 0",
                fontSize: "0.94rem",
                lineHeight: 1.6,
                color: "var(--ink)",
              }}
            >
              <b>Theory:</b> {oppData.opposingTheory}
            </div>
          </Panel>

          {/* Vulnerable Facts & Evidence Attacks */}
          <div className="grid-2">
            <Panel
              title="Vulnerable Facts"
              icon="layers"
              sub="Statements the defense will challenge"
              flush
            >
              {(oppData.vulnerableFacts || []).map((vf, i) => (
                <div
                  key={i}
                  style={{
                    padding: "12px 18px",
                    borderBottom: "1px solid var(--ivory-200)",
                    fontSize: "0.88rem",
                  }}
                >
                  <p style={{ margin: 0, fontWeight: 600, color: "var(--navy-800)" }}>{vf.fact}</p>
                  <p style={{ margin: "4px 0 0", color: "var(--crimson, #c53030)", fontSize: "0.82rem" }}>
                    <b>Vulnerability:</b> {vf.vulnerability}
                  </p>
                  <p style={{ margin: "3px 0 0", color: "var(--ink-soft)", fontSize: "0.82rem" }}>
                    <b>Opponent Strategy:</b> {vf.howOpponentWillExploit}
                  </p>
                </div>
              ))}
            </Panel>

            <Panel
              title="Evidence Attacks & BSA Admissibility"
              icon="doc"
              sub="Evidentiary defects and certification requirements"
              flush
            >
              {(oppData.evidenceAttacks || []).map((ea, i) => (
                <div
                  key={i}
                  style={{
                    padding: "12px 18px",
                    borderBottom: "1px solid var(--ivory-200)",
                    fontSize: "0.88rem",
                  }}
                >
                  <p style={{ margin: 0, fontWeight: 600, color: "var(--navy-800)" }}>
                    Target: {ea.evidenceItem}
                  </p>
                  <p style={{ margin: "4px 0 0", color: "var(--crimson, #c53030)", fontSize: "0.82rem" }}>
                    <b>Defect:</b> {ea.defectOrChallenge}
                  </p>
                  <p style={{ margin: "3px 0 0", color: "var(--ink-soft)", fontSize: "0.82rem" }}>
                    <b>Required Corroboration:</b> {ea.requiredCorroboration}
                  </p>
                </div>
              ))}
            </Panel>
          </div>

          {/* Cross Examination Simulator */}
          <Panel
            title="Cross-Examination Simulator"
            icon="clock"
            sub="Grounded questions an opposing lawyer will ask you during trial"
          >
            <div style={{ display: "grid", gap: 14 }}>
              {(oppData.crossExaminationQuestions || []).map((q, i) => (
                <div
                  key={i}
                  style={{
                    border: "1px solid var(--ivory-300)",
                    borderRadius: 8,
                    padding: 16,
                    background: "var(--paper)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 8,
                    }}
                  >
                    <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--ink-faint)" }}>
                      Target: {q.target}
                    </span>
                    <Tag tone={q.dangerLevel === "high" ? "danger" : "brass"}>
                      {q.dangerLevel === "high" ? "High Danger Question" : "Medium Risk"}
                    </Tag>
                  </div>
                  <p
                    style={{
                      margin: "0 0 8px",
                      fontSize: "0.96rem",
                      fontWeight: 600,
                      color: "var(--navy-900)",
                      fontFamily: "serif",
                    }}
                  >
                    "{q.question}"
                  </p>
                  <p style={{ margin: "4px 0", fontSize: "0.84rem", color: "var(--ink-soft)" }}>
                    <b>Why this matters:</b> {q.whyItMatters}
                  </p>
                  <p style={{ margin: "4px 0 0", fontSize: "0.84rem", color: "var(--forest, #2e7d32)" }}>
                    <b>Preparation Advice:</b> {q.recommendedPreparation}
                  </p>
                </div>
              ))}
            </div>
          </Panel>

          {/* Adverse Precedents & Rebuttal Strategies */}
          <div className="grid-2">
            <Panel
              title="Adverse / Contrary Precedents"
              icon="scale"
              sub="Judgments that limit or challenge your claim"
              flush
            >
              {(oppData.adversePrecedents || []).map((ap, i) => (
                <div
                  key={i}
                  style={{
                    padding: "12px 18px",
                    borderBottom: "1px solid var(--ivory-200)",
                    fontSize: "0.88rem",
                  }}
                >
                  <p style={{ margin: 0, fontWeight: 600, color: "var(--navy-800)" }}>{ap.citation}</p>
                  <p style={{ margin: "3px 0", fontSize: "0.82rem", color: "var(--ink-soft)" }}>
                    {ap.principle}
                  </p>
                  <p style={{ margin: "3px 0 0", color: "var(--forest, #2e7d32)", fontSize: "0.82rem" }}>
                    <b>How to distinguish:</b> {ap.distinguishingStrategy}
                  </p>
                </div>
              ))}
            </Panel>

            <Panel
              title="Ranked Opponent Move Predictions"
              icon="route"
              sub="Plausible procedural maneuvers"
              flush
            >
              {(oppData.opponentMovePredictions || []).map((mp, i) => (
                <div
                  key={i}
                  style={{
                    padding: "12px 18px",
                    borderBottom: "1px solid var(--ivory-200)",
                    fontSize: "0.88rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, color: "var(--navy-800)" }}>
                      #{mp.rank || i + 1} {mp.move}
                    </span>
                    <Tag tone={mp.impact === "critical" ? "danger" : "plain"}>{mp.likelihood}</Tag>
                  </div>
                  <p style={{ margin: "3px 0 0", color: "var(--ink-soft)", fontSize: "0.82rem" }}>
                    <b>Countermeasure:</b> {mp.counterMeasure}
                  </p>
                </div>
              ))}
            </Panel>
          </div>

          {/* Scenario Sensitivity Testing ("What If" Analysis) */}
          <Panel
            title="Adversarial Scenario Sensitivity Testing ('What If?')"
            icon="search"
            sub="Test how your legal viability shifts if specific facts change or evidence is denied"
          >
            <div style={{ marginBottom: 14 }}>
              {oppData.scenarioAnalysis?.assessment ? (
                <div
                  style={{
                    background: "var(--ivory-100)",
                    padding: 14,
                    borderRadius: 6,
                    marginBottom: 14,
                  }}
                >
                  <p style={{ margin: "0 0 6px", fontWeight: 600, fontSize: "0.9rem" }}>
                    Tested Scenario: {oppData.scenarioAnalysis.scenario}
                  </p>
                  <p style={{ margin: "0 0 6px", fontSize: "0.86rem", color: "var(--ink)" }}>
                    {oppData.scenarioAnalysis.assessment}
                  </p>
                  <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--forest, #2e7d32)" }}>
                    <b>Preparation Priority:</b> {oppData.scenarioAnalysis.preparationPriority}
                  </p>
                </div>
              ) : null}

              <div style={{ display: "flex", gap: 10 }}>
                <input
                  type="text"
                  placeholder="e.g., What if the opponent denies receiving the statutory notice?"
                  value={scenarioInput}
                  onChange={(e) => setScenarioInput(e.target.value)}
                  style={{
                    flex: 1,
                    padding: "9px 12px",
                    border: "1px solid var(--ivory-300)",
                    borderRadius: 6,
                    fontSize: "0.9rem",
                  }}
                />
                <button
                  className="btn btn--brass btn--sm"
                  type="button"
                  disabled={loading || !scenarioInput.trim()}
                  onClick={() => runSim(scenarioInput)}
                >
                  {loading ? "Testing..." : "Test Scenario"}
                </button>
              </div>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

export {
  Overview,
  TimelineEvidence,
  LegalResearch,
  ActionPlan,
  AiBlock,
  AiBadge,
  OpponentSimulationView,
};
