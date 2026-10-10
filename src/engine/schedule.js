import { PHASES, TEAM } from "./taxonomy.js";

// Turns per-requirement hours into sequential phases with week counts.
export function schedule(estimates, requirements) {
  const byPhase = Object.fromEntries(PHASES.map((p) => [p, []]));
  for (const e of estimates) byPhase[e.phase].push(e);
  // Every project starts with discovery and ends with a handover, even when the brief doesn't ask.
  if (!byPhase.Discovery.length) byPhase.Discovery.push({ reqId: null, label: "Discovery & workflow mapping", p50: 40, p90: 56, implicit: true });
  if (!byPhase.Enablement.length) byPhase.Enablement.push({ reqId: null, label: "Handover & hypercare", p50: 24, p90: 32, implicit: true });

  const capacity = TEAM.size * TEAM.productiveHoursPerWeek;
  let week = 0;
  const phases = PHASES.filter((p) => byPhase[p].length).map((name) => {
    const items = byPhase[name];
    const p50 = Math.round(items.reduce((s, e) => s + e.p50, 0) * (1 + TEAM.pmOverhead));
    const p90 = Math.round(items.reduce((s, e) => s + e.p90, 0) * (1 + TEAM.pmOverhead));
    const weeks = Math.max(1, Math.ceil(p50 / capacity));
    const weeksP90 = Math.max(weeks, Math.ceil(p90 / capacity));
    const ph = { name, startWeek: week, weeks, weeksP90, hoursP50: p50, hoursP90: p90, items: items.map((e) => ({ reqId: e.reqId, label: e.reqId ? requirements.find((r) => r.id === e.reqId)?.text : e.label, p50: e.p50, p90: e.p90, implicit: Boolean(e.implicit) })) };
    week += weeks;
    return ph;
  });
  return { phases, totalWeeks: week, totalWeeksP90: phases.reduce((s, p) => s + p.weeksP90, 0), hoursP50: phases.reduce((s, p) => s + p.hoursP50, 0), hoursP90: phases.reduce((s, p) => s + p.hoursP90, 0), capacityPerWeek: capacity, team: TEAM };
}
