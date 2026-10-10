// Scans the brief and the plan for the things that sink projects, and writes the question to ask the client.
export function scanRisks(brief, extraction, estimates, sched, pricing) {
  const t = brief.toLowerCase();
  const risks = [];
  const add = (severity, title, detail, question) => risks.push({ id: `K${risks.length + 1}`, severity, title, detail, question });

  const { constraints } = extraction;
  if (constraints.deadlineWeeks && constraints.deadlineWeeks < sched.totalWeeks) {
    add("high", "Deadline tighter than the evidence", `The brief asks for "${constraints.deadlineText}" (~${Math.round(constraints.deadlineWeeks)} weeks). Comparable work took ${sched.totalWeeks} weeks at P50 and ${sched.totalWeeksP90} at P90.`, `Is the ${Math.round(constraints.deadlineWeeks)}-week date fixed, or would a pilot live by then and full scope after be acceptable?`);
  } else if (constraints.deadlineWeeks) {
    add("low", "Deadline is achievable", `~${Math.round(constraints.deadlineWeeks)} weeks requested; plan needs ${sched.totalWeeks}.`, "Which outcome matters most on day one if priorities change?");
  }
  if (!constraints.budgetStated) {
    add(constraints.budgetMentioned ? "medium" : "high", constraints.budgetMentioned ? "Budget described, not stated" : "No budget in the brief", "Without a number, scope and option choice are guesses.", "Is there a range you've set aside for this, even approximately?");
  }

  const vague = [...t.matchAll(/\b(etc|and more|and so on|simple|just|easy|quick|eventually|ideally|nice to have|various|some kind of)\b/g)].map((m) => m[1]);
  if (vague.length) add("medium", "Vague scope words", `Found: ${[...new Set(vague)].map((v) => `"${v}"`).join(", ")}. These phrases hide the most expensive requirements.`, `When you say "${vague[0]}", what specifically must be in version one?`);

  const integ = estimates.filter((e) => e.category === "integration");
  if (integ.length) add("high", "Integration depends on client systems", `Integration work overran by ${Math.round((integ[0].overrun - 1) * 100)}% on average in past projects, usually waiting for access.`, "Who owns the system we need to connect to, and can we have API/sandbox access in week one?");

  if (/patient|hipaa|health|medical|diagnos/.test(t) || /pii|personal data|gdpr|dpdp/.test(t)) add("medium", "Sensitive personal data", "Health or personal data needs redaction, audit logs and a data-processing agreement before any model sees it.", "Which data classes may leave your environment, and who signs off on that?");

  if (/on its own|autonomous|without an agent|automatically/.test(t)) add("medium", "Autonomous replies to customers", "Fully automatic answers need a confidence threshold and human fallback, or one wrong answer ends the project.", "Which query types are safe to answer without a human, and who reviews the first 500?");

  const vols = constraints.volumes.filter((v) => v >= 500);
  if (vols.length) add("low", "Volume stated", `Volumes mentioned: ${vols.map((v) => v.toLocaleString()).join(", ")}. Useful for sizing; peak load unknown.`, "What does a peak day look like, and how seasonal is it?");

  if (pricing.confidence === "low") add("medium", "Wide estimate range", `P90 is ${pricing.spread}× P50. Few comparable projects for some requirements.`, "Could we run a 2-week discovery first to narrow the range?");

  const order = { high: 0, medium: 1, low: 2 };
  return risks.sort((a, b) => order[a.severity] - order[b.severity]);
}
