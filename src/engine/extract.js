import { CATEGORIES, CURRENCY_HINTS } from "./taxonomy.js";

// Rules-based extraction. Every requirement keeps its character span in the brief so the UI can light it up.
// Approach: sentence → sub-clauses (split on commas / "and") → score each sub-clause against the taxonomy →
// consecutive sub-clauses of the same kind merge into one requirement, so each requirement is in the client's words.

const KEYWORD_RE = Object.fromEntries(Object.entries(CATEGORIES).map(([cat, def]) => [cat, def.keywords.map((k) => {
  const prefix = k.endsWith("*");
  const body = (prefix ? k.slice(0, -1) : k).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return { k, re: new RegExp(`(^|[^a-z0-9])${body}${prefix ? "" : "(?![a-z0-9])"}`, "i"), weight: k.includes(" ") ? 3 : body.length > 5 ? 2 : 1 };
})]));

const SKIP = /^(hi|hello|hey|dear|thanks|thank you|regards|best|cheers|sincerely)\b|^[—–-]\s*[A-Z]|^[A-Z][a-z]+ [A-Z][a-z]+,?\s*(head|ceo|cto|coo|cfo|director|manager|founder)/i;
const ASKED = /we(?:'|’)d like|we want|we need|we are looking|we're looking|please|propose|would like|looking for|should|must|require|can you|help us/i;

function sentences(brief) {
  const out = [];
  const re = /[^.!?\n]+[.!?]?/g;
  let m;
  while ((m = re.exec(brief))) {
    const text = m[0];
    const lead = text.match(/^\s*/)[0].length;
    const trimmed = text.trim();
    if (trimmed.length > 8) out.push({ text: trimmed, start: m.index + lead, end: m.index + lead + trimmed.length });
  }
  return out;
}

function subclauses(s) {
  const parts = [];
  const re = /,\s+and\s+|,\s+|\s+and\s+(?:eventually\s+)?|;\s+|\s+—\s+/g;
  let last = 0, m;
  while ((m = re.exec(s.text))) {
    parts.push({ start: last, end: m.index });
    last = m.index + m[0].length;
  }
  parts.push({ start: last, end: s.text.length });
  // Tiny fragments ("Bayut") attach to their neighbour.
  const merged = [];
  for (const p of parts) {
    const words = s.text.slice(p.start, p.end).trim().split(/\s+/).length;
    if (words < 3 && merged.length) merged[merged.length - 1].end = p.end; else merged.push(p);
  }
  return merged.map((p) => ({ text: s.text.slice(p.start, p.end), start: s.start + p.start, end: s.start + p.end }));
}

function score(text) {
  const scores = {};
  for (const [cat, list] of Object.entries(KEYWORD_RE)) {
    let s = 0;
    const hits = [];
    for (const { k, re, weight } of list) if (re.test(text)) { s += weight; hits.push(k.replace("*", "")); }
    if (s) scores[cat] = { s, hits };
  }
  return Object.entries(scores).sort((a, b) => b[1].s - a[1].s).map(([cat, v]) => ({ cat, ...v }));
}

function complexity(text) {
  const t = text.toLowerCase();
  let c = 1;
  if (/\b\d{1,3}(,\d{3})+\b|\b\d{4,}\b|\b(all|every|across)\b/.test(t)) c++;
  if (/on its own|autonomous|real[- ]time|integrat|multiple|multi-|without (the )?agents?/.test(t)) c++;
  return Math.min(3, c);
}

function constraints(brief) {
  const t = brief.toLowerCase();
  const deadline = t.match(/(?:within|in|inside)\s+(\d+)\s+(week|month)s?|(?:by|before)\s+(?:the\s+)?(end of\s+)?(q[1-4]|january|february|march|april|may|june|july|august|september|october|november|december|next (?:week|month|quarter))/);
  let deadlineWeeks = null;
  if (deadline?.[1]) deadlineWeeks = deadline[2].startsWith("month") ? Number(deadline[1]) * 4.3 : Number(deadline[1]);
  const budget = t.match(/(?:budget|spend|invest)[^.]*?(\$|₹|£|aed|inr|usd|gbp|sgd|s\$)\s?([\d,.]+)\s?(k|lakh|lakhs|crore|m)?/);
  let currency = "USD";
  for (const [code, hints] of CURRENCY_HINTS) if (hints.some((h) => t.includes(h))) { currency = code; break; }
  const volumes = (t.match(/\b\d{1,3}(?:,\d{3})+\b|\b\d{3,}\b/g) || []).map((s) => Number(s.replace(/,/g, ""))).filter((n) => n < 1e7 && n !== 2023 && n !== 2024 && n !== 2025 && n !== 2026);
  return { deadlineWeeks, deadlineText: deadline?.[0] ?? null, budgetMentioned: Boolean(budget) || /budget is (flexible|open|not fixed)/.test(t), budgetStated: Boolean(budget), budgetText: budget?.[0] ?? null, currency, volumes };
}

function clientName(brief) {
  const m = brief.match(/\b[Ww]e(?:'|’)?(?:re| are)\s+(?:from\s+|at\s+)?([A-Z][\w&'’.-]*(?:\s+[A-Z][\w&'’.-]*){0,3})/)
    || brief.match(/\b(?:here at|I work at|on behalf of)\s+([A-Z][\w&'’.-]*(?:\s+[A-Z][\w&'’.-]*){0,3})/);
  return m ? m[1].replace(/[,.]$/, "").trim() : "the client";
}

export function extractLocal(brief) {
  const requirements = [];
  const context = [];
  let n = 0;
  for (const s of sentences(brief)) {
    if (SKIP.test(s.text)) { context.push({ ...s, why: "greeting/signature" }); continue; }
    const asked = ASKED.test(s.text);
    let current = null, prefix = null;
    for (const sc of subclauses(s)) {
      const ranked = score(sc.text);
      if (!ranked.length) {
        if (current) current.end = sc.end; else prefix = prefix || sc;
        continue;
      }
      const top = ranked[0];
      if (current && current.cat === top.cat) { current.end = sc.end; current.hits.push(...top.hits); current.score += top.s; continue; }
      const start = prefix ? prefix.start : sc.start;
      current = { cat: top.cat, start, end: sc.end, hits: [...top.hits], score: top.s, secondary: ranked.slice(1, 3).map((r) => r.cat) };
      prefix = null;
      requirements.push(current);
    }
    if (!requirements.some((r) => r.start >= s.start && r.start < s.end)) context.push({ ...s, why: "no work implied" });
    for (const r of requirements.filter((r) => !r.id && r.start >= s.start)) {
      const text = brief.slice(r.start, r.end).replace(/^[\s,;—-]+|[\s.,;]+$/g, "");
      Object.assign(r, { id: `R${++n}`, text, span: [r.start, r.end], category: r.cat, complexity: complexity(text), confidence: Math.min(0.96, 0.55 + r.score * 0.09), kind: asked ? "asked" : "inferred", evidence: [...new Set(r.hits)] });
      delete r.cat; delete r.start; delete r.end; delete r.hits; delete r.score;
    }
  }
  return { requirements, context: context.map((c) => ({ text: c.text, span: [c.start, c.end], why: c.why })), constraints: constraints(brief), client: clientName(brief) };
}

// Normalises an LLM extraction into the same shape, re-locating spans in the brief text.
export function normaliseLlmExtraction(brief, data) {
  const lower = brief.toLowerCase();
  const requirements = (data.requirements || []).map((r, i) => {
    const quote = (r.quote || "").toLowerCase().slice(0, 80);
    const idx = quote ? lower.indexOf(quote) : -1;
    const category = CATEGORIES[r.category] ? r.category : "llm-assistant";
    return { id: `R${i + 1}`, text: r.text, span: idx >= 0 ? [idx, idx + quote.length] : [0, 0], category, complexity: Math.min(3, Math.max(1, r.complexity || 1)), confidence: Math.min(0.98, Math.max(0.4, r.confidence ?? 0.8)), kind: "asked", evidence: [], secondary: [] };
  });
  const local = extractLocal(brief);
  return { requirements, context: local.context, constraints: { ...local.constraints, ...(data.constraints || {}) }, client: data.client || local.client };
}
