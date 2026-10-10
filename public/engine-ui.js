// Renders an engine run. Two sources feed the same handler: a live SSE stream (/api/run) or a recorded
// event list replayed with its original timing (the ChatGPT widget does this from toolOutput.events).
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const embedded = Boolean(window.openai);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const STAGES = [["extract", "extract"], ["retrieve", "retrieve"], ["estimate", "estimate"], ["schedule", "schedule"], ["price", "price"], ["risk", "risk"], ["compose", "compose"]];
  const CAT = { discovery: "Discovery", "knowledge-base": "Knowledge base", integration: "Integration", "data-pipeline": "Data pipeline", auth: "Access & roles", "llm-assistant": "AI assistant", channel: "Channel", "web-app": "Web interface", mobile: "Mobile", dashboard: "Dashboard", automation: "Automation", compliance: "Compliance", training: "Training" };

  const state = { brief: "", reqs: [], ests: [], maxP90: 0, phases: [], totalWeeks: 0, pricing: null, risks: [], text: "", t0: 0, clock: null, shareUrl: null, markdown: null, running: false, client: null, stats: null };

  // ---------- helpers ----------
  const fmtMoney = (n, rate) => rate.symbol + Math.round(n).toLocaleString(rate.locale);
  function countUp(el, to, format, dur = 1100) {
    if (reduced) { el.textContent = format(to); return; }
    const start = performance.now();
    const step = (t) => { const k = Math.min(1, (t - start) / dur), e = 1 - Math.pow(1 - k, 4); el.textContent = format(to * e); if (k < 1) requestAnimationFrame(step); else el.textContent = format(to); };
    requestAnimationFrame(step);
  }
  const big = (k, v) => { const el = $(`[data-big="${k}"]`); if (el) countUp(el, v, (x) => String(Math.round(x)), 700); };
  function fly(fromEl, toEl, label) {
    if (!fromEl || !toEl || reduced) return;
    const a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect();
    if (!a.width || !b.width) return;
    const chip = document.createElement("div");
    chip.className = "fly"; chip.textContent = label; chip.style.cssText = `left:${a.left}px;top:${a.top}px`;
    document.body.appendChild(chip);
    chip.animate([{ transform: "translate(0,0)", opacity: 1 }, { transform: `translate(${b.left - a.left}px,${b.top - a.top}px)`, opacity: 0 }], { duration: 700, easing: "cubic-bezier(.16,1,.3,1)" }).onfinish = () => chip.remove();
  }
  const md = (src) => src.split(/\n{2,}/).map((block) => {
    let b = block.trim(), out = ""; if (!b) return "";
    // A heading may share its block with the lines that follow it.
    if (b.startsWith("## ")) { const nl = b.indexOf("\n"); out = `<h3>${inline(nl < 0 ? b.slice(3) : b.slice(3, nl))}</h3>`; b = nl < 0 ? "" : b.slice(nl + 1).trim(); if (!b) return out; }
    if (/^(- |\d+\. )/.test(b)) return out + `<ul>${b.split("\n").map((l) => `<li>${inline(l.replace(/^(- |\d+\. )/, ""))}</li>`).join("")}</ul>`;
    return out + `<p>${b.split("\n").map(inline).join("<br>")}</p>`;
  }).join("");
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Each chapter scrolls into view as it opens so the audience follows the engine down the page (not inside ChatGPT's iframe).
  const show = (sel) => { const el = $(sel); if (el.hidden) { el.hidden = false; requestAnimationFrame(() => { el.classList.add("in"); if (!embedded) el.scrollIntoView({ block: "start", behavior: "smooth" }); }); } return el; };
  const row = (parent, cls, html, i) => { const el = document.createElement("div"); el.className = `row ${cls} in`; el.style.animationDelay = `${(i ?? parent.children.length) * 40}ms`; el.innerHTML = html; parent.appendChild(el); return el; };
  const note = (msg) => { $("#note").textContent = msg; };
  const tick = (text) => { $("#ticker").textContent = text; };

  // ---------- brief with highlighted spans ----------
  function renderBrief() {
    const spans = state.reqs.map((r) => ({ s: r.span[0], e: r.span[1], id: r.id })).filter((x) => x.e > x.s).sort((a, b) => a.s - b.s);
    const on = new Set([...document.querySelectorAll("#briefView mark.on")].map((m) => m.dataset.req));
    let html = "", pos = 0;
    for (const sp of spans) {
      if (sp.s < pos) continue;
      html += esc(state.brief.slice(pos, sp.s));
      html += `<mark data-req="${sp.id}" class="${on.has(sp.id) ? "on" : ""}">${esc(state.brief.slice(sp.s, sp.e))}</mark>`;
      pos = sp.e;
    }
    html += esc(state.brief.slice(pos));
    $("#briefView").innerHTML = html;
  }

  // ---------- chrome ----------
  function buildChrome() {
    $("#rail").innerHTML = STAGES.map(([k, label], i) => `<li data-stage="${k}"><span class="n">${i + 1}</span><span class="name">${label}</span><span class="ms"></span></li>`).join("");
    $("#progress").innerHTML = STAGES.map(([k]) => `<span class="seg" data-stage="${k}"></span>`).join("");
  }
  function reset() {
    Object.assign(state, { reqs: [], ests: [], maxP90: 0, phases: [], totalWeeks: 0, pricing: null, risks: [], text: "", shareUrl: null, markdown: null, client: null, stats: null });
    for (const id of ["reqs", "matches", "ests", "gantt", "options", "risks", "doc", "summary"]) $(`#${id}`).innerHTML = "";
    document.querySelectorAll("main .chapter:not(.hero)").forEach((s) => { s.hidden = true; s.classList.remove("in"); });
    $("#exports").hidden = true; $("#clientLine").textContent = ""; tick("");
    document.body.classList.remove("done", "running");
    buildChrome();
    $("#timer").firstChild.textContent = "0.0";
    $("#bigPrice").innerHTML = "<b>—</b>";
  }
  const startClock = () => { state.t0 = performance.now(); document.body.classList.add("running"); state.clock = setInterval(() => { $("#timer").firstChild.textContent = ((performance.now() - state.t0) / 1000).toFixed(1); }, 60); };

  // ---------- event handler ----------
  function handle(ev) {
    switch (ev.type) {
      case "stage": {
        const li = $(`#rail [data-stage="${ev.stage}"]`), seg = $(`#progress [data-stage="${ev.stage}"]`);
        if (ev.status === "start") { li.classList.add("active"); seg.classList.add("active"); }
        else { li.classList.remove("active"); li.classList.add("done"); $(".ms", li).textContent = `${ev.ms}ms`; seg.classList.remove("active"); seg.classList.add("done"); }
        break;
      }
      case "log": tick(ev.text); break;
      case "client": {
        state.client = ev.client;
        $("#clientLine").innerHTML = `<b>${esc(ev.client)}</b> · ${esc(ev.currency)} · ${esc(ev.source)}`;
        break;
      }
      case "requirement": {
        const r = ev.requirement;
        state.reqs.push(r);
        renderBrief();
        show("#sReqs");
        const el = row($("#reqs"), "req", `<span class="id mono">${r.id}</span><div><div class="text">${esc(r.text)}</div><div class="kw">${(r.evidence || []).slice(0, 4).map((h) => `<i>${esc(h)}</i>`).join("")}</div></div><div class="mono">${esc(CAT[r.category] || r.category)}<div class="kind ${r.kind}">${r.kind === "asked" ? "asked for" : "inferred"}</div></div><div class="cx mono">complexity <b>${r.complexity}</b>/3<br>${Math.round(r.confidence * 100)}% sure</div>`);
        const mark = $(`#briefView mark[data-req="${r.id}"]`);
        if (mark) { requestAnimationFrame(() => mark.classList.add("on")); fly(mark, el, r.id); }
        big("reqs", state.reqs.length);
        break;
      }
      case "retrieval": { show("#sMatches"); $("#matchMeta").textContent = ev.method; $("[data-big=scanned]").textContent = ev.scanned; break; }
      case "match": {
        const m = ev.match;
        row($("#matches"), "match", `<span class="id mono">#${ev.rank}</span><div><div class="title">${esc(m.title)}</div><div class="meta mono">${m.year} · ${esc(m.industry)}${m.sameIndustry ? " · same industry" : ""} · ${esc(m.outcome)}</div><div class="terms">${m.terms.map((t) => `<i>${esc(t)}</i>`).join("")}</div></div><div class="sim"><div class="track"><i style="width:${Math.min(100, (m.score / 0.6) * 100)}%"></i></div><span class="mono">${(m.score * 100).toFixed(0)}% similar · ${Math.round(m.coverage * 100)}% of this scope</span></div><div class="hours"><b>${m.actualHours}h actual</b><span class="mono">${m.estimatedHours}h estimated · ${(m.actualHours / m.estimatedHours).toFixed(2)}×</span></div>`);
        big("matches", ev.rank);
        break;
      }
      case "estimate": {
        const e = ev.estimate;
        state.ests.push(e);
        state.maxP90 = Math.max(state.maxP90, e.p90);
        show("#sEsts");
        const r = state.reqs.find((x) => x.id === e.reqId);
        const el = row($("#ests"), "est", `<span class="id mono">${e.reqId}</span><div class="text">${esc(r?.text || e.label)}<span class="kind">${esc(e.label)}</span></div><div class="num">0h</div>
          <div class="bar"><i class="p90"></i><i class="p50"></i></div>
          <div class="meta mono"><span><b>${e.samples}</b> comparable components${e.fromMatches ? ` · ${e.fromMatches} from matches` : ""}</span><span>overrun <b>${e.overrun}×</b> included</span><span>P50 <b>${e.p50}h</b> · P90 <b>${e.p90}h</b></span><button data-toggle>evidence</button></div>
          <div class="ev mono" hidden>${e.evidence.map((v) => `<div><span>${esc(v.component)}</span><span>${esc(v.projectTitle)} · ${v.year}${v.fromMatch ? " · matched" : ""}</span><span class="n">${v.estimatedHours}h est → <b>${v.actualHours}h</b></span></div>`).join("") || "<div>No comparable components; base rate used.</div>"}</div>`);
        $("[data-toggle]", el).onclick = () => { const x = $(".ev", el); x.hidden = !x.hidden; };
        countUp($(".num", el), e.p50, (v) => `${Math.round(v)}h`);
        requestAnimationFrame(() => document.querySelectorAll("#ests .est").forEach((n, i) => { const x = state.ests[i]; $(".p50", n).style.width = `${(x.p50 / state.maxP90) * 100}%`; $(".p90", n).style.width = `${(x.p90 / state.maxP90) * 100}%`; }));
        const h50 = state.ests.reduce((s, x) => s + x.p50, 0), h90 = state.ests.reduce((s, x) => s + x.p90, 0);
        big("hours", h50);
        $("#estSub").textContent = `${h50}h at P50, ${h90}h at P90, from ${state.ests.reduce((s, x) => s + x.samples, 0)} comparable components. Historical overrun for each kind of work is already inside the number.`;
        break;
      }
      case "phase": { state.phases.push(ev.phase); show("#sTimeline"); renderGantt(); break; }
      case "schedule": { state.totalWeeks = ev.totals.totalWeeks; renderGantt(); big("weeks", ev.totals.totalWeeks); $("#ganttMeta").textContent = `${ev.totals.totalWeeksP90} weeks at P90 · ${ev.totals.hoursP50}–${ev.totals.hoursP90}h · team of ${ev.totals.team.size}`; break; }
      case "pricing": {
        state.pricing = ev.pricing;
        show("#sOptions");
        const rec = ev.pricing.options.find((o) => o.recommended);
        $("#bigPrice").innerHTML = `<b class="lo">0</b><span style="color:var(--dim)"> – </span><b class="hi">0</b>`;
        countUp($("#bigPrice .lo"), rec.low, (v) => fmtMoney(v, ev.pricing.rate), 1400);
        countUp($("#bigPrice .hi"), rec.high, (v) => fmtMoney(v, ev.pricing.rate), 1400);
        $("#options").innerHTML = ev.pricing.options.map((o, i) => `<div class="opt in${o.recommended ? " rec" : ""}" data-key="${o.key}" style="animation-delay:${i * 120}ms"><div class="name mono">${esc(o.name)}${o.recommended ? "<em>recommended</em>" : ""}</div><div class="price"><span class="lo">0</span><span>–</span><span class="hi">0</span></div><div class="meta mono">${o.weeks} weeks · ~${o.hours}h · ${o.includes.length} of ${state.reqs.length} requirements</div><div class="tag">${esc(o.tagline)}</div></div>`).join("");
        ev.pricing.options.forEach((o, i) => { const c = $(`#options [data-key="${o.key}"]`); setTimeout(() => { countUp($(".lo", c), o.low, (v) => fmtMoney(v, ev.pricing.rate)); countUp($(".hi", c), o.high, (v) => fmtMoney(v, ev.pricing.rate)); }, i * 120); });
        $("#optMeta").textContent = `P90/P50 spread ${ev.pricing.spread}× → ${ev.pricing.confidence} confidence · ${fmtMoney(ev.pricing.rate.perHour, ev.pricing.rate)}/h`;
        break;
      }
      case "risk": {
        const k = ev.risk;
        state.risks.push(k);
        show("#sRisks");
        row($("#risks"), `risk ${k.severity}`, `<span class="sev">${k.severity}</span><div><div class="title">${esc(k.title)}</div><div class="detail">${esc(k.detail)}</div></div><div class="q">${esc(k.question)}</div>`);
        big("risks", state.risks.length);
        break;
      }
      case "token": {
        if (!state.text) show("#sText");
        state.text += ev.text;
        if (!state._raf) state._raf = requestAnimationFrame(() => { state._raf = null; $("#doc").innerHTML = md(state.text) + '<span class="caret"></span>'; if (embedded) $("#doc").scrollTop = 1e6; });
        break;
      }
      case "done": {
        $("#doc").innerHTML = md(state.text);
        clearInterval(state.clock);
        state.stats = ev.stats;
        $("#timer").firstChild.textContent = (ev.stats.ms / 1000).toFixed(1);
        $("#summary").innerHTML = [["Built in", `${(ev.stats.ms / 1000).toFixed(1)}s`], ["Requirements", ev.stats.requirements], ["Projects scanned", ev.stats.projectsScanned], ["Evidence points", ev.stats.evidenceComponents], ["Risks flagged", ev.stats.risks], ["Words", ev.stats.words]].map(([l, v]) => `<div><b>${v}</b>${l}</div>`).join("");
        document.body.classList.remove("running"); document.body.classList.add("done");
        if (!embedded) $("#sText").scrollIntoView({ block: "start", behavior: "smooth" });
        state.running = false; $("#run").disabled = false;
        break;
      }
      case "saved": { state.shareUrl = ev.shareUrl; state.markdown = ev.markdown; $("#exports").hidden = false; break; }
      case "error": { note(ev.message || "Engine error"); state.running = false; $("#run").disabled = false; clearInterval(state.clock); document.body.classList.remove("running"); break; }
    }
  }

  function renderGantt() {
    const total = state.totalWeeks || state.phases.reduce((s, p) => s + p.weeks, 0) || 1;
    $("#gantt").innerHTML = state.phases.map((p, i) => `<div class="g in" style="animation-delay:${i * 60}ms"><div class="label">${esc(p.name)}<span>${p.items.length} item${p.items.length === 1 ? "" : "s"} · ${p.hoursP50}–${p.hoursP90}h</span></div><div class="track"><div class="b90" style="left:${((p.startWeek + p.weeks) / total) * 100}%;width:${((p.weeksP90 - p.weeks) / total) * 100}%"></div><div class="b" style="left:${(p.startWeek / total) * 100}%;width:${(p.weeks / total) * 100}%">${p.weeks}w</div></div></div>`).join("") +
      `<div class="axis mono"><div></div><div>${Array.from({ length: 5 }, (_, i) => `<span>W${Math.round((total / 4) * i)}</span>`).join("")}</div></div>`;
  }

  // ---------- sources ----------
  async function runLive(brief) {
    if (state.running) return;
    reset();
    state.brief = brief; state.running = true;
    $("#run").disabled = true; $("#brief").hidden = true; $("#briefView").hidden = false; $("#reset").hidden = false; note("");
    renderBrief(); startClock();
    let res;
    try { res = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brief }) }); }
    catch { return handle({ type: "error", message: "Could not reach the engine." }); }
    if (!res.ok) { const e = await res.json().catch(() => ({})); return handle({ type: "error", message: e.error || `Engine returned ${res.status}` }); }
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n\n"); buf = parts.pop();
      for (const part of parts) { const line = part.split("\n").find((l) => l.startsWith("data:")); if (line) handle(JSON.parse(line.slice(5))); }
    }
    if (state.running) handle({ type: "error", message: "Stream ended early." });
  }

  async function replay(p, { speed = 1.6 } = {}) {
    reset();
    state.brief = p.brief; state.running = true;
    $("#brief").hidden = true; $("#briefView").hidden = false; $("#run").hidden = true; $("#samples").hidden = true;
    renderBrief(); startClock();
    let last = 0;
    for (const ev of p.events) {
      const gap = Math.min(ev.type === "token" ? 12 : 320, (ev.t - last) / speed);
      last = ev.t;
      if (gap > 6) await sleep(gap);
      handle(ev);
    }
    handle({ type: "saved", shareUrl: p.shareUrl, markdown: p.markdown });
  }

  // ---------- exports ----------
  const openUrl = (href) => (window.openai?.openExternal ? window.openai.openExternal({ href }) : window.open(href, "_blank", "noopener"));
  $("#exports").addEventListener("click", async (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act; if (!act) return;
    if (act === "pdf") openUrl(state.shareUrl);
    if (act === "md") openUrl(state.shareUrl + ".md?download=1");
    if (act === "copy") { try { await navigator.clipboard.writeText(state.markdown || state.text); note("Copied proposal with evidence appendix"); } catch { openUrl(state.shareUrl + ".md"); } }
    if (act === "questions") { try { await navigator.clipboard.writeText(state.risks.map((k) => `- ${k.question}`).join("\n")); note("Copied client questions"); } catch { } }
    if (act === "email" && window.openai?.sendFollowUpMessage) window.openai.sendFollowUpMessage({ prompt: `Draft a short email to ${state.client} asking the ${state.risks.length} clarifying questions from the proposal engine, grouped by topic, friendly tone.` });
  });

  // ---------- boot ----------
  buildChrome();
  let played = false;
  const sync = () => {
    const p = window.openai?.toolOutput;
    if (!p?.events || played) return;
    played = true;
    document.body.classList.add("embedded");
    if (window.openai?.sendFollowUpMessage) $('[data-act="email"]').hidden = false;
    replay(p);
  };
  window.addEventListener("openai:set_globals", sync);
  if (embedded) { document.body.classList.add("embedded"); sync(); }
  else {
    fetch("/api/samples").then((r) => r.json()).then(({ samples, history, live }) => {
      $("#samples").innerHTML = samples.map((s, i) => `<button data-i="${i}">${esc(s.name)}</button>`).join("");
      $("#samples").onclick = (e) => { const i = e.target.dataset.i; if (i != null) { $("#brief").value = samples[i].brief; $("#brief").hidden = false; $("#briefView").hidden = true; } };
      $("#memory").textContent = `memory: ${history.projects} past projects · ${history.components} components with actual hours`;
      $("#mode").textContent = live ? "openai + delivery history" : "rules + delivery history";
      $("#brief").value = samples[0].brief;
    }).catch(() => {});
    $("#run").onclick = () => { const b = $("#brief").value.trim(); if (b.length < 40) return note("Paste a brief first. A few sentences is enough."); runLive(b); };
    $("#reset").onclick = () => { reset(); $("#brief").hidden = false; $("#briefView").hidden = true; $("#reset").hidden = true; window.scrollTo({ top: 0, behavior: "smooth" }); };
    $("#brief").addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") $("#run").click(); });
    // The textarea grows with the brief so the hero reads as text, not a form field.
    const autosize = () => { const ta = $("#brief"); ta.style.height = "auto"; ta.style.height = Math.max(200, ta.scrollHeight) + "px"; };
    $("#brief").addEventListener("input", autosize);
    new MutationObserver(autosize).observe($("#brief"), { attributes: true, attributeFilter: ["hidden"] });
    setTimeout(autosize, 300); setTimeout(autosize, 1200);
    $("#samples").addEventListener("click", () => setTimeout(autosize, 0));
  }
})();
