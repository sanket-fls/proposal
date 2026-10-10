import { readFileSync } from "node:fs";
import { extractLocal, normaliseLlmExtraction } from "./extract.js";
import { retrieve } from "./retrieve.js";
import { estimate } from "./estimate.js";
import { schedule } from "./schedule.js";
import { price } from "./price.js";
import { scanRisks } from "./risk.js";
import { composeLocal, planSummary, COMPOSE_SYSTEM } from "./compose.js";
import * as llm from "./llm.js";
import { CATEGORIES } from "./taxonomy.js";

export const history = JSON.parse(readFileSync(process.env.NETLIFY === "true" ? `${process.cwd()}/data/history.json` : new URL("../../data/history.json", import.meta.url), "utf8"));

// Delays between emitted events so the UI can show the work. PACE=0 runs flat out (used by the ChatGPT tool).
const PACE = process.env.PACE === undefined ? 1 : Number(process.env.PACE);

// Runs the whole pipeline. `emit(event)` receives every event in order; the same events are also returned so a
// client can replay the run later (the ChatGPT widget does this). `pace` scales the inter-event delays; 0 = none.
export async function run(brief, emit = () => {}, { live = llm.enabled(), pace = PACE } = {}) {
  const sleep = (ms) => (pace > 0 && ms > 0 ? new Promise((r) => setTimeout(r, ms * pace)) : Promise.resolve());
  const t0 = Date.now();
  const events = [];
  const send = (e) => { const ev = { ...e, t: Date.now() - t0 }; events.push(ev); emit(ev); };
  const stage = async (name, fn) => {
    const s = Date.now();
    send({ type: "stage", stage: name, status: "start" });
    const out = await fn();
    send({ type: "stage", stage: name, status: "done", ms: Date.now() - s });
    return out;
  };
  const log = (text) => send({ type: "log", text });

  // 1. Extract
  const extraction = await stage("extract", async () => {
    let ex, source = "rules";
    if (live) {
      try { ex = normaliseLlmExtraction(brief, await llm.structured(llm.EXTRACT_SYSTEM, brief, "extraction", llm.EXTRACT_SCHEMA)); source = llm.MODEL(); }
      catch (err) { log(`model extraction failed (${err.message.slice(0, 60)}), using rules`); }
    }
    if (!ex) ex = extractLocal(brief);
    send({ type: "client", client: ex.client, currency: ex.constraints.currency, source });
    log(`${ex.requirements.length} requirements in ${brief.split(/\s+/).length} words · currency ${ex.constraints.currency}${ex.constraints.deadlineWeeks ? ` · deadline ~${Math.round(ex.constraints.deadlineWeeks)}w` : ""}`);
    for (const r of ex.requirements) { send({ type: "requirement", requirement: r }); await sleep(140); }
    return ex;
  });

  // 2. Retrieve
  const retrieval = await stage("retrieve", async () => {
    const res = await retrieve(brief, history, { embed: live ? llm.embed : null, requirements: extraction.requirements });
    send({ type: "retrieval", method: res.method, scanned: res.scanned });
    log(`scanned ${res.scanned} past projects (${res.method})`);
    for (const [i, m] of res.matches.entries()) { send({ type: "match", match: m, rank: i + 1 }); await sleep(110); }
    return res;
  });

  // 3. Estimate
  const estimates = await stage("estimate", async () => {
    const est = estimate(extraction.requirements, history, retrieval.matches);
    for (const e of est) {
      send({ type: "estimate", estimate: e });
      log(`${e.reqId} ← ${e.samples} ${e.label.toLowerCase()} components · overrun ${e.overrun}× · P50 ${e.p50}h`);
      await sleep(120);
    }
    return est;
  });

  // 4. Schedule
  const sched = await stage("schedule", async () => {
    const s = schedule(estimates, extraction.requirements);
    for (const ph of s.phases) { send({ type: "phase", phase: ph }); await sleep(120); }
    send({ type: "schedule", totals: { totalWeeks: s.totalWeeks, totalWeeksP90: s.totalWeeksP90, hoursP50: s.hoursP50, hoursP90: s.hoursP90, team: s.team } });
    log(`${s.totalWeeks} weeks at P50 (${s.totalWeeksP90} at P90) with ${s.team.size} people`);
    return s;
  });

  // 5. Price
  const pricing = await stage("price", async () => {
    const p = price(estimates, sched, extraction.constraints.currency);
    send({ type: "pricing", pricing: p });
    log(`three options · P90/P50 spread ${p.spread}× → ${p.confidence} confidence`);
    await sleep(250);
    return p;
  });

  // 6. Risk
  const risks = await stage("risk", async () => {
    const ks = scanRisks(brief, extraction, estimates, sched, pricing);
    for (const k of ks) { send({ type: "risk", risk: k }); await sleep(140); }
    return ks;
  });

  const plan = { client: extraction.client, brief, requirements: extraction.requirements, constraints: extraction.constraints, matches: retrieval.matches, retrieval: { method: retrieval.method, scanned: retrieval.scanned, industry: retrieval.industry }, estimates, schedule: sched, pricing, risks };

  // 7. Compose
  const text = await stage("compose", async () => {
    let out = "";
    if (live) {
      try { out = await llm.stream(COMPOSE_SYSTEM, planSummary(plan), (tok) => send({ type: "token", text: tok })); }
      catch (err) { log(`model writing failed (${err.message.slice(0, 60)}), using template`); out = ""; }
    }
    if (!out) {
      out = composeLocal(plan);
      const words = out.split(/(?<=\s)/);
      for (let i = 0; i < words.length; i += 3) { send({ type: "token", text: words.slice(i, i + 3).join("") }); await sleep(22); }
    }
    return out;
  });

  const stats = {
    ms: Date.now() - t0, requirements: extraction.requirements.length, projectsScanned: retrieval.scanned, matches: retrieval.matches.length,
    evidenceComponents: estimates.reduce((s, e) => s + e.samples, 0), risks: risks.length, words: text.split(/\s+/).length, live,
  };
  const proposal = { ...plan, text, stats, categories: Object.fromEntries(Object.entries(CATEGORIES).map(([k, v]) => [k, v.label])) };
  send({ type: "done", stats });
  return { proposal, events };
}
