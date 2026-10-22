/**
 * Lawyer directory data and deterministic matching.
 *
 * There are no authorised real listings in this prototype. `REAL_LAWYERS` is
 * the production data source and remains empty until authorised records are
 * supplied. The fictional profiles below are never included in normal results.
 * They are available only when LAWYER_DIRECTORY_DEMO is explicitly enabled.
 *
 * No profile contains contact details, booking links or availability unless
 * that information is actually supplied and authorised. Demo profiles are
 * deliberately not contactable.
 */
import { categories } from "./knowledge.js";

const REAL_LAWYERS = [];

const DEMO_LAWYERS = [
  {
    id: "demo-01",
    name: "Ananya S. (demo)",
    practiceAreas: ["consumer", "financial"],
    city: "Delhi",
    experienceYears: 8,
    consultationFee: 1200,
    feeUnit: "per session",
    currency: "INR",
    consultationModes: ["online", "in-person"],
    languages: ["English", "Hindi"],
  },
  {
    id: "demo-02",
    name: "Kavya M. (demo)",
    practiceAreas: ["domestic-violence", "dowry"],
    city: "Mumbai",
    experienceYears: 12,
    consultationFee: 900,
    feeUnit: "per session",
    currency: "INR",
    consultationModes: ["online", "in-person"],
    languages: ["English", "Hindi", "Marathi"],
  },
  {
    id: "demo-03",
    name: "Rohan K. (demo)",
    practiceAreas: ["cyber", "civil-other"],
    city: "Bengaluru",
    experienceYears: 6,
    consultationFee: 2000,
    feeUnit: "per hour",
    currency: "INR",
    consultationModes: ["online"],
    languages: ["English", "Kannada", "Hindi"],
  },
  {
    id: "demo-04",
    name: "Vivek P. (demo)",
    practiceAreas: ["property", "civil-other"],
    city: "Pune",
    experienceYears: 15,
    consultationFee: 1500,
    feeUnit: "per session",
    currency: "INR",
    consultationModes: ["in-person"],
    languages: ["English", "Marathi", "Hindi"],
  },
  {
    id: "demo-05",
    name: "Ila D. (demo)",
    practiceAreas: ["workplace-harassment", "harassment"],
    city: "Mumbai",
    experienceYears: 10,
    consultationFee: 2500,
    feeUnit: "per session",
    currency: "INR",
    consultationModes: ["online"],
    languages: ["English", "Hindi", "Marathi"],
  },
  {
    id: "demo-06",
    name: "Nandini R. (demo)",
    practiceAreas: ["child-safety", "domestic-violence"],
    city: "Delhi",
    experienceYears: 7,
    consultationFee: 1000,
    feeUnit: "per session",
    currency: "INR",
    consultationModes: ["online", "in-person"],
    languages: ["English", "Hindi"],
  },
  {
    id: "demo-07",
    name: "Lakshmi V. (demo)",
    practiceAreas: ["harassment", "sexual-violence"],
    city: "Chennai",
    experienceYears: 14,
    consultationFee: 800,
    feeUnit: "per session",
    currency: "INR",
    consultationModes: ["in-person"],
    languages: ["English", "Tamil"],
  },
  {
    id: "demo-08",
    name: "Arjun N. (demo)",
    practiceAreas: ["financial", "consumer"],
    city: "Hyderabad",
    experienceYears: 9,
    consultationFee: 1500,
    feeUnit: "per hour",
    currency: "INR",
    consultationModes: ["online"],
    languages: ["English", "Telugu", "Hindi"],
  },
  {
    id: "demo-09",
    name: "Farah A. (demo)",
    practiceAreas: ["property", "civil-other"],
    city: "Mumbai",
    experienceYears: 18,
    consultationFee: 3000,
    feeUnit: "per session",
    currency: "INR",
    consultationModes: ["online", "in-person"],
    languages: ["English", "Hindi", "Urdu"],
  },
  {
    id: "demo-10",
    name: "S. Banerjee (demo)",
    practiceAreas: ["liberty", "civil-other"],
    city: "Kolkata",
    experienceYears: 11,
    consultationFee: 1800,
    feeUnit: "per session",
    currency: "INR",
    consultationModes: ["online", "in-person"],
    languages: ["English", "Bengali", "Hindi"],
  },
  {
    id: "demo-11",
    name: "Neha T. (demo)",
    practiceAreas: ["consumer", "civil-other"],
    city: "Jaipur",
    experienceYears: 4,
    consultationFee: 700,
    feeUnit: "per session",
    currency: "INR",
    consultationModes: ["online"],
    languages: ["English", "Hindi"],
  },
  {
    id: "demo-12",
    name: "Devika J. (demo)",
    practiceAreas: ["cyber", "financial"],
    city: "Kochi",
    experienceYears: 5,
    consultationFee: 1100,
    feeUnit: "per hour",
    currency: "INR",
    consultationModes: ["online"],
    languages: ["English", "Malayalam", "Hindi"],
  },
  {
    id: "demo-13",
    name: "Ritu C. (demo)",
    practiceAreas: ["domestic-violence", "dowry"],
    city: "Lucknow",
    experienceYears: 13,
    consultationFee: 900,
    feeUnit: "per session",
    currency: "INR",
    consultationModes: ["in-person"],
    languages: ["English", "Hindi", "Urdu"],
  },
  {
    id: "demo-14",
    name: "Karan B. (demo)",
    practiceAreas: ["property", "consumer"],
    city: "Ahmedabad",
    experienceYears: 6,
    consultationFee: 1300,
    feeUnit: "per session",
    currency: "INR",
    consultationModes: ["online", "in-person"],
    languages: ["English", "Gujarati", "Hindi"],
  },
  {
    id: "demo-15",
    name: "Shalini G. (demo)",
    practiceAreas: ["workplace-harassment", "civil-other"],
    city: "Patna",
    experienceYears: 3,
    consultationFee: 600,
    feeUnit: "per session",
    currency: "INR",
    consultationModes: ["online"],
    languages: ["English", "Hindi"],
  },
];

const MODES = new Set(["online", "in-person"]);
const SORTS = new Set(["relevance", "fee-asc", "fee-desc", "experience"]);

function blankContactFields(record) {
  return {
    isDemo: true,
    barCouncil: null,
    enrolmentNumber: null,
    verificationStatus: "demo",
    profileSource: "JollyLLM demo directory (fictional)",
    contactDetails: null,
    bookingUrl: null,
    availabilityStatus: null,
    ...record,
  };
}

function withLabels(record) {
  const labels = new Map(categories().map((c) => [c.id, c.label]));
  return {
    ...record,
    practiceAreas: (record.practiceAreas || []).map((id) => ({
      id,
      label: labels.get(id) || id,
    })),
  };
}

function demoModeEnabled() {
  return ["1", "true", "yes", "on"].includes(
    String(process.env.LAWYER_DIRECTORY_DEMO || "").trim().toLowerCase(),
  );
}

function allRecords() {
  const demo = demoModeEnabled() ? DEMO_LAWYERS.map(blankContactFields) : [];
  return [...REAL_LAWYERS.map((r) => ({ ...r, isDemo: false })), ...demo].map(withLabels);
}

export const lawyerCounts = () => {
  const demoActive = demoModeEnabled();
  return {
    real: REAL_LAWYERS.length,
    demo: demoActive ? DEMO_LAWYERS.length : 0,
    demoAvailable: DEMO_LAWYERS.length,
    total: REAL_LAWYERS.length + (demoActive ? DEMO_LAWYERS.length : 0),
  };
};

const lower = (value) => String(value ?? "").toLowerCase().trim();

function parseQuery(query = {}) {
  const errors = [];
  const q = lower(query.q).slice(0, 120);
  const category = lower(query.category);
  const city = lower(query.city).slice(0, 80);
  const mode = lower(query.mode);
  const sort = lower(query.sort) || "relevance";

  let maxFee = null;
  if (query.maxFee !== undefined && query.maxFee !== "") {
    const n = Number(query.maxFee);
    if (!Number.isFinite(n) || n < 0) {
      errors.push({ field: "maxFee", detail: "maxFee must be a non-negative number." });
    } else {
      maxFee = Math.round(n);
    }
  }

  if (category && !categories().some((c) => c.id === category)) {
    errors.push({ field: "category", detail: `Unknown category: ${category}` });
  }
  if (mode && !MODES.has(mode)) {
    errors.push({ field: "mode", detail: "mode must be online or in-person." });
  }
  if (!SORTS.has(sort)) {
    errors.push({ field: "sort", detail: "sort must be relevance, fee-asc, fee-desc or experience." });
  }

  return { errors, filters: { q, category, city, mode, sort, maxFee } };
}

function matchesCity(record, city) {
  if (!city) return false;
  const value = lower(record.city);
  return value.includes(city) || city.includes(value);
}

function matchesQuery(record, q) {
  if (!q) return true;
  const haystack = [
    record.name,
    record.city,
    ...(record.practiceAreas || []).map((p) => p.label),
    ...(record.languages || []),
  ]
    .join(" ")
    .toLowerCase();
  return q.split(/\s+/).every((part) => haystack.includes(part));
}

function scoreRecord(record, filters) {
  const ids = (record.practiceAreas || []).map((p) => p.id);
  const reasons = [];
  let score = 0;

  if (filters.category && ids.includes(filters.category)) {
    score += 50;
    reasons.push("Matches your case type");
  }
  if (filters.city && matchesCity(record, filters.city)) {
    score += 25;
    reasons.push("In your city");
  }
  if (
    filters.maxFee !== null &&
    typeof record.consultationFee === "number" &&
    record.consultationFee <= filters.maxFee
  ) {
    score += 15;
    reasons.push("Within your consultation budget");
  }
  if (filters.mode && (record.consultationModes || []).includes(filters.mode)) {
    score += 10;
    reasons.push(filters.mode === "online" ? "Offers online consultation" : "Offers in-person consultation");
  }
  if (filters.q) {
    score += 30;
    reasons.push("Matches your search");
  }
  if (typeof record.experienceYears === "number") {
    score += Math.min(record.experienceYears, 30) / 10;
  }

  return { score, reasons };
}

function compareFee(a, b, direction) {
  const av = typeof a.consultationFee === "number" ? a.consultationFee : Number.POSITIVE_INFINITY;
  const bv = typeof b.consultationFee === "number" ? b.consultationFee : Number.POSITIVE_INFINITY;
  if (av === bv) return a.name.localeCompare(b.name);
  return (av - bv) * direction;
}

export function listLawyers(query = {}) {
  const { errors, filters } = parseQuery(query);
  if (errors.length) {
    return { ok: false, status: 400, error: "invalid_filter", errors };
  }

  const all = allRecords();
  let list = all.filter((record) => {
    if (!matchesQuery(record, filters.q)) return false;
    if (filters.category && !(record.practiceAreas || []).some((p) => p.id === filters.category)) {
      return false;
    }
    if (filters.city && !matchesCity(record, filters.city)) return false;
    if (
      filters.maxFee !== null &&
      (typeof record.consultationFee !== "number" || record.consultationFee > filters.maxFee)
    ) {
      return false;
    }
    if (filters.mode && !(record.consultationModes || []).includes(filters.mode)) return false;
    return true;
  });

  list = list.map((record) => {
    const { score, reasons } = scoreRecord(record, filters);
    return { ...record, matchScore: Math.round(score), matchReasons: reasons };
  });

  if (filters.sort === "fee-asc") list.sort((a, b) => compareFee(a, b, 1));
  else if (filters.sort === "fee-desc") list.sort((a, b) => compareFee(a, b, -1));
  else if (filters.sort === "experience") {
    list.sort(
      (a, b) =>
        (b.experienceYears ?? -1) - (a.experienceYears ?? -1) || compareFee(a, b, 1),
    );
  } else {
    list.sort((a, b) => b.matchScore - a.matchScore || compareFee(a, b, 1));
  }

  const cities = [...new Set(all.map((r) => r.city).filter(Boolean))].sort();
  const practiceAreas = [...new Set(all.flatMap((r) => r.practiceAreas))].sort((a, b) =>
    a.label.localeCompare(b.label),
  );
  const counts = lawyerCounts();
  const demoOnly = counts.real === 0 && counts.demo > 0;
  const source =
    counts.real > 0 && counts.demo > 0
      ? "mixed"
      : counts.demo > 0
        ? "demo"
        : counts.real > 0
          ? "real"
          : "none";

  return {
    ok: true,
    filters,
    total: list.length,
    lawyers: list,
    facets: { cities, practiceAreas },
    hasListings: all.length > 0,
    source,
    demoOnly,
    counts,
    notice: demoOnly
      ? "Demo data — not real lawyers. Every profile shown is fictional, cannot be contacted or booked, and is not verified."
      : source === "mixed"
        ? "Demo profiles are marked and cannot be contacted. Only authorised real listings show contact or booking actions."
        : source === "real"
          ? "Profiles show only the fields supplied by the authorised source. A listing is not proof that credentials have been verified."
          : "No authorised lawyer listings are configured. This directory is intentionally empty; fictional profiles are not shown as if they were real.",
  };
}

export function findLawyer(id) {
  const record = allRecords().find((r) => r.id === id);
  return record || null;
}
