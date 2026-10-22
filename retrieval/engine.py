"""
JollyLLM retrieval engine
==========================

A small, dependency-free lexical retrieval service over the curated legal corpus
in ``data/knowledge``.

What this actually is
---------------------
A sparse TF-IDF vector space with cosine similarity. It builds a term-frequency /
inverse-document-frequency vector for every provision record and every judgment
record in the corpus, then scores a case narrative against those vectors.

What this is NOT
----------------
It is not a neural model, not a language model and not an embedding service.
A term that does not appear in the corpus cannot be matched, because there is no
learned semantic generalisation behind the score. We say so rather than implying
otherwise.

Protocol
--------
Line-delimited JSON over stdin/stdout so the Node API can keep one warm process:

    -> {"op": "health"}
    <- {"ok": true, ...}

    -> {"op": "retrieve", "collection": "provisions", "query": "...", "topK": 6,
        "boostIds": ["BNS-74"], "filterCategory": "cyber"}
    <- {"ok": true, "results": [{...record, "score": 0.41, "matchedTerms": [...]}]}

    -> {"op": "explain", "text": "..."}
    <- {"ok": true, "tokens": [...], "categories": [...]}

Only the standard library is used, so the engine starts without an install step.
"""

from __future__ import annotations

import json
import math
import os
import re
import sys
import threading
import unicodedata
from collections import Counter
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
KNOWLEDGE_DIR = REPO_ROOT / "data" / "knowledge"

# ---------------------------------------------------------------------------
# Tokenisation
# ---------------------------------------------------------------------------

# Devanagari codepoints used by Hindi text in the corpus and in user narratives.
DEVANAGARI = re.compile(r"[ऀ-ॿ]")
LATIN = re.compile(r"[A-Za-z]")

_WORD_RE = re.compile(r"[A-Za-z]+|[ऀ-ॿ]+")

# Romanised Hindi words that show up constantly in Hinglish input and should
# still land on the same concepts as their Devanagari counterparts.
HINGLISH_MAP = {
    "poti": "पति", "pati": "पति", "saas": "सास", "bahu": "बाहू", "ghar": "घर",
    "marr": "marriage", "marrki": "marriage", "shaadi": "marriage", "shaadi": "marriage",
    "mara": "मारपीट", "peet": "मारपीट", "mara": "मारपीट", "maran": "मारपीट",
    "dhamki": "धमकी", "dhamki": "धमकी", "daman": "धमकी",
    "paisa": "पैसा", "rupaye": "पैसा", "paisa": "पैसा", "paisa": "पैसा",
    "dhan": "दहेज", "dhan": "दहेज", "dhan": "दहेज",
    "utpeedan": "उत्पीड़न", "chhed": "उत्पीड़न", "utp": "उत्पीड़न",
    "balatkaar": "बलात्कार", "balakaar": "बलात्कार", "sambhog": "सहमति",
    "dhokha": "धोखा", "dhokha": "धोखा", "thag": "ठगी", "thagi": "ठगी",
    "kripan": "क्रूरता", "kroorata": "क्रूरता",
    "chitthi": "चेक", "cheque": "चेक", "bank": "बैंक",
    "ghera": "अभीरोध", "qaid": "हिरासत", "banda": "बंद",
    "nirvas": "निवास", "nivas": "निवास", "makaan": "मकान", "zameen": "जमीन",
    "kripan": "क्रूरता", "sakhi": "सखी", "parivar": "परिवार",
    "vakeel": "वकील", "kanuni": "कानूनी", "madad": "सहायता",
    "aadat": "रिवाज", "riwaj": "रिवाज", "parampara": "परंपरा",
    "photo": "तस्वीर", "video": "वीडियो", "fraud": "धोखा",
    "police": "पुलिस", "thana": "थाना", " FIR": "एफआईआर",
    "kursi": "कुर्सी", "jail": "जेल",
}

STOPWORDS = {
    # English
    "the", "a", "an", "and", "or", "but", "if", "of", "to", "in", "on", "for",
    "with", "at", "by", "from", "as", "is", "was", "were", "are", "be", "been",
    "it", "its", "this", "that", "these", "those", "i", "my", "me", "we", "our",
    "you", "your", "he", "she", "his", "her", "they", "them", "their", "have",
    "has", "had", "do", "does", "did", "not", "no", "so", "then", "than", "there",
    "here", "what", "when", "where", "who", "whom", "which", "how", "why",
    "can", "could", "should", "would", "will", "may", "might", "must", "am",
    "about", "after", "before", "into", "over", "under", "again", "also", "any",
    "some", "such", "only", "own", "same", "too", "very", "just", "because",
    "please", "help", "tell", "give", "need", "want", "know", "made", "make",
    "take", "get", "got", "went", "said", "say", "does", "did", "does",
    # Hindi / Devanagari function-ish tokens
    "है", "हैं", "हो", "था", "थी", "को", "से", "का", "की", "के", "में", "पर",
    "और", "या", "लेकिन", "कि", "जो", "यह", "वह", "मैं", "मुझे", "मेरे", "हम",
    "आप", "गया", "गई", "किया", "किया", "कर", "होता", "गया", "करता", "कई",
    "बहुत", "कुछ", "भी", "ही", "नहीं", "तो", "फिर", "अब", "जब", "तब",
}

# Very short latin tokens carry no retrieval signal and inflate scores.
MIN_LATIN_LEN = 3


def normalise(text: str) -> str:
    """NFKC fold so that decomposed Devanagari and full-width text compare equal."""
    return unicodedata.normalize("NFKC", text or "").lower()


def tokenize(text: str) -> list[str]:
    """Split into comparable terms.

    Devanagari is analysed with a light n-gram window rather than a morphological
    analyser: unigrams, plus bigrams for adjacent Devanagari word runs. That is
    enough to distinguish e.g. "धोखाधड़ी" from "धमकी" without pulling in a
    stemming library that would need to be installed.
    """
    text = normalise(text)
    tokens: list[str] = []
    devanagari_runs: list[str] = []

    def flush_devanagari() -> None:
        if not devanagari_runs:
            return
        for run in devanagari_runs:
            words = run.split()
            for w in words:
                if w not in STOPWORDS:
                    tokens.append(w)
            for a, b in zip(words, words[1:]):
                if a not in STOPWORDS and b not in STOPWORDS:
                    tokens.append(a + " " + b)
        devanagari_runs.clear()

    for match in _WORD_RE.finditer(text):
        chunk = match.group(0)
        if DEVANAGARI.match(chunk):
            devanagari_runs.append(chunk)
            continue
        flush_devanagari()
        if not LATIN.match(chunk):
            continue
        if len(chunk) < MIN_LATIN_LEN:
            continue
        if chunk in STOPWORDS:
            continue
        tokens.append(chunk)
        mapped = HINGLISH_MAP.get(chunk)
        if mapped:
            if DEVANAGARI.match(mapped):
                devanagari_runs.append(mapped)
            else:
                tokens.append(mapped)
    flush_devanagari()
    return tokens


def display_terms(tokens: list[str]) -> list[str]:
    """Unigrams only, for showing the user what actually matched."""
    return [t for t in tokens if " " not in t]


# ---------------------------------------------------------------------------
# Sparse vector space
# ---------------------------------------------------------------------------


class TfidfIndex:
    def __init__(self, records: list[dict], id_field: str = "id"):
        self.id_field = id_field
        self.records = records
        self.doc_tokens: list[Counter] = []
        self.doc_tf: list[Counter] = []
        self.df: Counter = Counter()
        self.by_id: dict[str, dict] = {}

        for rec in records:
            text = self._record_text(rec)
            toks = tokenize(text)
            tf = Counter(toks)
            self.doc_tokens.append(toks)
            self.doc_tf.append(tf)
            for term in tf:
                self.df[term] += 1
            self.by_id[rec[id_field]] = rec

        self.n_docs = max(1, len(records))
        self.avg_len = sum(len(t) for t in self.doc_tokens) / self.n_docs or 1.0

    @staticmethod
    def _record_text(rec: dict) -> str:
        parts = [
            str(rec.get("title", "")),
            str(rec.get("heading", "")),
            str(rec.get("summary", "")),
            str(rec.get("whyItMatters", "")),
            str(rec.get("factsPattern", "")),
            str(rec.get("holding", "")),
            str(rec.get("relevance", "")),
            str(rec.get("narrativeCues", "")),
            str(rec.get("_augmented", "")),
            " ".join(rec.get("keywords", []) or []),
            " ".join(rec.get("signalTerms", []) or []),
            " ".join(rec.get("categories", []) or []),
        ]
        return " ".join(p for p in parts if p)

    def _idf(self, term: str) -> float:
        df = self.df.get(term, 0)
        if df == 0:
            return 0.0
        return math.log((self.n_docs + 1) / (df + 1)) + 1.0

    def vector(self, tokens: list[str]) -> dict[str, float]:
        """L2-normalised TF-IDF weights."""
        tf = Counter(tokens)
        vec = {}
        for term, count in tf.items():
            idf = self._idf(term)
            if idf <= 0:
                continue
            w = (1.0 + math.log(count)) * idf
            vec[term] = w
        norm = math.sqrt(sum(v * v for v in vec.values()))
        if norm == 0:
            return vec
        return {k: v / norm for k, v in vec.items()}

    def search(
        self,
        query: str,
        top_k: int = 6,
        boost_ids: list[str] | None = None,
        filter_category: str | None = None,
        filter_categories: list[str] | None = None,
        min_score: float = 0.02,
    ) -> list[dict]:
        q_tokens = tokenize(query)
        if not q_tokens:
            return []
        q_vec = self.vector(q_tokens)
        if not q_vec:
            return []
        q_set = set(q_tokens)
        boosts = {b for b in (boost_ids or []) if b in self.by_id}
        allow = set(filter_categories or [])

        out: list[dict] = []
        for idx, rec in enumerate(self.records):
            if allow:
                cats = rec.get("categories") or ([rec["category"]] if rec.get("category") else [])
                if not (set(cats) & allow):
                    continue
            elif filter_category:
                cats = rec.get("categories")
                if cats and filter_category not in cats:
                    continue
            d_vec = self.vector(self.doc_tokens[idx])
            if not d_vec:
                continue
            # Cosine similarity over sparse vectors.
            if len(q_vec) <= len(d_vec):
                score = sum(v * d_vec.get(k, 0.0) for k, v in q_vec.items())
            else:
                score = sum(v * d_vec.get(k, 0.0) for k, v in d_vec.items())
            rid = rec[self.id_field]
            if rid in boosts:
                # Category-level boosts come from the playbook, so they are a
                # prior the caller already justified; they tilt the order without
                # being able to surface a record that does not mention the facts.
                score *= 1.35
            if score < min_score:
                continue
            doc_set = set(self.doc_tokens[idx])
            matched = sorted(q_set & doc_set, key=lambda t: -q_vec.get(t, 0.0))
            item = {k: v for k, v in rec.items() if not k.startswith("_")}
            item["score"] = round(score, 4)
            item["matchedTerms"] = display_terms(matched)[:12]
            out.append(item)

        out.sort(key=lambda r: (-r["score"], r[self.id_field]))
        return out[:top_k]


# ---------------------------------------------------------------------------
# Dense vector space
# ---------------------------------------------------------------------------
#
# The sparse index above cannot match a word it has never seen. The dense index
# below encodes each record and the query into the same 384-dimensional space,
# so a narrative that never uses the word "cruelty" can still land on a section
# about cruelty. That is the difference the abstract claims as "dense vector
# search", and this is what makes it true.
#
# It needs sentence-transformers and torch, which are optional. If either is
# missing, or the model cannot be fetched, the engine degrades to the sparse
# index and says so through /health rather than pretending otherwise.

EMBED_MODEL = "paraphrase-multilingual-MiniLM-L12-v2"
CACHE_DIR = REPO_ROOT / "retrieval" / ".cache"
EMBED_CACHE = CACHE_DIR / "embeddings.npz"


def _load_backend():
    """Return (SentenceTransformer, numpy) or raise a short reason string."""
    try:
        import numpy as np
        from sentence_transformers import SentenceTransformer
    except Exception as exc:  # pragma: no cover - depends on the environment
        raise RuntimeError(f"dense backend unavailable: {exc!r}")
    return SentenceTransformer, np


class DenseIndex:
    """Cosine similarity over L2-normalised sentence embeddings."""

    def __init__(self, records: list[dict], id_field: str = "id", *, text_of=None):
        self.id_field = id_field
        self.records = records
        self.ids = [r[id_field] for r in records]
        self.by_id = {r[id_field]: r for r in records}
        text_of = text_of or TfidfIndex._record_text

        SentenceTransformer, np = _load_backend()
        self._np = np
        self._model = SentenceTransformer(EMBED_MODEL)

        cache = self._load_cache(text_of)
        if cache is None:
            vectors = self._model.encode(
                [text_of(r) for r in records],
                normalize_embeddings=True,
                convert_to_numpy=True,
                show_progress_bar=False,
            )
            self.matrix = np.asarray(vectors, dtype=np.float32)
            self._save_cache(text_of)
        else:
            self.matrix = cache

    # -- on-disk cache -------------------------------------------------------
    # Re-encoding 68 records costs a couple of seconds once the model is
    # resident, but the *first* load of the model costs minutes. Caching the
    # vectors means a restart pays the model cost once, not once per boot.

    def _fingerprint(self, text_of) -> str:
        import hashlib

        h = hashlib.sha256()
        h.update(EMBED_MODEL.encode("utf-8"))
        for r in self.records:
            h.update(text_of(r).encode("utf-8"))
            h.update(b"\x00")
        return h.hexdigest()

    def _load_cache(self, text_of):
        np = self._np
        if not EMBED_CACHE.exists():
            return None
        try:
            with np.load(EMBED_CACHE, allow_pickle=False) as z:
                if str(z["fingerprint"]) != self._fingerprint(text_of):
                    return None
                if list(z["ids"]) != self.ids:
                    return None
                return np.asarray(z["matrix"], dtype=np.float32)
        except Exception:
            return None

    def _save_cache(self, text_of) -> None:
        np = self._np
        try:
            CACHE_DIR.mkdir(parents=True, exist_ok=True)
            np.savez(
                EMBED_CACHE,
                fingerprint=np.array(self._fingerprint(text_of)),
                ids=np.array(self.ids),
                matrix=self.matrix,
            )
        except Exception:
            pass  # a cache miss next boot is not worth failing over

    # -- search --------------------------------------------------------------

    def search(
        self,
        query: str,
        top_k: int = 6,
        boost_ids: list[str] | None = None,
        filter_categories: list[str] | None = None,
        filter_category: str | None = None,
        min_score: float = 0.02,
    ) -> list[dict]:
        if not query or not query.strip():
            return []
        np = self._np
        qv = np.asarray(
            self._model.encode([query], normalize_embeddings=True,
                               convert_to_numpy=True, show_progress_bar=False)[0],
            dtype=np.float32,
        )

        allow = set(filter_categories or [])
        boosts = set(boost_ids or [])

        idx_pool = range(len(self.records))
        if allow:
            idx_pool = [
                i for i, r in enumerate(self.records)
                if set(r.get("categories") or ([r["category"]] if r.get("category") else [])) & allow
            ]
        elif filter_category:
            idx_pool = [
                i for i, r in enumerate(self.records)
                if not r.get("categories") or filter_category in r["categories"]
            ]

        out: list[dict] = []
        for i in idx_pool:
            score = float(np.dot(self.matrix[i], qv))
            if score < min_score:
                continue
            rid = self.ids[i]
            if rid in boosts:
                score *= 1.15
            rec = self.records[i]
            item = {k: v for k, v in rec.items() if not k.startswith("_")}
            item["score"] = round(score, 4)
            item["scoreDense"] = item["score"]
            out.append(item)

        out.sort(key=lambda r: (-r["score"], r[self.id_field]))
        return out[:top_k]


class DenseBundle:
    """Both dense indexes, built once, with the failure reason kept for /health."""

    def __init__(self):
        self.prov_index: DenseIndex | None = None
        self.judg_index: DenseIndex | None = None
        self.error: str | None = None
        try:
            c = corpus()
            self.prov_index = DenseIndex(c._prov_index_docs, text_of=c._prov_text_of)
            self.judg_index = DenseIndex(c.judgments, text_of=c._prov_text_of)
        except Exception as exc:
            self.error = str(exc)

    @property
    def ready(self) -> bool:
        return self.prov_index is not None and self.judg_index is not None


_DENSE: DenseBundle | None = None
_DENSE_LOCK = threading.Lock()


def dense() -> DenseBundle:
    """Build the dense indexes on first use and reuse them after that."""
    global _DENSE
    if _DENSE is None:
        with _DENSE_LOCK:
            if _DENSE is None:
                _DENSE = DenseBundle()
    return _DENSE


def warm_dense() -> None:
    """Load the model in the background so the first real request is not slow.

    The first load of the model takes minutes. Doing it here, off the request
    path, means the API reports itself warming rather than timing out.
    """

    def _run() -> None:
        b = dense()
        sys.stderr.write(
            "nyaya-retrieval: dense index %s\n"
            % ("ready" if b.ready else "unavailable - " + (b.error or "unknown"))
        )
        sys.stderr.flush()

    threading.Thread(target=_run, daemon=True, name="dense-warm").start()


def _minmax(values: list[float]) -> list[float]:
    if not values:
        return []
    lo, hi = min(values), max(values)
    if hi - lo < 1e-9:
        return [1.0 if v > 0 else 0.0 for v in values]
    return [(v - lo) / (hi - lo) for v in values]


def fuse(result_sets: list[tuple[list[dict], float]]) -> list[dict]:
    """Blend ranked result lists by min-max normalising each one first.

    Sparse cosine and dense cosine live on different scales, so they cannot be
    added directly. Normalising each list to 0..1 and taking a weighted mean
    keeps the output on the same 0..1 scale the rest of the API already bands on.
    """
    merged: dict[str, dict] = {}
    weights: dict[str, float] = {}
    for results, weight in result_sets:
        if weight <= 0:
            continue
        norms = _minmax([r["score"] for r in results])
        for rec, norm in zip(results, norms):
            rid = rec["id"]
            cur = merged.get(rid)
            if cur is None:
                merged[rid] = dict(rec)
                weights[rid] = norm * weight
            else:
                weights[rid] += norm * weight
                if "scoreDense" not in rec:
                    cur.setdefault("scoreSparse", cur.get("score"))
                if "matchedTerms" in rec:
                    cur["matchedTerms"] = rec["matchedTerms"]
    total_w = sum(w for _, w in result_sets) or 1.0
    out = []
    for rid, rec in merged.items():
        rec["score"] = round(weights[rid] / total_w, 4)
        out.append(rec)
    out.sort(key=lambda r: (-r["score"], r["id"]))
    return out


_TIER_BONUS = {"local": 0.02, "regional": 0.01, "national": 0.0}


def _order_by_tier(results: list[dict], home: str = "") -> list[dict]:
    """Prefer the user's own tier only when relevance is otherwise close.

    The bonus is deliberately smaller than the differences the API bands on,
    so it breaks near-ties without promoting an off-topic local document over a
    clearly better national one. Records without a tier (the hand-curated
    corpus) keep their existing order.
    """
    if not results or not any(r.get("tier") for r in results):
        return results
    home_fold = _fold(home) or "delhi"

    def bonus(record: dict) -> float:
        state = _fold(record.get("state"))
        if state and state == home_fold:
            return _TIER_BONUS["local"]
        return _TIER_BONUS.get(str(record.get("tier") or "").lower(), 0.0)

    out = sorted(results, key=lambda r: (
        -(float(r.get("score") or 0.0) + bonus(r)),
        str(r.get("id") or ""),
    ))
    for record in out:
        state = _fold(record.get("state"))
        record["tierRank"] = ("local" if state and state == home_fold
                              else str(record.get("tier") or ""))
    return out


def _tier_buckets(results: list[dict]) -> list[dict]:
    """The same results grouped local -> regional -> national.

    A bucket is a view, not a re-ranking: relevance order is kept inside each
    group so a weak local record cannot displace a strong national one.
    """
    groups: dict[str, list[str]] = {"local": [], "regional": [],
                                    "national": [], "unassigned": []}
    for record in results:
        name = str(record.get("tierRank") or record.get("tier") or "").lower()
        groups.setdefault(name if name in groups else "unassigned", []).append(
            str(record.get("id") or ""))
    labels = {"local": "Local", "regional": "Regional",
              "national": "National", "unassigned": "Unassigned"}
    return [{"name": name, "label": labels[name], "count": len(ids),
             "record_ids": ids}
            for name, ids in groups.items() if ids]


# ---------------------------------------------------------------------------
# Corpus loading
# ---------------------------------------------------------------------------


def _read_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def _read_optional(path: Path) -> dict:
    """A snapshot that is missing or malformed leaves the corpus unchanged."""
    try:
        return _read_json(path)
    except (OSError, ValueError):
        return {}


def _fold(value: object) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).strip()


def _first_party(record: dict) -> str:
    title = _fold(record.get("title"))
    if not title:
        return ""
    first = re.split(r"\s+v\s+", title)[0]
    if len(first.split()) < 2:
        return ""
    if first in {"state", "union of india", "state of india"}:
        return ""
    return first


def _provision_keys(record: dict) -> list[str]:
    return [f"{_fold(record.get('act'))}:{_fold(record.get('section'))}"]


def _judgment_keys(record: dict) -> list[str]:
    keys = [f"id:{_fold(record.get('id'))}",
            f"title:{_fold(record.get('title'))}",
            f"cite:{_fold(record.get('citation'))}"]
    party = _first_party(record)
    if party:
        keys.append(f"party:{party}")
    return keys


def _usable(keys: list[str]) -> list[str]:
    return [k for k in keys if k and not k.endswith(":") and k != "::"]


def _merge_records(base: list[dict], extra: object, keys_of) -> list[dict]:
    """Additive overlay: an existing record wins, the snapshot fills blanks.

    When the snapshot is absent this is the identity, so a deployment without
    the legal edition behaves exactly as it did before.
    """
    if not isinstance(extra, list) or not extra:
        return base
    out = [dict(record) for record in base]
    index: dict[str, int] = {}
    for at, record in enumerate(out):
        for key in _usable(keys_of(record)):
            index.setdefault(key, at)

    for record in extra:
        if not isinstance(record, dict):
            continue
        at = next((index[key] for key in _usable(keys_of(record))
                   if key in index), -1)
        if at >= 0:
            current = out[at]
            for field, value in record.items():
                if current.get(field) in (None, "") and value not in (None, ""):
                    current[field] = value
            if record.get("provenance"):
                current["provenance"] = record["provenance"]
        else:
            out.append(dict(record))
            at = len(out) - 1
        for key in _usable(keys_of(out[at])):
            index.setdefault(key, at)
    return out


class Corpus:
    def __init__(self) -> None:
        self.provisions_doc = _read_json(KNOWLEDGE_DIR / "provisions.json")
        self.judgments_doc = _read_json(KNOWLEDGE_DIR / "judgments.json")
        self.playbook_doc = _read_json(KNOWLEDGE_DIR / "caseplaybook.json")
        self.plans_doc = _read_json(KNOWLEDGE_DIR / "actionplans.json")
        self.samples_doc = _read_json(KNOWLEDGE_DIR / "samplecases.json")

        edition = _read_optional(KNOWLEDGE_DIR / "legal_edition.json")
        self.acts = {**(edition.get("acts") or {}),
                     **(self.provisions_doc.get("acts") or {})}
        self.provisions = _merge_records(
            self.provisions_doc.get("provisions", []),
            edition.get("provisions"), _provision_keys)
        self.judgments = _merge_records(
            self.judgments_doc.get("judgments", []),
            edition.get("judgments"), _judgment_keys)
        self.categories = self.playbook_doc.get("categories", [])

        # A provision record only names its own issue category ("domestic-violence"),
        # not the words a person would actually use. Borrow the category's label,
        # blurb and keyword list so the narrative and the statute share a vocabulary
        # without inventing new legal content.
        cat_vocab = {}
        for c in self.categories:
            cat_vocab[c["id"]] = " ".join(
                [c.get("label", ""), c.get("blurb", ""), c.get("forum", "")]
                + list(c.get("keywords", []) or [])
            )

        def augment(rec: dict) -> dict:
            extra = [cat_vocab.get(rec.get("category", ""), "")]
            act = self.acts.get(rec.get("act"), {})
            extra.append(str(act.get("shortTitle", "")))
            # Store on a copy used for indexing only; the record served to the API
            # is read straight out of the JSON.
            return {**rec, "_augmented": " ".join(e for e in extra if e)}

        self._prov_index_docs = [augment(r) for r in self.provisions]
        # The dense index must embed exactly the text the sparse index sees, so
        # both are handed the same extractor over the same augmented records
        # rather than each re-deriving the searchable text on their own.
        self._prov_text_of = TfidfIndex._record_text
        self.prov_index = TfidfIndex(self._prov_index_docs)
        self.judg_index = TfidfIndex(self.judgments)

    def category_by_id(self, cid: str) -> dict | None:
        for c in self.categories:
            if c["id"] == cid:
                return c
        return None


_CORPUS: Corpus | None = None


def corpus() -> Corpus:
    global _CORPUS
    if _CORPUS is None:
        _CORPUS = Corpus()
    return _CORPUS


# ---------------------------------------------------------------------------
# Category inference from a narrative
# ---------------------------------------------------------------------------

# Signals deliberately carry a weight. A single ambiguous word should not
# outrank an unambiguous statutory cue, so strong cues score higher.
STRONG_SIGNALS = {
    "cyber": ["cyber", "otp", "upi", "phishing", "hdfc", "net banking", "fraud call",
              "crypto", "वरगिरा", "साइबर", "otp", "upi"],
    "child-safety": ["my child", "my daughter", "my son", "minor", "बच्चा", "बच्ची",
                     "बालक", "बालिका", "under 18", "school teacher"],
    "workplace-harassment": ["office", "workplace", "my manager", "internal committee",
                             "my boss", "employer", "कार्यस्थल", "ऑफिस", "नौकरी"],
    "consumer": ["warranty", "refund", "defective product", "consumer forum",
                 "seller", "उपभोक्ता", "वारंटी", "वापसी"],
    "dowry": ["dowry", "dowry death", "दहेज", "दहेज उत्पीड़न", "mang", "dhan"],
    "liberty": ["detained", "detention", "kidnapped", "arrested and not", "habeas",
                "गिरफ्तार", "हिरासत", "बंदी"],
    "property": ["evicted", "possession", "landlord", "tenant", "boundary", "plot",
                 "कब्ज़ा", "कब्जा", "जमीन", "मकान मालिक"],
    "financial": ["cheque", "bounced", "dishonour", "emi", "guarantor", "loan",
                  "recover", "चेक", "ऋण", "गारंटर"],
    "sexual-violence": ["rape", "raped", "molested", "molest", "gang rape", "बलात्कार"],
    "harassment": ["stalking", "stalker", "following me", "modesty", "molestation",
                   "उत्पीड़न", "मॉडेस्टी", "छूना"],
    "domestic-violence": ["husband", "wife", "my spouse", "in-law", "in law", "matrimonial",
                          "beat me", "beating", "married", "घरेलू हिंसा", "पति", "सास", "बाहू"],
}

WEAK_SIGNALS = {
    "domestic-violence": ["home", "family", "house", "throw me out", "मेरा घर", "परिवार", "फेंक दो"],
    "harassment": ["messages", "calls", "disturbing", "तंग", "मैसेज", "कॉल"],
    "cyber": ["online", "phone", "internet", "ऑनलाइन", "इंटरनेट", "फोन"],
    "property": ["flat", "house", "premises", "मकान", "घर"],
    "financial": ["money", "पैसा", "पैसे", "रुपये"],
    "consumer": ["service", "company", "सेवा", "कंपनी"],
    "workplace-harassment": ["work", "job", "काम"],
}


def infer_categories(text: str, explicit: str | None = None) -> list[dict]:
    """Return category records with an explainable score for each."""
    norm = normalise(text)
    words = set(tokenize(text))
    scored: list[tuple[float, str, list[str]]] = []

    for cid, cues in STRONG_SIGNALS.items():
        hits = [c for c in cues if c in norm]
        if hits:
            scored.append((3.0 * len(hits), cid, hits))
    for cid, cues in WEAK_SIGNALS.items():
        hits = [c for c in cues if c in norm]
        if hits:
            scored.append((1.0 * len(hits), cid, hits))
    for w in words:
        if w in ("domestic", "violence", "abuse"):
            scored.append((1.5, "domestic-violence", [w]))

    if explicit:
        scored.append((100.0, explicit, ["selected by the user"]))

    merged: dict[str, dict] = {}
    for score, cid, hits in scored:
        row = merged.setdefault(cid, {"score": 0.0, "hits": []})
        row["score"] += score
        for h in hits:
            if h not in row["hits"]:
                row["hits"].append(h)

    ranked = sorted(merged.items(), key=lambda kv: -kv[1]["score"])
    out = []
    for cid, row in ranked[:3]:
        rec = corpus().category_by_id(cid)
        if not rec:
            continue
        out.append({
            "id": cid,
            "label": rec["label"],
            "score": round(row["score"], 2),
            "matchedSignals": row["hits"][:8],
            "reason": "Explicitly selected" if cid == explicit else
                      ("Matched %d signal term(s) in the narrative" % len(row["hits"])),
        })
    return out


# ---------------------------------------------------------------------------
# Operation handlers
# ---------------------------------------------------------------------------


def op_health() -> dict:
    c = corpus()
    d = _DENSE
    if d is None:
        dense_state, dense_ok, dense_detail = "loading", False, "embedding model not started yet"
    elif d.ready:
        dense_state, dense_ok, dense_detail = "ready", True, "ready"
    else:
        dense_state = "unavailable"
        dense_ok = False
        dense_detail = d.error or "dense index failed to build"
    return {
        "ok": True,
        "engine": "sparse-tfidf-cosine + dense-multilingual-embeddings",
        "isNeuralModel": True,
        "note": "Hybrid retrieval. A sparse TF-IDF vector space scores exact statutory "
                "wording, and a 384-dimensional multilingual sentence-embedding space scores "
                "meaning, so a narrative that never uses the word 'cruelty' can still match a "
                "section about cruelty. Both run against the same curated corpus.",
        "counts": {
            "provisions": len(c.provisions),
            "judgments": len(c.judgments),
            "categories": len(c.categories),
        },
        "vocabularySize": len(c.prov_index.df) + len(c.judg_index.df),
        "sparse": {"ok": True, "kind": "tf-idf-cosine", "dimensions": None},
        "dense": {
            "ok": dense_ok,
            "state": dense_state,
            "kind": "sentence-embeddings-cosine",
            "model": EMBED_MODEL,
            "dimensions": 384,
            "multilingual": True,
            "detail": dense_detail,
        },
    }


def op_retrieve(payload: dict) -> dict:
    c = corpus()
    collection = payload.get("collection", "provisions")
    query = payload.get("query", "")
    top_k = int(payload.get("topK", 6))
    boost = payload.get("boostIds") or []
    fcat = payload.get("filterCategory")
    fcats = payload.get("filterCategories")
    min_score = float(payload.get("minScore", 0.02))
    mode = (payload.get("mode") or "hybrid").lower()

    is_judgments = collection == "judgments"
    if is_judgments:
        index = c.judg_index
    else:
        index = c.prov_index

    sparse = index.search(query, top_k=top_k, boost_ids=boost, filter_category=fcat,
                          filter_categories=fcats, min_score=min_score)

    used = "sparse"
    dense_results: list[dict] = []
    bundle = _DENSE
    want_dense = mode in ("dense", "hybrid")
    if want_dense and (bundle is not None) and bundle.ready:
        dindex = bundle.judg_index if is_judgments else bundle.prov_index
        try:
            dense_results = dindex.search(query, top_k=top_k, boost_ids=boost,
                                          filter_category=fcat, filter_categories=fcats,
                                          min_score=min_score)
            used = mode if dense_results else "sparse"
        except Exception as exc:
            used = "sparse"
            dense_results = []
    elif want_dense and bundle is None:
        # Not warmed yet. Do not block the request on a minutes-long model load.
        warm_dense()
        used = "sparse"

    if mode == "sparse" or not dense_results:
        results = sparse
    elif mode == "dense":
        results = dense_results
    else:
        # Pull a wider net from each side so the fusion has something to blend.
        wide_sparse = index.search(query, top_k=max(top_k * 2, top_k), boost_ids=boost,
                                   filter_category=fcat, filter_categories=fcats,
                                   min_score=0.0)
        wide_dense = dindex.search(query, top_k=max(top_k * 2, top_k), boost_ids=boost,
                                   filter_category=fcat, filter_categories=fcats,
                                   min_score=0.0)
        results = fuse([(wide_sparse, 0.4), (wide_dense, 0.6)])[:top_k]

    results = _order_by_tier(results, payload.get("homeJurisdiction") or "")

    response = {
        "ok": True,
        "collection": collection,
        "results": results,
        "engine": "sparse-tfidf-cosine + dense-multilingual-embeddings",
        "mode": used,
        "denseRequested": mode in ("dense", "hybrid"),
        "denseAvailable": bool(bundle and bundle.ready),
    }
    if any(r.get("tier") for r in results):
        response["tierBuckets"] = _tier_buckets(results)
    return response


def op_categorise(payload: dict) -> dict:
    return {
        "ok": True,
        "categories": infer_categories(payload.get("text", ""), payload.get("explicit")),
    }


# ---------------------------------------------------------------------------
# Cross-statute graph
# ---------------------------------------------------------------------------
#
# The abstract asks for "an indexed graph of penal codes, civil remedies, and
# special laws". This builds that graph out of two relationships that are already
# recorded in the corpus, rather than inventing new ones:
#
#   same-issue-cross-statute  Two sections in the same issue category but under
#                            different statutes - a penal provision beside a civil
#                            or special one. This is the link that lets a person
#                            argue one argument across two enactments.
#   same-filing-step         Two sections the playbook cites together in one step
#                            of an action plan, so they are relied on in the same
#                            filing.
#   shared-legal-vocabulary  Two sections from different statutes built around the
#                            same distinctive legal vocabulary - the same conduct,
#                            the same words - which is what lets overlapping
#                            sections be joined into one argument.
#   curated                 A link written by hand in the knowledge base.
#
# Every edge carries the reason it exists, because an unexplained link in a legal
# tool is worse than no link at all.

MAX_EDGES_PER_NODE = 6
# Shared vocabulary has to be *distinctive*, not merely shared. Two provisions
# that both say "police" are not addressing the same question, so a term only
# counts once it is rare in the corpus, and a pair must clear an inverse-
# document-frequency weight rather than a raw count. That keeps links such as
# BNS-85 <-> DVA-12 (मारपीट / beaten / hit) and drops weak ones like a link on
# "पैसे" alone.
MIN_SHARED_DISTINCTIVE = 2
# The corpus is small, so inverse-document-frequency values sit in a narrow band
# and cannot separate "police" from "beaten" on their own. Rarity does the work:
# a term has to appear in at most three provisions before it can carry a link.
MAX_SHARED_TERM_DF = 3
MIN_SHARED_WEIGHT = 5.5


def _issue_categories(rec: dict) -> set[str]:
    cats = rec.get("categories")
    if isinstance(cats, list):
        return set(cats)
    cat = rec.get("category")
    return {cat} if cat else set()


def _distinctive_terms(rec: dict) -> set[str]:
    """The terms that actually characterise this record, not the ones everywhere."""
    parts = []
    parts += list(rec.get("keywords") or [])
    parts += list(rec.get("signalTerms") or [])
    parts += [str(rec.get("narrativeCues") or "")]
    parts += [str(rec.get("heading") or "")]
    toks = set()
    for p in parts:
        for t in tokenize(p):
            if " " in t:          # drop Devanagari bigrams, they inflate overlap
                continue
            toks.add(t)
    return toks


def op_graph(payload: dict) -> dict:
    c = corpus()
    focus = {str(x) for x in (payload.get("provisionIds") or [])}
    focus_category = payload.get("category")

    provs = c.provisions
    index = c.prov_index.by_id
    cats = {x["id"]: x for x in c.categories}

    # Work out which provisions are in play.
    if focus:
        seeds = [p for p in provs if p["id"] in focus]
    elif focus_category:
        seeds = [p for p in provs if focus_category in _issue_categories(p)]
    else:
        seeds = provs
    in_scope = {p["id"] for p in seeds}

    edges: dict[tuple[str, str, str], dict] = {}

    def add(a: str, b: str, kind: str, why: str) -> None:
        if a == b:
            return
        key = (a, b, kind) if a < b else (b, a, kind)
        if key[0] in index and key[1] in index:
            edges[key] = {"source": key[0], "target": key[1], "kind": kind, "why": why}

    # 1. Same issue, different statute.
    by_cat: dict[str, list[dict]] = {}
    for p in provs:
        for cid in _issue_categories(p):
            by_cat.setdefault(cid, []).append(p)

    for cid, group in by_cat.items():
        label = (cats.get(cid) or {}).get("label", cid)
        group = sorted(group, key=lambda r: r["id"])
        for i in range(len(group)):
            for j in range(i + 1, len(group)):
                a, b = group[i], group[j]
                if a.get("act") == b.get("act"):
                    continue
                add(a["id"], b["id"], "same-issue-cross-statute",
                    f"Both address {label}, but under different statutes, so the same fact pattern "
                    f"may engage a penal provision and a civil or special one at the same time.")

    # 2. Cited together in one step of an action plan.
    prov_ids = {p["id"] for p in provs}
    for cat_id, steps in (c.plans_doc.get("templates") or {}).items():
        label = (cats.get(cat_id) or {}).get("label", cat_id)
        for step in steps or []:
            refs = sorted({r for r in (step.get("authorityRefs") or []) if r in prov_ids})
            for i in range(len(refs)):
                for j in range(i + 1, len(refs)):
                    a, b = index[refs[i]], index[refs[j]]
                    if a.get("act") == b.get("act"):
                        continue
                    add(a["id"], b["id"], "same-filing-step",
                        f"Both are cited in the same step of the {label} action plan, so they are "
                        f"relied on together in one filing.")

    # 3. Distinctive vocabulary shared across different statutes.
    # Terms that appear in nearly every provision ("act", "section", "court") carry
    # no signal, so each shared term is weighted by how rare it is in the corpus and
    # a pair has to clear a weight threshold before a link is drawn.
    vocab = {p["id"]: _distinctive_terms(p) for p in provs}
    df: Counter = Counter()
    for terms in vocab.values():
        df.update(terms)

    n_prov = max(1, len(provs))
    idf = {t: math.log(n_prov / (c + 1)) for t, c in df.items()}

    scored: list[tuple[float, str, str, list[str]]] = []
    ordered = sorted(provs, key=lambda r: r["id"])
    for i in range(len(ordered)):
        for j in range(i + 1, len(ordered)):
            a, b = ordered[i], ordered[j]
            if a.get("act") == b.get("act"):
                continue
            shared = vocab[a["id"]] & vocab[b["id"]]
            if len(shared) < MIN_SHARED_DISTINCTIVE:
                continue
            rare = sorted((t for t in shared if df[t] <= MAX_SHARED_TERM_DF),
                          key=lambda t: idf[t], reverse=True)
            if len(rare) < MIN_SHARED_DISTINCTIVE:
                continue
            weight = sum(idf[t] for t in rare)
            if weight < MIN_SHARED_WEIGHT:
                continue
            scored.append((weight, a["id"], b["id"], rare[:4]))

    scored.sort(key=lambda x: (-x[0], x[1], x[2]))
    for weight, aid, bid, rare in scored[:400]:
        add(aid, bid, "shared-legal-vocabulary",
            f"Both provisions are built around the same distinctive terms ({', '.join(rare)}), "
            f"which is how the same conduct can be argued under two different enactments.")

    # 4. Explicitly curated links, if a record names any.
    for p in provs:
        for other in p.get("relatedProvisions") or []:
            add(p["id"], other, "curated",
                "Linked by hand in the knowledge base as addressing the same question.")

    # Keep only edges touching the scope, then thin each node to its strongest links.
    edges = {k: v for k, v in edges.items() if k[0] in in_scope or k[1] in in_scope}

    degree: dict[str, int] = {}
    for k in edges:
        degree[k[0]] = degree.get(k[0], 0) + 1
        degree[k[1]] = degree.get(k[1], 0) + 1

    per_node: dict[str, int] = {}
    kept: list[dict] = []
    # Curated and same-filing links are stated facts, so they win places over the
    # broader category-level and vocabulary ones.
    order = {"curated": 0, "same-filing-step": 1, "same-issue-cross-statute": 2,
             "shared-legal-vocabulary": 3}
    for key, edge in sorted(edges.items(), key=lambda kv: (order.get(kv[1]["kind"], 9), kv[0])):
        if per_node.get(key[0], 0) >= MAX_EDGES_PER_NODE and degree.get(key[0], 0) > MAX_EDGES_PER_NODE:
            continue
        if per_node.get(key[1], 0) >= MAX_EDGES_PER_NODE and degree.get(key[1], 0) > MAX_EDGES_PER_NODE:
            continue
        per_node[key[0]] = per_node.get(key[0], 0) + 1
        per_node[key[1]] = per_node.get(key[1], 0) + 1
        kept.append(edge)

    node_ids = sorted(in_scope | {e["source"] for e in kept} | {e["target"] for e in kept})
    acts = c.acts
    nodes = []
    for pid in node_ids:
        rec = index.get(pid)
        if not rec:
            continue
        act = acts.get(rec.get("act"), {})
        nodes.append({
            "id": pid,
            "act": rec.get("act"),
            "actShortTitle": act.get("shortTitle"),
            "actKind": act.get("kind"),
            "section": rec.get("section"),
            "heading": rec.get("heading"),
            "category": rec.get("category"),
            "categories": sorted(_issue_categories(rec)),
        })

    # How many distinct statutes the subgraph spans - the graph claim is that it
    # reaches beyond one enactment, so report it rather than assume it.
    statutes = sorted({n["act"] for n in nodes if n["act"]})
    act_of = {n["id"]: n.get("act") for n in nodes}
    return {
        "ok": True,
        "nodes": nodes,
        "edges": kept,
        "stats": {
            "nodes": len(nodes),
            "edges": len(kept),
            "statutes": statutes,
            "statuteCount": len(statutes),
            "crossStatuteEdges": sum(
                1 for e in kept if act_of.get(e["source"]) != act_of.get(e["target"])
            ),
        },
    }


def op_provision_record(payload: dict) -> dict:
    c = corpus()
    rec = c.prov_index.by_id.get(payload.get("id"))
    if not rec:
        return {"ok": False, "error": "provision_not_found", "id": payload.get("id")}
    act = c.acts.get(rec.get("act"), {})
    out = dict(rec)
    out["actShortTitle"] = act.get("shortTitle")
    out["actNumber"] = act.get("actNo")
    out["actKind"] = act.get("kind")
    out["repealedAct"] = act.get("repealed")
    out["inForceFrom"] = act.get("inForceFrom")
    out["sourceUrl"] = act.get("sourceUrl")
    out["sourceLabel"] = act.get("sourceLabel")
    return {"ok": True, "provision": out}


def op_workflow(payload: dict) -> dict:
    try:
        from workflow import run_workflow
        return run_workflow(payload)
    except Exception as exc:
        return {"ok": False, "error": "workflow_failed", "detail": str(exc)}


def op_advocate_chat(payload: dict) -> dict:
    try:
        from legal_agent import handle_advocate_turn
        return handle_advocate_turn(payload)
    except Exception as exc:
        return {"ok": False, "error": "advocate_chat_failed", "detail": str(exc)}


def handle(payload: dict) -> dict:
    op = payload.get("op")
    if op == "health":
        return op_health()
    if op == "retrieve":
        return op_retrieve(payload)
    if op == "categorise":
        return op_categorise(payload)
    if op == "graph":
        return op_graph(payload)
    if op == "provision_record":
        return op_provision_record(payload)
    if op == "workflow":
        return op_workflow(payload)
    if op == "advocate_chat":
        return op_advocate_chat(payload)
    return {"ok": False, "error": "unknown_op", "op": op}


def main() -> None:
    # Windows consoles default to a legacy code page, which cannot encode
    # Devanagari. The corpus contains Hindi keywords, so force UTF-8 on the
    # protocol pipes before the first read or write.
    for stream in (sys.stdin, sys.stdout):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass

    try:
        corpus()
    except Exception as exc:  # pragma: no cover - startup diagnostics
        sys.stderr.write("nyaya-retrieval: corpus failed to load: %r\n" % (exc,))
        sys.exit(1)

    sys.stderr.write("nyaya-retrieval: ready (pid %d)\n" % os.getpid())
    sys.stderr.flush()

    # Load the embedding model off the request path. The first load is slow;
    # blocking startup on it would make the API look dead to the Node client.
    warm_dense()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError as exc:
            sys.stdout.write(json.dumps({"ok": False, "error": "bad_json",
                                         "detail": str(exc)}) + "\n")
            sys.stdout.flush()
            continue
        try:
            response = handle(payload)
        except Exception as exc:  # pragma: no cover - defensive
            response = {"ok": False, "error": "handler_failed", "detail": repr(exc)}
        sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()