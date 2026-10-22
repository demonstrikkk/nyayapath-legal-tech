import * as llm from "./src/llm.js";
import { runLegalResearch } from "./src/researchAgent.js";
import { casesRepo } from "./src/db.js";
const c = casesRepo.create({ userId: "dbg_user", title: "Cheque", category: "financial", jurisdiction: "Mumbai" });
const run = await runLegalResearch(c.id, "consequence of delay in filing a section 138 complaint");
console.log("targetSource:", run.targetSource);
console.log("synthesis head:", String(run.synthesis).slice(0, 120));
console.log("isEnabled:", llm.isEnabled(), "| configuredModel:", llm.configuredModel());
