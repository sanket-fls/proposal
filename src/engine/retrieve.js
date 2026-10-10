// Finds the past projects most similar to the brief. Uses embeddings when available,
// otherwise a TF-IDF cosine over project text. Either way the result is explainable:
// each match carries the terms (or score) that made it similar.

import { INDUSTRY_HINTS } from "./taxonomy.js";

const STOP = new Set("the a an and or of to in for on with our we us is are be it that this as by from at have has will would like need needs into across per day days".split(" "));
const tokens = (s) => s.toLowerCase().replace(/[^a-z0-9₹$ ]+/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));

export function projectText(p) {
  return [p.title, p.industry, p.summary, ...p.components.map((c) => `${c.name} ${c.category.replace("-", " ")}`)].join(" ");
}

function tfidfIndex(history) {
  const docs = history.map((p) => tokens(projectText(p)));
  const df = new Map();
  for (const d of docs) for (const w of new Set(d)) df.set(w, (df.get(w) || 0) + 1);
  const N = docs.length;
  const idf = (w) => Math.log(1 + N / (1 + (df.get(w) || 0)));
  const vec = (words) => {
    const tf = new Map();
    for (const w of words) tf.set(w, (tf.get(w) || 0) + 1);
    const v = new Map();
    for (const [w, c] of tf) v.set(w, (1 + Math.log(c)) * idf(w));
    return v;
  };
  const norm = (v) => Math.sqrt([...v.values()].reduce((s, x) => s + x * x, 0)) || 1;
  const vectors = docs.map(vec);
  return { vectors, vec, norm };
}

export async function retrieve(brief, history, { embed, requirements = [], k = 5 } = {}) {
  const briefTokens = tokens(brief + " " + requirements.map((r) => r.category.replace("-", " ") + " " + r.text).join(" "));
  const idx = tfidfIndex(history);
  const q = idx.vec(briefTokens);
  const qn = idx.norm(q);
  const lexical = history.map((p, i) => {
    const v = idx.vectors[i];
    let dot = 0;
    const shared = [];
    for (const [w, x] of q) if (v.has(w)) { dot += x * v.get(w); shared.push([w, x * v.get(w)]); }
    const score = dot / (qn * idx.norm(v));
    return { project: p, score, terms: shared.sort((a, b) => b[1] - a[1]).slice(0, 4).map((s) => s[0]) };
  });

  let scored = lexical;
  let method = "tf-idf";
  if (embed) {
    try {
      const [qv, ...pv] = await embed([brief, ...history.map(projectText)]);
      const cos = (a, b) => { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return d / (Math.sqrt(na) * Math.sqrt(nb)); };
      scored = lexical.map((l, i) => ({ ...l, score: 0.7 * cos(qv, pv[i]) + 0.3 * l.score }));
      method = "embeddings + tf-idf";
    } catch (err) {
      console.error("embedding failed, using tf-idf:", err.message);
    }
  }
  // Boost projects that cover the same kinds of work the brief asks for, and projects in the same industry.
  const wanted = new Set(requirements.map((r) => r.category));
  const t = brief.toLowerCase();
  const industry = Object.entries(INDUSTRY_HINTS).map(([name, hints]) => [name, hints.filter((h) => t.includes(h)).length]).sort((a, b) => b[1] - a[1])[0];
  const briefIndustry = industry && industry[1] > 0 ? industry[0] : null;
  for (const s of scored) {
    const covered = s.project.components.filter((c) => wanted.has(c.category)).length;
    s.coverage = wanted.size ? covered / wanted.size : 0;
    s.sameIndustry = briefIndustry === s.project.industry;
    s.score = 0.6 * s.score + 0.25 * s.coverage + (s.sameIndustry ? 0.15 : 0);
    if (s.sameIndustry) s.terms = [s.project.industry.toLowerCase(), ...s.terms].slice(0, 4);
  }
  const matches = scored.sort((a, b) => b.score - a.score).slice(0, k).map((s) => ({
    id: s.project.id, title: s.project.title, client: s.project.client, industry: s.project.industry, year: s.project.year,
    score: Number(s.score.toFixed(3)), coverage: Number(s.coverage.toFixed(2)), sameIndustry: s.sameIndustry, terms: s.terms,
    estimatedHours: s.project.estimatedHours, actualHours: s.project.actualHours, plannedWeeks: s.project.plannedWeeks, actualWeeks: s.project.actualWeeks, outcome: s.project.outcome,
  }));
  return { matches, method, scanned: history.length, industry: briefIndustry };
}
