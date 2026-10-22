/**
 * JollyLLM Case State & Persistence Layer
 *
 * Utilizes Node 24 native `node:sqlite` (DatabaseSync) for robust, ACID-compliant,
 * zero-dependency relational persistence.
 * Supports:
 *  - Users & Case-level ownership / authorization
 *  - Cases & State versions
 *  - Conversations & Messages
 *  - Structured Case Facts with explicit provenance & verification status
 *  - Timeline Events
 *  - Evidence Documents & Passages
 *  - Legal Issues & Retrieved Authorities
 *  - Adversarial Opponent Simulations & Scenarios
 *  - Dynamic Legal Research Runs
 *  - Action Plans & Action Items
 *  - Workflow Checkpoints for LangGraph / Agent resumption
 *  - Audit Events for tracing every material modification
 */

import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "data");
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = process.env.JollyLLM_DB_PATH || path.join(DATA_DIR, "JollyLLM.db");

let dbInstance = null;

export function getDb(filePath = DB_PATH) {
  if (dbInstance) return dbInstance;

  const db = new DatabaseSync(filePath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  dbInstance = db;
  return dbInstance;
}

export function resetDbForTesting() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  dbInstance = db;
  return dbInstance;
}

function migrate(db) {
  db.exec(`
    -- 1. Users / API Keys / Ownership
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'litigant',
      metadata_json TEXT
    );

    -- 2. Cases
    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      category TEXT,
      jurisdiction TEXT,
      language TEXT NOT NULL DEFAULT 'en',
      case_stage TEXT NOT NULL DEFAULT 'intake',
      case_version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      metadata_json TEXT
    );

    -- 3. Conversations & Messages
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      sender TEXT NOT NULL, -- 'user' | 'assistant' | 'system'
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      step_tag TEXT,
      metadata_json TEXT
    );

    -- 4. Structured Facts with Provenance
    CREATE TABLE IF NOT EXISTS case_facts (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      statement TEXT NOT NULL,
      original_wording TEXT,
      source_type TEXT NOT NULL, -- 'user_statement' | 'document' | 'inference' | 'contradiction_resolution'
      source_ref TEXT, -- message_id or document_id
      event_date TEXT,
      verification_status TEXT NOT NULL DEFAULT 'unverified', -- 'allegation' | 'corroborated' | 'verified_external' | 'disputed'
      confidence REAL NOT NULL DEFAULT 0.5,
      is_active INTEGER NOT NULL DEFAULT 1, -- 0 when invalidated by fact correction
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      metadata_json TEXT
    );

    -- 5. Timeline Events
    CREATE TABLE IF NOT EXISTS timeline_events (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      event_date TEXT,
      raw_date TEXT,
      description TEXT NOT NULL,
      source_ref TEXT,
      is_ambiguous INTEGER NOT NULL DEFAULT 0,
      confidence REAL NOT NULL DEFAULT 1.0,
      created_at TEXT NOT NULL
    );

    -- 6. Evidence Documents & Passages
    CREATE TABLE IF NOT EXISTS evidence_documents (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      extracted_text TEXT,
      page_count INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      metadata_json TEXT
    );

    CREATE TABLE IF NOT EXISTS evidence_passages (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES evidence_documents(id) ON DELETE CASCADE,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      page_number INTEGER,
      content TEXT NOT NULL,
      cue_category TEXT,
      created_at TEXT NOT NULL
    );

    -- 7. Legal Issues & Retrieved Authorities
    CREATE TABLE IF NOT EXISTS legal_issues (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      issue_code TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      forum TEXT,
      severity TEXT NOT NULL DEFAULT 'standard', -- 'standard' | 'urgent' | 'emergency'
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS legal_authorities (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      authority_type TEXT NOT NULL, -- 'statute' | 'judgment' | 'notification'
      identifier TEXT NOT NULL,
      title TEXT NOT NULL,
      citation TEXT,
      relevance_type TEXT NOT NULL DEFAULT 'supporting', -- 'supporting' | 'contrary' | 'procedural' | 'exception'
      ratio TEXT,
      source_url TEXT,
      verification_status TEXT NOT NULL DEFAULT 'verified',
      score REAL,
      created_at TEXT NOT NULL
    );

    -- 8. Adversarial Opponent Simulations
    CREATE TABLE IF NOT EXISTS opponent_simulations (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      case_version INTEGER NOT NULL,
      opposing_theory TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed',
      report_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    -- 9. Dynamic Legal Research Runs
    CREATE TABLE IF NOT EXISTS research_runs (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      query TEXT NOT NULL,
      target_source TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed', -- 'completed' | 'failed' | 'cached'
      synthesis TEXT,
      findings_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    -- 10. Action Plans & Action Items
    CREATE TABLE IF NOT EXISTS action_plans (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      case_version INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'stale'
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS action_items (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL REFERENCES action_plans(id) ON DELETE CASCADE,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      step_order INTEGER NOT NULL,
      urgency TEXT NOT NULL DEFAULT 'normal', -- 'urgent' | 'normal' | 'optional'
      deadline TEXT,
      deadline_kind TEXT, -- 'from-source' | 'advisory'
      forum TEXT,
      forms_json TEXT,
      authority_refs_json TEXT,
      is_completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    -- 11. Workflow Checkpoints (LangGraph / State Resumption)
    CREATE TABLE IF NOT EXISTS workflow_checkpoints (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      node_name TEXT NOT NULL,
      state_version INTEGER NOT NULL,
      state_snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    -- 12. Audit Trail
    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL,
      event_type TEXT NOT NULL, -- 'case_created' | 'fact_added' | 'fact_corrected' | 'analysis_run' | 'opponent_sim_run'
      actor TEXT NOT NULL,
      details_json TEXT,
      created_at TEXT NOT NULL
    );

    -- Indexes for high-speed lookups
    CREATE INDEX IF NOT EXISTS idx_cases_user ON cases(user_id);
    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_facts_case ON case_facts(case_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_timeline_case ON timeline_events(case_id);
    CREATE INDEX IF NOT EXISTS idx_authorities_case ON legal_authorities(case_id);
    CREATE INDEX IF NOT EXISTS idx_plans_case ON action_plans(case_id, status);
    CREATE INDEX IF NOT EXISTS idx_audit_case ON audit_events(case_id);
  `);
}

// ---------------------------------------------------------------------------
// Repository helper methods for domain operations
// ---------------------------------------------------------------------------

function now() {
  return new Date().toISOString();
}

function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const usersRepo = {
  getOrCreate(userId, role = "litigant") {
    const db = getDb();
    const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
    if (existing) return existing;
    const createdAt = now();
    db.prepare("INSERT INTO users (id, created_at, updated_at, role) VALUES (?, ?, ?, ?)").run(
      userId,
      createdAt,
      createdAt,
      role,
    );
    return { id: userId, created_at: createdAt, updated_at: createdAt, role };
  },

  /**
   * Has this browser already been given the sample workspaces?
   *
   * Every browser now has its own account, so the samples are seeded once per
   * account rather than once per instance. Without the flag, deleting every
   * workspace would bring the samples back.
   */
  isSeeded(userId) {
    const db = getDb();
    const row = db.prepare("SELECT metadata_json FROM users WHERE id = ?").get(userId);
    if (!row?.metadata_json) return false;
    try {
      return Boolean(JSON.parse(row.metadata_json)?.demoSeeded);
    } catch {
      return false;
    }
  },

  markSeeded(userId) {
    const db = getDb();
    const row = db.prepare("SELECT metadata_json FROM users WHERE id = ?").get(userId);
    let metadata = {};
    try {
      metadata = row?.metadata_json ? JSON.parse(row.metadata_json) : {};
    } catch {
      metadata = {};
    }
    metadata.demoSeeded = true;
    db.prepare("UPDATE users SET metadata_json = ?, updated_at = ? WHERE id = ?").run(
      JSON.stringify(metadata),
      now(),
      userId,
    );
  },
};

export const casesRepo = {
  create({ userId, title, category = null, jurisdiction = null, language = "en", metadata = {} }) {
    const db = getDb();
    usersRepo.getOrCreate(userId);
    const caseId = uid("case");
    const createdAt = now();
    db.prepare(`
      INSERT INTO cases (id, user_id, title, category, jurisdiction, language, case_stage, case_version, created_at, updated_at, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, 'intake', 1, ?, ?, ?)
    `).run(
      caseId,
      userId,
      title,
      category,
      jurisdiction,
      language,
      createdAt,
      createdAt,
      JSON.stringify(metadata),
    );

    // Automatically create primary conversation
    const convId = uid("conv");
    db.prepare(`
      INSERT INTO conversations (id, case_id, created_at, updated_at, status)
      VALUES (?, ?, ?, ?, 'active')
    `).run(convId, caseId, createdAt, createdAt);

    auditRepo.log(caseId, "case_created", userId, { title, category, jurisdiction });

    return this.get(caseId, userId);
  },

  get(caseId, userId = null) {
    const db = getDb();
    let query = "SELECT * FROM cases WHERE id = ?";
    const params = [caseId];
    if (userId) {
      query += " AND user_id = ?";
      params.push(userId);
    }
    const c = db.prepare(query).get(...params);
    if (!c) return null;

    const conv = db.prepare("SELECT * FROM conversations WHERE case_id = ? ORDER BY created_at DESC LIMIT 1").get(caseId);
    return {
      ...c,
      conversationId: conv ? conv.id : null,
      metadata: c.metadata_json ? JSON.parse(c.metadata_json) : {},
    };
  },

  listByUser(userId) {
    const db = getDb();
    let rows = db.prepare("SELECT * FROM cases WHERE user_id = ? ORDER BY updated_at DESC").all(userId);
    if (rows.length === 0 && !usersRepo.isSeeded(userId)) {
      // A first-time browser gets the sample workspaces so the app is not
      // empty on arrival. Every browser gets its own copy, so one person's
      // samples are never another person's cases.
      this.seedDefaultWorkspaces(userId);
      usersRepo.markSeeded(userId);
      rows = db.prepare("SELECT * FROM cases WHERE user_id = ? ORDER BY updated_at DESC").all(userId);
    }
    return rows;
  },

  seedDefaultWorkspaces(userId) {
    const db = getDb();
    usersRepo.getOrCreate(userId);

    const SEED_CASES = [
      {
        title: "Sharma Matrimonial Residence & DV Matter (Delhi)",
        category: "domestic-violence",
        jurisdiction: "Delhi",
        facts: [
          "Complainant married Respondent on 12 November 2021 and lived in joint family property at Greater Kailash, New Delhi.",
          "Locked out of shared household on 20 June 2024 and denied access to stridhan and personal effects.",
          "Subjected to continuous demands for ₹10 lakhs dowry and physical violence on 15 June 2024.",
          "PCR call made and police complaint lodged at Greater Kailash Police Station on 28 August 2024.",
        ],
        timeline: [
          { iso: "2021-11-12", description: "Marriage solemnized" },
          { iso: "2024-06-15", description: "Physical altercation and hospital visit" },
          { iso: "2024-06-20", description: "Locked out and excluded from shared residence" },
          { iso: "2024-08-28", description: "Formal police complaint lodged" },
        ],
      },
      {
        title: "Verma Section 138 NI Act Cheque Dispute (Mumbai)",
        category: "cheque-bounce",
        jurisdiction: "Mumbai",
        facts: [
          "Holder of cheque No. 448201 for ₹3,50,000 drawn on HDFC Bank Fort Branch.",
          "Cheque presented on 5 January 2024 and returned with memo 'Funds Insufficient' on 12 January 2024.",
          "Statutory legal notice demanding payment dispatched on 22 January 2024.",
          "Notice delivered on 27 January 2024; drawer failed to make payment within 15 statutory days.",
        ],
        timeline: [
          { iso: "2024-01-05", description: "Cheque presented for bank clearance" },
          { iso: "2024-01-12", description: "Cheque return memo issued for funds insufficient" },
          { iso: "2024-01-22", description: "Statutory demand notice sent via registered post" },
          { iso: "2024-01-27", description: "Notice served on drawer" },
        ],
      },
      {
        title: "Bangalore Tenancy Deposit & Unlawful Eviction",
        category: "tenancy-eviction",
        jurisdiction: "Bengaluru",
        facts: [
          "11-month lease agreement executed for residential premises in Indiranagar on 1 April 2023.",
          "Security deposit of ₹1,20,000 paid via NEFT bank transfer.",
          "Landlord disconnected water and electricity supply on 15 March 2024 to force immediate vacation.",
          "Landlord refused to return security deposit citing arbitrary repair charges.",
        ],
        timeline: [
          { iso: "2023-04-01", description: "Lease commenced and security deposit paid" },
          { iso: "2024-03-15", description: "Landlord disconnected essential electricity and water utilities" },
        ],
      },
    ];

    for (const sc of SEED_CASES) {
      const c = this.create({
        userId,
        title: sc.title,
        category: sc.category,
        jurisdiction: sc.jurisdiction,
        language: "en",
        metadata: { isSampleWorkspace: true },
      });

      for (const f of sc.facts) {
        factsRepo.add({
          caseId: c.id,
          statement: f,
          sourceType: "user_statement",
          verificationStatus: "corroborated",
          confidence: 0.9,
        });
      }

      timelineRepo.sync(c.id, sc.timeline);
    }
  },

  update(caseId, fields = {}, userId = null) {
    const db = getDb();
    const existing = this.get(caseId, userId);
    if (!existing) return null;

    const updates = [];
    const params = [];
    for (const [k, v] of Object.entries(fields)) {
      if (k === "metadata") {
        updates.push("metadata_json = ?");
        params.push(JSON.stringify(v));
      } else if (["title", "category", "jurisdiction", "language", "case_stage"].includes(k)) {
        updates.push(`${k} = ?`);
        params.push(v);
      }
    }
    updates.push("case_version = case_version + 1");
    updates.push("updated_at = ?");
    params.push(now());
    params.push(caseId);

    db.prepare(`UPDATE cases SET ${updates.join(", ")} WHERE id = ?${userId ? " AND user_id = ?" : ""}`).run(
      ...params,
      ...(userId ? [userId] : []),
    );
    return this.get(caseId, userId);
  },

  incrementVersion(caseId) {
    const db = getDb();
    db.prepare("UPDATE cases SET case_version = case_version + 1, updated_at = ? WHERE id = ?").run(now(), caseId);
  },

  delete(caseId, userId = null) {
    const db = getDb();
    let query = "DELETE FROM cases WHERE id = ?";
    const params = [caseId];
    if (userId) {
      query += " AND user_id = ?";
      params.push(userId);
    }
    db.prepare("DELETE FROM audit_events WHERE case_id = ?").run(caseId);
    const res = db.prepare(query).run(...params);
    return res.changes > 0;
  },
};

export const messagesRepo = {
  add({ conversationId, caseId, sender, content, stepTag = null, metadata = {} }) {
    const db = getDb();
    const id = uid("msg");
    const createdAt = now();
    db.prepare(`
      INSERT INTO messages (id, conversation_id, case_id, sender, content, created_at, step_tag, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, conversationId, caseId, sender, content, createdAt, stepTag, JSON.stringify(metadata));

    db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").run(createdAt, conversationId);
    db.prepare("UPDATE cases SET updated_at = ? WHERE id = ?").run(createdAt, caseId);

    return { id, conversation_id: conversationId, case_id: caseId, sender, content, created_at: createdAt, step_tag: stepTag };
  },

  list(conversationId) {
    const db = getDb();
    return db.prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC").all(conversationId);
  },
};

export const factsRepo = {
  add({ caseId, statement, originalWording = null, sourceType = "user_statement", sourceRef = null, eventDate = null, verificationStatus = "allegation", confidence = 0.8, metadata = {} }) {
    const db = getDb();
    const id = uid("fact");
    const createdAt = now();
    db.prepare(`
      INSERT INTO case_facts (id, case_id, statement, original_wording, source_type, source_ref, event_date, verification_status, confidence, is_active, created_at, updated_at, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `).run(
      id,
      caseId,
      statement,
      originalWording || statement,
      sourceType,
      sourceRef,
      eventDate,
      verificationStatus,
      confidence,
      createdAt,
      createdAt,
      JSON.stringify(metadata),
    );

    auditRepo.log(caseId, "fact_added", "system", { factId: id, statement });
    return { id, case_id: caseId, statement, verification_status: verificationStatus, event_date: eventDate };
  },

  list(caseId, activeOnly = true) {
    const db = getDb();
    const query = activeOnly
      ? "SELECT * FROM case_facts WHERE case_id = ? AND is_active = 1 ORDER BY created_at ASC"
      : "SELECT * FROM case_facts WHERE case_id = ? ORDER BY created_at ASC";
    return db.prepare(query).all(caseId);
  },

  correctFact({ caseId, factId, correctedStatement, reason = "user_correction" }) {
    const db = getDb();
    const existing = db.prepare("SELECT * FROM case_facts WHERE id = ? AND case_id = ?").get(factId, caseId);
    if (!existing) return null;

    const createdAt = now();
    // 1. Deactivate old fact
    db.prepare("UPDATE case_facts SET is_active = 0, updated_at = ? WHERE id = ?").run(createdAt, factId);

    // 2. Add replacement fact with link to prior fact
    const newFactId = uid("fact");
    db.prepare(`
      INSERT INTO case_facts (id, case_id, statement, original_wording, source_type, source_ref, event_date, verification_status, confidence, is_active, created_at, updated_at, metadata_json)
      VALUES (?, ?, ?, ?, 'contradiction_resolution', ?, ?, ?, ?, 1, ?, ?, ?)
    `).run(
      newFactId,
      caseId,
      correctedStatement,
      existing.original_wording,
      factId,
      existing.event_date,
      "allegation",
      1.0,
      createdAt,
      createdAt,
      JSON.stringify({ supersededFactId: factId, reason }),
    );

    // 3. Mark downstream plans and simulations stale
    db.prepare("UPDATE action_plans SET status = 'stale', updated_at = ? WHERE case_id = ?").run(createdAt, caseId);
    casesRepo.incrementVersion(caseId);

    auditRepo.log(caseId, "fact_corrected", "user", { oldFactId: factId, newFactId, reason, correctedStatement });

    return { oldFactId: factId, newFactId, statement: correctedStatement };
  },
};

export const timelineRepo = {
  sync(caseId, events = []) {
    const db = getDb();
    db.prepare("DELETE FROM timeline_events WHERE case_id = ?").run(caseId);
    const insert = db.prepare(`
      INSERT INTO timeline_events (id, case_id, event_date, raw_date, description, source_ref, is_ambiguous, confidence, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const createdAt = now();
    for (const ev of events) {
      insert.run(
        uid("time"),
        caseId,
        ev.iso || ev.event_date || null,
        ev.text || ev.raw_date || "",
        ev.description || ev.text || "",
        ev.source_ref || null,
        ev.needsReview || ev.is_ambiguous ? 1 : 0,
        ev.confidence ?? 1.0,
        createdAt,
      );
    }
  },

  list(caseId) {
    const db = getDb();
    return db.prepare("SELECT * FROM timeline_events WHERE case_id = ? ORDER BY event_date ASC, created_at ASC").all(caseId);
  },
};

export const opponentRepo = {
  save(caseId, caseVersion, opposingTheory, report) {
    const db = getDb();
    const id = uid("opp");
    const createdAt = now();
    db.prepare(`
      INSERT INTO opponent_simulations (id, case_id, case_version, opposing_theory, status, report_json, created_at)
      VALUES (?, ?, ?, ?, 'completed', ?, ?)
    `).run(id, caseId, caseVersion, opposingTheory, JSON.stringify(report), createdAt);

    auditRepo.log(caseId, "opponent_sim_run", "system", { simulationId: id, caseVersion });
    return { id, caseId, caseVersion, report };
  },

  getLatest(caseId) {
    const db = getDb();
    const row = db.prepare("SELECT * FROM opponent_simulations WHERE case_id = ? ORDER BY created_at DESC LIMIT 1").get(caseId);
    if (!row) return null;
    return {
      ...row,
      report: JSON.parse(row.report_json),
    };
  },
};

export const researchRepo = {
  save(caseId, query, targetSource, synthesis, findings) {
    const db = getDb();
    const id = uid("res");
    const createdAt = now();
    db.prepare(`
      INSERT INTO research_runs (id, case_id, query, target_source, status, synthesis, findings_json, created_at)
      VALUES (?, ?, ?, ?, 'completed', ?, ?, ?)
    `).run(id, caseId, query, targetSource, synthesis, JSON.stringify(findings), createdAt);

    auditRepo.log(caseId, "research_run", "system", { researchId: id, query, targetSource });
    return { id, caseId, query, targetSource, synthesis, findings };
  },

  list(caseId) {
    const db = getDb();
    const rows = db.prepare("SELECT * FROM research_runs WHERE case_id = ? ORDER BY created_at DESC").all(caseId);
    return rows.map((r) => ({
      ...r,
      findings: JSON.parse(r.findings_json),
    }));
  },
};

export const actionPlanRepo = {
  save(caseId, caseVersion, items = []) {
    const db = getDb();
    const planId = uid("plan");
    const createdAt = now();

    // Mark previous active plans stale
    db.prepare("UPDATE action_plans SET status = 'stale', updated_at = ? WHERE case_id = ? AND status = 'active'").run(createdAt, caseId);

    db.prepare(`
      INSERT INTO action_plans (id, case_id, case_version, status, created_at, updated_at)
      VALUES (?, ?, ?, 'active', ?, ?)
    `).run(planId, caseId, caseVersion, createdAt, createdAt);

    const insertItem = db.prepare(`
      INSERT INTO action_items (id, plan_id, case_id, title, description, step_order, urgency, deadline, deadline_kind, forum, forms_json, authority_refs_json, is_completed, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `);

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      insertItem.run(
        uid("act"),
        planId,
        caseId,
        it.title,
        it.description || "",
        i + 1,
        it.urgency || "normal",
        it.deadline || null,
        it.deadlineKind || null,
        it.forum || null,
        JSON.stringify(it.forms || []),
        JSON.stringify(it.authorityRefs || []),
        createdAt,
      );
    }

    auditRepo.log(caseId, "action_plan_saved", "system", { planId, caseVersion, itemCount: items.length });
    return this.getActive(caseId);
  },

  getActive(caseId) {
    const db = getDb();
    const plan = db.prepare("SELECT * FROM action_plans WHERE case_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1").get(caseId);
    if (!plan) return null;

    const items = db.prepare("SELECT * FROM action_items WHERE plan_id = ? ORDER BY step_order ASC").all(plan.id);
    return {
      ...plan,
      items: items.map((it) => ({
        ...it,
        forms: JSON.parse(it.forms_json || "[]"),
        authorityRefs: JSON.parse(it.authority_refs_json || "[]"),
      })),
    };
  },

  toggleItem(caseId, itemId, isCompleted) {
    const db = getDb();
    // The case is part of the WHERE clause, not just of the caller's check.
    // A route that verified the case but then toggled by item id alone would
    // let a known item id be flipped in another case.
    db.prepare("UPDATE action_items SET is_completed = ? WHERE id = ? AND case_id = ?").run(
      isCompleted ? 1 : 0,
      itemId,
      caseId,
    );
  },
};

export const checkpointRepo = {
  save(caseId, nodeName, stateVersion, snapshot) {
    const db = getDb();
    const id = uid("chk");
    const createdAt = now();
    db.prepare(`
      INSERT INTO workflow_checkpoints (id, case_id, node_name, state_version, state_snapshot_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, caseId, nodeName, stateVersion, JSON.stringify(snapshot), createdAt);
    return id;
  },

  getLatest(caseId) {
    const db = getDb();
    const row = db.prepare("SELECT * FROM workflow_checkpoints WHERE case_id = ? ORDER BY created_at DESC LIMIT 1").get(caseId);
    if (!row) return null;
    return {
      ...row,
      snapshot: JSON.parse(row.state_snapshot_json),
    };
  },
};

export const auditRepo = {
  log(caseId, eventType, actor, details = {}) {
    const db = getDb();
    const id = uid("aud");
    const createdAt = now();
    db.prepare(`
      INSERT INTO audit_events (id, case_id, event_type, actor, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, caseId, eventType, actor, JSON.stringify(details), createdAt);
  },

  list(caseId) {
    const db = getDb();
    const rows = db.prepare("SELECT * FROM audit_events WHERE case_id = ? ORDER BY created_at ASC").all(caseId);
    return rows.map((r) => ({
      ...r,
      details: JSON.parse(r.details_json || "{}"),
    }));
  },
};

export const authoritiesRepo = {
  /**
   * Record the authorities a case relied on.
   *
   * One row per authority, keyed by type, identifier and source, so a second
   * run of the same research updates the existing row rather than stacking
   * duplicates. An authority with no identifier is not recorded: a citation
   * that names nothing is not evidence.
   */
  saveMany(caseId, authorities = []) {
    const db = getDb();
    const createdAt = now();
    const saved = [];

    for (const a of authorities) {
      const identifier = String(a?.identifier || "").trim();
      if (!identifier) continue;

      const existing = db
        .prepare(
          `SELECT id FROM legal_authorities
           WHERE case_id = ? AND authority_type = ? AND identifier = ? AND source_url IS ?`,
        )
        .get(caseId, a.authorityType, identifier, a.sourceUrl ?? null);

      if (existing) {
        db.prepare(
          `UPDATE legal_authorities
           SET title = ?, citation = ?, relevance_type = ?, ratio = ?,
               verification_status = ?, score = ?
           WHERE id = ?`,
        ).run(
          a.title || identifier,
          a.citation ?? null,
          a.relevanceType || "supporting",
          a.ratio ?? null,
          a.verificationStatus || "unverified",
          a.score ?? null,
          existing.id,
        );
        saved.push({ id: existing.id, identifier });
        continue;
      }

      const id = uid("auth");
      db.prepare(
        `INSERT INTO legal_authorities
           (id, case_id, authority_type, identifier, title, citation, relevance_type, ratio, source_url, verification_status, score, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        caseId,
        a.authorityType || "statute",
        identifier,
        a.title || identifier,
        a.citation ?? null,
        a.relevanceType || "supporting",
        a.ratio ?? null,
        a.sourceUrl ?? null,
        a.verificationStatus || "unverified",
        a.score ?? null,
        createdAt,
      );
      saved.push({ id, identifier });
    }

    if (saved.length) {
      auditRepo.log(caseId, "authorities_recorded", "system", { count: saved.length });
    }
    return saved;
  },

  list(caseId) {
    const db = getDb();
    return db
      .prepare("SELECT * FROM legal_authorities WHERE case_id = ? ORDER BY created_at ASC")
      .all(caseId);
  },
};

export const documentsRepo = {
  add({ caseId, filename, mimeType, sizeBytes, extractedText, pageCount = 1, metadata = {} }) {
    const db = getDb();
    const id = uid("doc");
    const createdAt = now();
    db.prepare(`
      INSERT INTO evidence_documents (id, case_id, filename, mime_type, size_bytes, extracted_text, page_count, created_at, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, caseId, filename, mimeType, sizeBytes, extractedText, pageCount, createdAt, JSON.stringify(metadata));

    auditRepo.log(caseId, "document_uploaded", "user", { docId: id, filename, sizeBytes });
    return { id, case_id: caseId, filename, mime_type: mimeType, size_bytes: sizeBytes, page_count: pageCount };
  },

  list(caseId) {
    const db = getDb();
    return db.prepare("SELECT id, case_id, filename, mime_type, size_bytes, page_count, created_at, metadata_json FROM evidence_documents WHERE case_id = ? ORDER BY created_at DESC").all(caseId);
  },

  get(docId, caseId = null) {
    const db = getDb();
    let query = "SELECT * FROM evidence_documents WHERE id = ?";
    const params = [docId];
    if (caseId) {
      query += " AND case_id = ?";
      params.push(caseId);
    }
    return db.prepare(query).get(...params);
  },

  remove(docId, caseId) {
    const db = getDb();
    const res = db.prepare("DELETE FROM evidence_documents WHERE id = ? AND case_id = ?").run(docId, caseId);
    if (res.changes > 0) {
      auditRepo.log(caseId, "document_deleted", "user", { docId });
    }
    return res.changes > 0;
  },
};
