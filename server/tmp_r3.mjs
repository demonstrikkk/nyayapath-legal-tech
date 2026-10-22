import * as llm from "./src/llm.js";
const orig = llm.chatCompletionWithFallback;
const mod = await import("./src/llm.js");
console.log("isEnabled():", mod.isEnabled());
console.log("config():", JSON.stringify({ ...mod.config(), apiKey: undefined }));

// Patch the module namespace is not writable; instead call the agent and watch timing.
const { runLegalResearch } = await import("./src/researchAgent.js");
const { casesRepo } = await import("./src/db.js");
const c = casesRepo.create({ userId: "dbg2", title: "Cheque", category: "financial", jurisdiction: "Mumbai" });
const t0 = Date.now();
const run = await runLegalResearch(c.id, "consequence of delay in filing a section 138 complaint");
console.log("elapsed:", Date.now() - t0, "ms");
console.log("synthesis head:", String(run.synthesis).slice(0, 90));
