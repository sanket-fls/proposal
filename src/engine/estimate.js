import { CATEGORIES, COMPLEXITY_FACTOR } from "./taxonomy.js";

// Estimates hours for each requirement from the *actual* hours of comparable past components.
// Comparable = same category; components from the matched projects count three times as much.

function weightedQuantile(items, q) {
  const sorted = [...items].sort((a, b) => a.v - b.v);
  const total = sorted.reduce((s, x) => s + x.w, 0);
  let acc = 0;
  for (const it of sorted) { acc += it.w; if (acc / total >= q) return it.v; }
  return sorted[sorted.length - 1]?.v ?? 0;
}

export function estimate(requirements, history, matches) {
  const matched = new Set(matches.map((m) => m.id));
  const byCat = {};
  for (const p of history) for (const c of p.components) (byCat[c.category] ||= []).push({ ...c, projectId: p.id, projectTitle: p.title, year: p.year, w: matched.has(p.id) ? 3 : 1 });

  return requirements.map((r) => {
    const pool = byCat[r.category] || [];
    const def = CATEGORIES[r.category];
    // Normalise each past component to "hours at complexity 1", then scale to this requirement's complexity.
    const norm = pool.map((c) => ({ v: c.actualHours / COMPLEXITY_FACTOR[c.complexity], w: c.w }));
    const f = COMPLEXITY_FACTOR[r.complexity];
    const p50 = Math.round((norm.length ? weightedQuantile(norm, 0.5) : def.base) * f);
    const p90 = Math.round((norm.length ? weightedQuantile(norm, 0.9) : def.base * 1.5) * f);
    const overrun = pool.length ? pool.reduce((s, c) => s + c.actualHours / c.estimatedHours, 0) / pool.length : 1.2;
    const evidence = pool.filter((c) => c.w === 3).concat(pool.filter((c) => c.w === 1)).slice(0, 3)
      .map((c) => ({ projectId: c.projectId, projectTitle: c.projectTitle, year: c.year, component: c.name, complexity: c.complexity, estimatedHours: c.estimatedHours, actualHours: c.actualHours, fromMatch: c.w === 3 }));
    return { reqId: r.id, category: r.category, label: def.label, phase: def.phase, complexity: r.complexity, p50, p90, samples: pool.length, fromMatches: pool.filter((c) => c.w === 3).length, overrun: Number(overrun.toFixed(2)), evidence };
  });
}
