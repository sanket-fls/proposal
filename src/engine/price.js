import { RATES, TEAM } from "./taxonomy.js";

const roundUp = (n, step) => Math.ceil(n / step) * step;

// Three options from one set of estimates. Pilot = the highest-value slice; Recommended = full scope at P50-P90;
// Comprehensive = full scope at P90 plus three months of support.
export function price(estimates, sched, currency) {
  const rate = RATES[currency] || RATES.USD;
  const fmt = (n) => rate.symbol + n.toLocaleString(rate.locale);
  const cost = (h) => roundUp(h * rate.perHour, rate.round);
  const pm = 1 + TEAM.pmOverhead;

  const ranked = [...estimates].sort((a, b) => valueScore(b) - valueScore(a));
  const pilotSet = [];
  let pilotHours = 0;
  const target = sched.hoursP50 * 0.45;
  for (const e of ranked) { if (pilotHours >= target) break; pilotSet.push(e); pilotHours += e.p50 * pm; }
  pilotHours += 40 * pm; // discovery
  const full50 = sched.hoursP50, full90 = sched.hoursP90;
  const support = full50 * 0.15;

  const options = [
    { key: "pilot", name: "Pilot", tagline: "Prove it on the highest-value slice", weeks: Math.max(3, Math.ceil(pilotHours / sched.capacityPerWeek)), hours: Math.round(pilotHours), low: cost(pilotHours), high: cost(pilotHours * 1.25), includes: pilotSet.map((e) => e.reqId) },
    { key: "recommended", name: "Recommended", tagline: "Full scope, priced on evidence", weeks: sched.totalWeeks, hours: full50, low: cost(full50), high: cost(full90), includes: estimates.map((e) => e.reqId), recommended: true },
    { key: "comprehensive", name: "Comprehensive", tagline: "Full scope at P90 plus 3 months of support", weeks: sched.totalWeeksP90, hours: Math.round(full90 + support), low: cost(full90 + support), high: cost((full90 + support) * 1.1), includes: estimates.map((e) => e.reqId) },
  ].map((o) => ({ ...o, label: `${fmt(o.low)} – ${fmt(o.high)}`, lowLabel: fmt(o.low), highLabel: fmt(o.high) }));

  const spread = full50 ? Number((full90 / full50).toFixed(2)) : 1;
  return { currency, rate: { perHour: rate.perHour, symbol: rate.symbol, locale: rate.locale }, options, confidence: spread <= 1.35 ? "high" : spread <= 1.6 ? "medium" : "low", spread };
}

const VALUE = { "llm-assistant": 5, automation: 5, "knowledge-base": 4, integration: 3, channel: 3, dashboard: 2, "web-app": 2, "data-pipeline": 2, mobile: 2, compliance: 1, auth: 1, training: 1, discovery: 0 };
const valueScore = (e) => (VALUE[e.category] ?? 1) / Math.max(1, e.p50 / 40);
