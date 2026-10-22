/**
 * Thin JSON-lines client for the Python retrieval engine.
 *
 * One warm child process is kept for the lifetime of the API so the corpus is
 * parsed once. If the child dies the client respawns on the next request, and
 * if Python is missing entirely the caller gets a structured error rather than a
 * crash - the analysis pipeline degrades to deterministic, corpus-only output.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const ENGINE = path.join(REPO_ROOT, "retrieval", "engine.py");

const PYTHON = process.env.JollyLLM_PYTHON || findPython();

function findPython() {
  const candidates = ["python", "python3", "py"];
  for (const c of candidates) {
    if (c === "py" && process.platform !== "win32") continue;
    // A cheap existence probe via spawnSync would add latency to startup, so we
    // just take the first candidate and let the respawn logic surface failure.
    return c;
  }
  return "python";
}

let child = null;
let buffer = "";
let pending = [];
let nextId = 1;
let lastError = null;
const waiters = [];

function spawnEngine() {
  if (!existsSync(ENGINE)) {
    lastError = "engine_missing";
    return null;
  }
  const proc = spawn(PYTHON, ["-u", ENGINE], {
    cwd: REPO_ROOT,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  proc.unref();

  proc.stdout.setEncoding("utf8");
  proc.stdout.on("data", (chunk) => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      const waiter = pending.shift();
      if (waiter) waiter.resolve(msg);
      else waiters.push(msg);
    }
  });

  proc.stderr.setEncoding("utf8");
  proc.stderr.on("data", (d) => {
    process.env.JollyLLM_VERBOSE && console.error("[retrieval]", d.trim());
  });

  proc.on("error", (err) => {
    lastError = String(err && err.message);
  });
  proc.on("exit", (code) => {
    if (child === proc) {
      child = null;
      lastError = lastError || `engine exited with code ${code}`;
    }
    // Fail anything still waiting so requests do not hang.
    while (pending.length) pending.shift().resolve({ ok: false, error: "engine_exited" });
  });

  child = proc;
  lastError = null;
  return proc;
}

function ensureChild() {
  if (child && child.exitCode === null) return child;
  return spawnEngine();
}

/** Send one request and await the next line of output. */
export function request(payload, { timeoutMs = 6000 } = {}) {
  const proc = ensureChild();
  if (!proc) {
    return Promise.resolve({ ok: false, error: lastError || "engine_unavailable" });
  }

  if (waiters.length) {
    // A late reply to a request we already timed out on.
    return Promise.resolve(waiters.shift());
  }

  return new Promise((resolve) => {
    const entry = { resolve };
    pending.push(entry);
    const id = nextId++;
    proc.stdin.write(JSON.stringify({ ...payload, _id: id }) + "\n", (err) => {
      if (err) {
        const i = pending.indexOf(entry);
        if (i >= 0) pending.splice(i, 1);
        resolve({ ok: false, error: "engine_write_failed", detail: String(err.message) });
      }
    });

    setTimeout(() => {
      const i = pending.indexOf(entry);
      if (i >= 0) {
        pending.splice(i, 1);
        resolve({ ok: false, error: "engine_timeout" });
      }
    }, timeoutMs).unref?.();
  });
}

export async function health() {
  const res = await request({ op: "health" }, { timeoutMs: 8000 });
  if (!res.ok) {
    return {
      ok: false,
      engine: "unavailable",
      python: PYTHON,
      detail: res.error,
    };
  }
  return res;
}

export async function categorise(text, explicit) {
  return request({ op: "categorise", text, explicit: explicit || null });
}

export async function retrieve({
  collection = "provisions",
  query = "",
  topK = 6,
  boostIds = [],
  filterCategory = null,
  filterCategories = null,
  minScore = 0.02,
  mode = "hybrid",
  homeJurisdiction = "",
}) {
  return request(
    {
      op: "retrieve",
      collection,
      query,
      topK,
      boostIds,
      filterCategory,
      filterCategories,
      minScore,
      mode,
      homeJurisdiction,
    },
    // The first dense call may still be waiting on the embedding model to load,
    // so give it longer than the sparse path before reporting a timeout.
    { timeoutMs: mode === "sparse" ? 6000 : 25000 },
  );
}

/** Cross-statute graph around a set of provisions, or the whole graph. */
export async function graph({ provisionIds = [], category = null } = {}) {
  return request({ op: "graph", provisionIds, category }, { timeoutMs: 12000 });
}

export async function provisionRecord(id) {
  return request({ op: "provision_record", id });
}

export async function runLangGraphWorkflow(payload) {
  return request({ op: "workflow", ...payload }, { timeoutMs: 15000 });
}

export async function chatAdvocate(payload, { timeoutMs = 30000 } = {}) {
  return request({ op: "advocate_chat", ...payload }, { timeoutMs });
}

export function shutdown() {
  if (child) {
    child.kill();
    child = null;
  }
}