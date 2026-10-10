import { CATEGORIES } from "./taxonomy.js";

// Writes the proposal text from the computed plan. The numbers come from the engine; the model (when present)
// only writes prose around them, so nothing in the document contradicts the estimate.

export function planSummary(p) {
  const rec = p.pricing.options.find((o) => o.recommended);
  return [
    `Client: ${p.client}`,
    `Requirements (${p.requirements.length}): ${p.requirements.map((r) => `${r.id} ${r.text} [${CATEGORIES[r.category].label}, complexity ${r.complexity}]`).join("; ")}`,
    `Comparable past projects: ${p.matches.map((m) => `${m.title} (${m.year}, ${m.actualHours}h actual vs ${m.estimatedHours}h estimated, ${m.outcome})`).join("; ")}`,
    `Phases: ${p.schedule.phases.map((ph) => `${ph.name} ${ph.weeks}w (${ph.hoursP50}-${ph.hoursP90}h)`).join(", ")}; total ${p.schedule.totalWeeks} weeks`,
    `Options: ${p.pricing.options.map((o) => `${o.name} ${o.label} / ${o.weeks} weeks`).join("; ")}`,
    `Risks: ${p.risks.map((k) => `${k.title} (${k.severity}) → ask: ${k.question}`).join("; ")}`,
  ].join("\n");
}

const shorten = (s, n = 64) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s);

export function composeLocal(p) {
  const rec = p.pricing.options.find((o) => o.recommended);
  const top = p.requirements.slice(0, 3).map((r) => r.text.toLowerCase().replace(/^we(?:'|’)d like |^we want /, "")).join("; ");
  const lines = [];
  lines.push(`## Proposal for ${p.client}`, "");
  lines.push(`**Summary.** You asked for ${top}. Based on ${p.matches.length} comparable projects we have delivered, this takes ${p.schedule.totalWeeks} weeks and ${rec.label}. Every number below is traced to the past work it came from.`, "");
  lines.push("## What we will deliver");
  for (const ph of p.schedule.phases) {
    const items = ph.items.map((i) => shorten(i.label));
    lines.push(`**${ph.name}, weeks ${ph.startWeek + 1}–${ph.startWeek + ph.weeks}.** ${items.slice(0, 3).join("; ")}${items.length > 3 ? ` and ${items.length - 3} more` : ""}.`);
  }
  lines.push("", "## Why these numbers");
  for (const e of p.estimates) {
    const r = p.requirements.find((x) => x.id === e.reqId);
    const ev = e.evidence[0];
    lines.push(`- ${shorten(r.text)}: ${e.p50}–${e.p90}h from ${e.samples} comparable ${e.label.toLowerCase()} components${ev ? ` (${ev.component}, ${ev.year}: ${ev.actualHours}h actual)` : ""}; ${e.overrun}× overrun included.`);
  }
  lines.push("", "## Your options");
  for (const o of p.pricing.options) lines.push(`- **${o.name}** — ${o.label}, ${o.weeks} weeks. ${o.tagline}.`);
  lines.push("", "## Before we start, we need to know");
  for (const k of p.risks.filter((k) => k.severity !== "low").slice(0, 4)) lines.push(`- ${k.question}`);
  lines.push("", "## Next step", "A 30-minute call to answer the questions above. The statement of work follows within three working days, with the same numbers.");
  return lines.join("\n");
}

export const COMPOSE_SYSTEM = `You write short, concrete software proposals. You are given a computed plan: requirements, comparable past projects, phases with weeks, three priced options and risks with questions.
Rules: use ONLY the numbers given, never invent or round them. Write to the client as "you". Short sentences, no hype, no exclamation marks.
Structure in Markdown: "## Proposal for <client>", a 3-sentence summary, "## What we will deliver" (one line per phase with weeks), "## Why these numbers" (one bullet per requirement citing the past component and hours it came from), "## Your options" (three bullets), "## Before we start, we need to know" (the questions), "## Next step". Under 420 words.`;
