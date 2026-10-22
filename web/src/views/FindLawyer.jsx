import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { Empty, Icon, Loading, Notice, Tag } from "../ui.jsx";

const MAX_COMPARE = 3;

const EMPTY_FILTERS = {
  q: "",
  category: "",
  city: "",
  maxFee: "",
  mode: "",
  sort: "relevance",
};

function readInitialFilters() {
  const raw = window.location.hash || "";
  const index = raw.indexOf("?");
  const params = new URLSearchParams(index === -1 ? "" : raw.slice(index + 1));
  return {
    q: params.get("q") || "",
    category: params.get("category") || "",
    city: params.get("city") || "",
    maxFee: params.get("maxFee") || "",
    mode: params.get("mode") || "",
    sort: params.get("sort") || "relevance",
  };
}

function initials(name) {
  return String(name || "")
    .replace(/\(demo\)/gi, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatFee(lawyer) {
  if (typeof lawyer.consultationFee !== "number") return "Not provided";
  const amount = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: lawyer.currency || "INR",
    maximumFractionDigits: 0,
  }).format(lawyer.consultationFee);
  return `${amount} ${lawyer.feeUnit || ""}`.trim();
}

function contactAction(lawyer) {
  if (lawyer.isDemo) {
    return <span className="law-card__unavailable">Demo profile — not contactable</span>;
  }
  if (lawyer.bookingUrl) {
    return (
      <a
        className="btn btn--brass btn--sm"
        href={lawyer.bookingUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        Booking link <Icon name="arrow" size={13} />
      </a>
    );
  }
  if (lawyer.contactDetails?.phone) {
    return (
      <a className="btn btn--brass btn--sm" href={`tel:${lawyer.contactDetails.phone}`}>
        <Icon name="phone" size={13} /> Call
      </a>
    );
  }
  if (lawyer.contactDetails?.email) {
    return (
      <a className="btn btn--brass btn--sm" href={`mailto:${lawyer.contactDetails.email}`}>
        Email
      </a>
    );
  }
  return <span className="law-card__unavailable">Contact details not provided</span>;
}

function LawyerCard({ lawyer, selected, compareFull, onToggleCompare }) {
  const verified = lawyer.verificationStatus === "verified";

  return (
    <article className="law-card">
      <div className="law-card__top">
        <div className="law-card__avatar" aria-hidden="true">
          {initials(lawyer.name) || "?"}
        </div>
        <div className="law-card__identity">
          <h3>{lawyer.name}</h3>
          <div className="law-card__badges">
            {lawyer.isDemo ? <Tag tone="warn">Demo profile — not a real lawyer</Tag> : null}
            {verified ? <Tag tone="strong">Credentials verified</Tag> : null}
          </div>
          <p className="law-card__source">
            Source: {lawyer.profileSource || "Not provided"}
            {lawyer.barCouncil ? ` · ${lawyer.barCouncil}` : ""}
            {lawyer.enrolmentNumber ? ` · Enrolment ${lawyer.enrolmentNumber}` : ""}
          </p>
        </div>
      </div>

      <div className="law-card__areas">
        {(lawyer.practiceAreas || []).map((area) => (
          <Tag key={area.id} tone="core">
            {area.label}
          </Tag>
        ))}
      </div>

      <dl className="law-card__facts">
        <div>
          <dt>City</dt>
          <dd>{lawyer.city || "Not provided"}</dd>
        </div>
        <div>
          <dt>Experience</dt>
          <dd>
            {typeof lawyer.experienceYears === "number"
              ? `${lawyer.experienceYears} year${lawyer.experienceYears === 1 ? "" : "s"}`
              : "Not provided"}
          </dd>
        </div>
        <div>
          <dt>Consultation fee</dt>
          <dd className="law-card__fee">{formatFee(lawyer)}</dd>
        </div>
        <div>
          <dt>Mode</dt>
          <dd>
            {(lawyer.consultationModes || []).length
              ? lawyer.consultationModes
                  .map((mode) => (mode === "in-person" ? "In person" : "Online"))
                  .join(" · ")
              : "Not provided"}
          </dd>
        </div>
        <div>
          <dt>Languages</dt>
          <dd>
            {(lawyer.languages || []).length ? lawyer.languages.join(", ") : "Not provided"}
          </dd>
        </div>
        {lawyer.availabilityStatus ? (
          <div>
            <dt>Availability</dt>
            <dd>{lawyer.availabilityStatus}</dd>
          </div>
        ) : null}
      </dl>

      {lawyer.matchReasons?.length && !lawyer.isDemo ? (
        <p className="law-card__reasons">{lawyer.matchReasons.join(" · ")}</p>
      ) : null}

      <div className="law-card__foot">
        <label
          className="law-card__compare"
          title={compareFull && !selected ? `You can compare up to ${MAX_COMPARE} lawyers` : undefined}
        >
          <input
            type="checkbox"
            checked={selected}
            disabled={compareFull && !selected}
            onChange={() => onToggleCompare(lawyer)}
          />
          <span>{selected ? "Added to compare" : "Compare"}</span>
        </label>
        {contactAction(lawyer)}
      </div>
    </article>
  );
}

function CompareTable({ lawyers, onRemove, onClear }) {
  const fields = [
    {
      label: "Consultation fee",
      value: (l) => formatFee(l),
    },
    {
      label: "Experience",
      value: (l) =>
        typeof l.experienceYears === "number"
          ? `${l.experienceYears} year${l.experienceYears === 1 ? "" : "s"}`
          : "Not provided",
    },
    { label: "City", value: (l) => l.city || "Not provided" },
    {
      label: "Mode",
      value: (l) =>
        (l.consultationModes || [])
          .map((mode) => (mode === "in-person" ? "In person" : "Online"))
          .join(" · ") || "Not provided",
    },
    {
      label: "Languages",
      value: (l) => (l.languages || []).join(", ") || "Not provided",
    },
    {
      label: "Practice areas",
      value: (l) => (l.practiceAreas || []).map((p) => p.label).join(", ") || "Not provided",
    },
    {
      label: "Verification",
      value: (l) =>
        l.verificationStatus === "verified"
          ? "Verified"
          : l.isDemo
            ? "Demo profile — not verified"
            : "Not verified",
    },
  ];

  return (
    <section className="law-compare" aria-labelledby="law-compare-title">
      <div className="law-compare__head">
        <div>
          <h2 id="law-compare-title">Compare lawyers</h2>
          <p>Side by side, using only the information each profile provides.</p>
        </div>
        <button type="button" className="btn btn--quiet btn--sm" onClick={onClear}>
          Clear comparison
        </button>
      </div>
      <div className="law-compare__scroll">
        <table>
          <caption className="sr-only">Comparison of selected lawyer profiles</caption>
          <thead>
            <tr>
              <th scope="col">Field</th>
              {lawyers.map((lawyer) => (
                <th scope="col" key={lawyer.id}>
                  <span>{lawyer.name}</span>
                  <button
                    type="button"
                    className="law-compare__remove"
                    onClick={() => onRemove(lawyer)}
                    aria-label={`Remove ${lawyer.name} from comparison`}
                  >
                    Remove
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fields.map((field) => (
              <tr key={field.label}>
                <th scope="row">{field.label}</th>
                {lawyers.map((lawyer) => (
                  <td key={lawyer.id}>{field.value(lawyer)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="law-compare__note">
        A lower consultation fee does not mean a lawyer is the right fit for your matter. Compare
        practice area and experience as well as price.
      </p>
    </section>
  );
}

export default function FindLawyer({ meta }) {
  const [filters, setFilters] = useState(readInitialFilters);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryKey, setRetryKey] = useState(0);
  const [selected, setSelected] = useState([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const requestId = useRef(0);

  const categories = meta?.categories || [];
  const legalAid = (meta?.referrals || []).find(
    (referral) =>
      referral.id === "nalsa" && referral.verified !== false && referral.sourceUrl,
  );
  const dlsa = (meta?.referrals || []).find((referral) => referral.id === "dlsa");
  const activeCount = useMemo(
    () =>
      ["q", "category", "city", "maxFee", "mode"].filter((key) => String(filters[key] || "").trim())
        .length,
    [filters],
  );

  useEffect(() => {
    const id = requestId.current + 1;
    requestId.current = id;
    setLoading(true);
    setError(null);

    const timer = setTimeout(async () => {
      try {
        const result = await api.lawyers({
          q: filters.q,
          category: filters.category,
          city: filters.city,
          maxFee: filters.maxFee,
          mode: filters.mode,
          sort: filters.sort,
        });
        if (requestId.current !== id) return;
        setData(result);
      } catch (err) {
        if (requestId.current !== id) return;
        setError(err);
      } finally {
        if (requestId.current === id) setLoading(false);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [
    filters.q,
    filters.category,
    filters.city,
    filters.maxFee,
    filters.mode,
    filters.sort,
    retryKey,
  ]);

  const set = (key) => (event) => {
    const value = event.target.value;
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  function clearFilters() {
    setFilters({ ...EMPTY_FILTERS });
  }

  function toggleCompare(lawyer) {
    setSelected((prev) => {
      if (prev.some((item) => item.id === lawyer.id)) {
        return prev.filter((item) => item.id !== lawyer.id);
      }
      if (prev.length >= MAX_COMPARE) return prev;
      return [...prev, lawyer];
    });
  }

  function removeCompare(lawyer) {
    setSelected((prev) => prev.filter((item) => item.id !== lawyer.id));
  }

  const selectedIds = new Set(selected.map((item) => item.id));
  const compareFull = selected.length >= MAX_COMPARE;
  const showInitialLoading = loading && !data;
  const lawyers = data?.lawyers || [];
  const demoOnly = Boolean(data?.demoOnly);
  const directoryEmpty = Boolean(data && !data.hasListings);
  const filtersDisabled = directoryEmpty;

  return (
    <>
      <main className="law-page">
        <section className="shell law-intro">
          <p className="kicker">Legal directory</p>
          <h1>Find a lawyer</h1>
          <p className="law-intro__lede">
            {directoryEmpty
              ? "No authorised lawyer listings are configured, so the filters below are disabled. JollyLLM does not substitute fictional profiles."
              : "Search by legal issue, city, consultation budget and mode. Results are filtered deterministically from the information each profile provides - not ranked by an AI guess, ratings or case-success claims."}
          </p>
        </section>

        <div className="shell">
          <Notice
            tone={demoOnly ? "warn" : "info"}
            title={
              demoOnly
                ? "Demo data — not real lawyers"
                : directoryEmpty
                  ? "No lawyer listings are available"
                  : "How to read this directory"
            }
          >
            <p>
              {data?.notice ||
                "Profiles show only the fields they actually contain. A profile in this directory is not proof that a lawyer's credentials have been verified."}
            </p>
            <p style={{ marginTop: 8 }}>
              Not every legal problem needs paid representation. Free legal aid information is
              available in the Action Plan and the Sources pages.
            </p>
          </Notice>

          <form
            className="law-filters"
            onSubmit={(event) => event.preventDefault()}
            aria-label="Filter lawyers"
          >
            {filtersDisabled ? (
              <p className="law-filters__unavailable" role="status">
                Search and filters are unavailable because no lawyer listings are configured.
              </p>
            ) : null}
            <div className="law-filters__field law-filters__field--wide">
              <label htmlFor="law-q">Search</label>
              <div className="law-filters__search">
                <Icon name="search" size={15} />
                <input
                  id="law-q"
                  type="text"
                  value={filters.q}
                  onChange={set("q")}
                  placeholder="Legal issue, practice area or lawyer name"
                  autoComplete="off"
                  disabled={filtersDisabled}
                />
              </div>
            </div>

            <div className="law-filters__field">
              <label htmlFor="law-category">Case category</label>
              <select
                id="law-category"
                value={filters.category}
                onChange={set("category")}
                disabled={filtersDisabled}
              >
                <option value="">All categories</option>
                {categories.map((category) => (
                  <option value={category.id} key={category.id}>
                    {category.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="law-filters__field">
              <label htmlFor="law-city">City or location</label>
              <input
                id="law-city"
                type="text"
                value={filters.city}
                onChange={set("city")}
                placeholder="e.g. Pune"
                list="law-cities"
                autoComplete="off"
                disabled={filtersDisabled}
              />
              <datalist id="law-cities">
                {(data?.facets?.cities || []).map((city) => (
                  <option value={city} key={city} />
                ))}
              </datalist>
            </div>

            <div className="law-filters__field">
              <label htmlFor="law-fee">Maximum consultation fee</label>
              <input
                id="law-fee"
                type="number"
                min="0"
                step="100"
                inputMode="numeric"
                value={filters.maxFee}
                onChange={set("maxFee")}
                placeholder="Any budget"
                disabled={filtersDisabled}
              />
            </div>

            <div className="law-filters__field">
              <label htmlFor="law-mode">Consultation mode</label>
              <select
                id="law-mode"
                value={filters.mode}
                onChange={set("mode")}
                disabled={filtersDisabled}
              >
                <option value="">Any mode</option>
                <option value="online">Online</option>
                <option value="in-person">In person</option>
              </select>
            </div>

            <div className="law-filters__field">
              <label htmlFor="law-sort">Sort by</label>
              <select
                id="law-sort"
                value={filters.sort}
                onChange={set("sort")}
                disabled={filtersDisabled}
              >
                <option value="relevance">Relevance</option>
                <option value="fee-asc">Consultation fee: low to high</option>
                <option value="fee-desc">Consultation fee: high to low</option>
                <option value="experience">Experience</option>
              </select>
            </div>

            <div className="law-filters__actions">
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={clearFilters}
                disabled={filtersDisabled || (activeCount === 0 && filters.sort === "relevance")}
              >
                Clear filters
              </button>
            </div>
          </form>

          <div className="law-results-bar">
            <p role="status" aria-live="polite">
              {showInitialLoading
                ? "Finding lawyers…"
                : error
                  ? "Results could not be loaded."
                  : directoryEmpty
                    ? "No lawyer listings are available."
                    : `${data?.total ?? 0} profile${data?.total === 1 ? "" : "s"} match your filters`}
              {loading && data ? " · updating…" : ""}
            </p>
            <div className="law-results-bar__actions">
              {selected.length ? (
                <span className="law-results-bar__selected">
                  {selected.length}/{MAX_COMPARE} selected
                </span>
              ) : null}
              <button
                type="button"
                className="btn btn--brass btn--sm"
                onClick={() => setCompareOpen((open) => !open)}
                disabled={selected.length < 2}
              >
                Compare {selected.length >= 2 ? `(${selected.length})` : ""}
              </button>
              {selected.length ? (
                <button
                  type="button"
                  className="btn btn--quiet btn--sm"
                  onClick={() => {
                    setSelected([]);
                    setCompareOpen(false);
                  }}
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>

          {compareOpen && selected.length >= 2 ? (
            <CompareTable
              lawyers={selected}
              onRemove={removeCompare}
              onClear={() => {
                setSelected([]);
                setCompareOpen(false);
              }}
            />
          ) : null}

          {showInitialLoading ? <Loading label="Finding lawyers…" /> : null}

          {error ? (
            <Notice tone="warn" title="The lawyer directory is not reachable">
              <p>{error.message}</p>
              <p style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setRetryKey((value) => value + 1)}
                >
                  <Icon name="reset" size={13} /> Retry
                </button>
              </p>
            </Notice>
          ) : null}

          {!error && !showInitialLoading && lawyers.length === 0 ? (
            <div className="law-empty">
              {directoryEmpty ? (
                <>
                  <Empty icon="info" title="No lawyer listings are available">
                    No authorised lawyer directory is configured. JollyLLM does not show fictional
                    or unverified profiles as real listings.
                  </Empty>
                  <div className="law-cta">
                    <div>
                      <h3>Free legal aid is available</h3>
                      <p>
                        {dlsa?.note ||
                          "Every district has a District Legal Services Authority (DLSA). Ask the court clerk for the Legal Services Cell."}{" "}
                        You can ask about free legal aid, legal aid clinics and lok adalats under the
                        Legal Services Authorities Act, 1987.
                      </p>
                      <p>
                        NALSA coordinates the District Legal Services Authorities. Use its official
                        website to find the State or District Legal Services Authority for your
                        area.
                      </p>
                    </div>
                    <div className="law-aid__actions">
                      {legalAid?.sourceUrl ? (
                        <a
                          className="btn btn--brass btn--sm"
                          href={legalAid.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Official NALSA website <Icon name="arrow" size={13} />
                        </a>
                      ) : null}
                      <a className="btn btn--ghost btn--sm" href="#sources">
                        Legal aid sources <Icon name="arrow" size={13} />
                      </a>
                    </div>
                  </div>
                </>
              ) : (
                <Empty icon="search" title="No lawyers match these filters">
                  Try removing the budget or city filter, or choose a different case category.
                </Empty>
              )}
              {!directoryEmpty ? (
                <button type="button" className="btn btn--ghost btn--sm" onClick={clearFilters}>
                  Clear all filters
                </button>
              ) : null}
            </div>
          ) : null}

          {!error && !showInitialLoading && lawyers.length ? (
            <div className="law-grid">
              {lawyers.map((lawyer) => (
                <LawyerCard
                  key={lawyer.id}
                  lawyer={lawyer}
                  selected={selectedIds.has(lawyer.id)}
                  compareFull={compareFull}
                  onToggleCompare={toggleCompare}
                />
              ))}
            </div>
          ) : null}

          {demoOnly && !error ? (
            <p className="law-footnote">
              Demo mode is active. Every profile above is fictional and is shown only to demonstrate
              the directory. No demo profile can be contacted, booked or treated as a real
              practitioner. Real, authorised listings will be added separately.
            </p>
          ) : null}
        </div>
      </main>
    </>
  );
}
