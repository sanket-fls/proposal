const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const dateStr = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export function toMarkdown(p) {
  const rec = p.pricing.options.find((o) => o.recommended);
  const out = [p.text.trim(), "", "---", "", "## Appendix: evidence", "", `Generated ${dateStr(p.createdAt)} from ${p.retrieval.scanned} past projects. Hours are P50–P90 from actual effort on comparable components; historical overrun is already included.`, ""];
  out.push("### Comparable projects", "", "| Project | Year | Estimated | Actual | Outcome |", "|---|---|---|---|---|");
  for (const m of p.matches) out.push(`| ${m.title} | ${m.year} | ${m.estimatedHours}h | ${m.actualHours}h | ${m.outcome} |`);
  out.push("", "### Estimates", "", "| Requirement | Kind | P50 | P90 | Samples | Overrun |", "|---|---|---|---|---|---|");
  for (const e of p.estimates) out.push(`| ${p.requirements.find((r) => r.id === e.reqId)?.text ?? e.reqId} | ${e.label} | ${e.p50}h | ${e.p90}h | ${e.samples} | ${e.overrun}× |`);
  out.push("", "### Timeline", "");
  for (const ph of p.schedule.phases) out.push(`- ${ph.name}: weeks ${ph.startWeek + 1}–${ph.startWeek + ph.weeks} (${ph.hoursP50}–${ph.hoursP90}h)`);
  out.push("", "### Options", "");
  for (const o of p.pricing.options) out.push(`- ${o.name}${o.recommended ? " (recommended)" : ""}: ${o.label}, ${o.weeks} weeks, ~${o.hours}h`);
  out.push("", "### Risks", "");
  for (const k of p.risks) out.push(`- [${k.severity}] ${k.title}: ${k.detail} Ask: ${k.question}`);
  return out.join("\n");
}

function mdToHtml(md) {
  return md.split(/\n{2,}/).map((block) => {
    let b = block.trim(), out = "";
    if (!b) return "";
    if (b.startsWith("## ")) { const nl = b.indexOf("\n"); out = `<h2>${inline(nl < 0 ? b.slice(3) : b.slice(3, nl))}</h2>`; b = nl < 0 ? "" : b.slice(nl + 1).trim(); if (!b) return out; }
    if (/^(- |\d+\. )/.test(b)) return out + `<ul>${b.split("\n").map((l) => `<li>${inline(l.replace(/^(- |\d+\. )/, ""))}</li>`).join("")}</ul>`;
    return out + `<p>${b.split("\n").map(inline).join("<br>")}</p>`;
  }).join("");
}
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

export function toPrintableHtml(p) {
  const rec = p.pricing.options.find((o) => o.recommended);
  const gantt = p.schedule.phases.map((ph) => `<div class="g"><span>${esc(ph.name)}</span><div class="t"><i style="left:${(ph.startWeek / p.schedule.totalWeeks) * 100}%;width:${(ph.weeks / p.schedule.totalWeeks) * 100}%">${ph.weeks}w</i></div></div>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Proposal · ${esc(p.client)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
:root{--ink:#15171a;--mut:#5b6472;--line:#e4e7eb;--bg:#f3f4f6;--acc:#0f9d6a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:400 15px/1.55 Inter,system-ui,sans-serif}
.bar{position:sticky;top:0;display:flex;gap:8px;justify-content:flex-end;padding:12px 16px;background:#fff;border-bottom:1px solid var(--line)}
.btn{font:600 13px Inter;border-radius:8px;padding:9px 16px;border:1px solid var(--ink);background:#fff;color:var(--ink);text-decoration:none;cursor:pointer}.btn.p{background:var(--ink);color:#fff}
.page{max-width:800px;margin:24px auto;background:#fff;border-radius:12px;padding:56px 64px}
.eyebrow{font:600 11px/1 "JetBrains Mono",monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--mut)}
h1{font:700 32px/1.1 Inter;letter-spacing:-.02em;margin:10px 0 20px}h2{font:700 20px/1.2 Inter;margin:32px 0 10px;letter-spacing:-.01em}h3{font:600 15px Inter;margin:24px 0 8px}
.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:18px 0 8px}.kpi{border:1px solid var(--line);border-radius:10px;padding:12px 14px}.kpi b{display:block;font:600 20px/1.2 "JetBrains Mono",monospace;margin-top:4px}.kpi span{font-size:12px;color:var(--mut)}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--line)}th{font-weight:600;color:var(--mut);font-size:12px}td.n,th.n{text-align:right;font-family:"JetBrains Mono",monospace}
.g{display:flex;align-items:center;gap:10px;margin:6px 0;font-size:13px}.g span{width:140px;font-weight:600}.t{flex:1;position:relative;height:22px;background:var(--bg);border-radius:6px}.t i{position:absolute;top:0;bottom:0;background:var(--acc);color:#fff;border-radius:6px;font:600 11px/22px "JetBrains Mono";text-align:center;font-style:normal}
.opts{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.opt{border:1px solid var(--line);border-radius:10px;padding:14px}.opt.r{border-color:var(--acc);box-shadow:inset 0 0 0 1px var(--acc)}.opt b{display:block;font:600 16px "JetBrains Mono";margin:6px 0 2px}.opt small{color:var(--mut)}
.risk{border-left:3px solid var(--line);padding:4px 12px;margin:10px 0}.risk.high{border-color:#d9534f}.risk.medium{border-color:#e9a23b}.risk b{display:block}.risk q{display:block;color:var(--mut);font-style:italic;margin-top:4px}
ul{padding-left:20px}li{margin:4px 0}.foot{color:var(--mut);font-size:12px;margin-top:36px;border-top:1px solid var(--line);padding-top:12px}
@media print{body{background:#fff}.bar{display:none}.page{margin:0;padding:0;max-width:none;border-radius:0}@page{size:A4;margin:18mm}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
@media(max-width:640px){.page{padding:28px 20px}.kpis,.opts{grid-template-columns:1fr}}
</style></head><body>
<div class="bar"><a class="btn" href="/p/${p.id}.md?download=1">Download Markdown</a><button class="btn p" onclick="print()">Save as PDF</button></div>
<div class="page">
  <div class="eyebrow">Proposal · ${dateStr(p.createdAt)} · based on ${p.retrieval.scanned} past projects</div>
  <h1>${esc(p.client)}</h1>
  <div class="kpis">
    <div class="kpi"><span>Recommended</span><b>${esc(rec.label)}</b></div>
    <div class="kpi"><span>Timeline</span><b>${p.schedule.totalWeeks} weeks</b></div>
    <div class="kpi"><span>Effort</span><b>${p.schedule.hoursP50}–${p.schedule.hoursP90}h</b></div>
  </div>
  ${mdToHtml(p.text.replace(/^## Proposal for .*\n?/, ""))}
  <h2>Timeline</h2>${gantt}
  <h2>Options</h2>
  <div class="opts">${p.pricing.options.map((o) => `<div class="opt${o.recommended ? " r" : ""}"><div class="eyebrow">${esc(o.name)}</div><b>${esc(o.label)}</b><small>${o.weeks} weeks · ~${o.hours}h · ${esc(o.tagline)}</small></div>`).join("")}</div>
  <h2>Appendix: where the numbers come from</h2>
  <h3>Comparable projects</h3>
  <table><tr><th>Project</th><th>Year</th><th class="n">Estimated</th><th class="n">Actual</th><th>Outcome</th></tr>${p.matches.map((m) => `<tr><td>${esc(m.title)}</td><td>${m.year}</td><td class="n">${m.estimatedHours}h</td><td class="n">${m.actualHours}h</td><td>${esc(m.outcome)}</td></tr>`).join("")}</table>
  <h3>Estimates</h3>
  <table><tr><th>Requirement</th><th>Kind</th><th class="n">P50</th><th class="n">P90</th><th class="n">Samples</th><th class="n">Overrun</th></tr>${p.estimates.map((e) => `<tr><td>${esc(p.requirements.find((r) => r.id === e.reqId)?.text)}</td><td>${esc(e.label)}</td><td class="n">${e.p50}h</td><td class="n">${e.p90}h</td><td class="n">${e.samples}</td><td class="n">${e.overrun}×</td></tr>`).join("")}</table>
  <h3>Risks and questions</h3>
  ${p.risks.map((k) => `<div class="risk ${k.severity}"><b>${esc(k.title)}</b>${esc(k.detail)}<q>${esc(k.question)}</q></div>`).join("")}
  <p class="foot">Hours are P50–P90 of actual effort on comparable components in our delivery history, with historical overrun included. Prices are indicative until the statement of work.</p>
</div></body></html>`;
}
