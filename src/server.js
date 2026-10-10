import express from "express";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { run, history } from "./engine/index.js";
import * as llm from "./engine/llm.js";
import { save, get } from "./store.js";
import { toMarkdown, toPrintableHtml } from "./render.js";
import { SAMPLE_BRIEFS } from "./sample.js";

const PORT = Number(process.env.PORT || 8787);
const WIDGET_URI = "ui://widget/proposal-engine.html";
const file = (p) => readFileSync(new URL(`../public/${p}`, import.meta.url), "utf8");
// The widget is one self-contained HTML file: app.html with the shared JS inlined.
const widgetHtml = () => file("app.html").replace('<script src="/engine-ui.js"></script>', `<script>${file("engine-ui.js")}</script>`);

const baseUrl = (req) => process.env.PUBLIC_URL?.replace(/\/$/, "") || `${req.headers["x-forwarded-proto"] || req.protocol}://${req.headers["x-forwarded-host"] || req.get("host")}`;

function finish(result, base) {
  const record = save({ ...result.proposal, events: result.events });
  return { ...record, markdown: toMarkdown(record), shareUrl: `${base}/p/${record.id}` };
}

function createMcpServer(base) {
  const server = new McpServer({ name: "proposal-engine", version: "2.0.0" });

  server.registerResource("proposal-widget", WIDGET_URI, {}, async () => ({
    contents: [{
      uri: WIDGET_URI, mimeType: "text/html+skybridge", text: widgetHtml(),
      _meta: {
        "openai/widgetPrefersBorder": true,
        "openai/widgetDescription": "Shows the estimation engine building the proposal: requirements, comparable past projects, evidence-based hours, timeline, three priced options and risks.",
        "openai/widgetCSP": { connect_domains: [], resource_domains: ["https://fonts.googleapis.com", "https://fonts.gstatic.com"] },
      },
    }],
  }));

  server.registerTool("build_proposal", {
    title: "Build evidence-based proposal",
    description: "Turn a client brief into a scoped, scheduled and priced proposal. Pass the brief text verbatim. The engine extracts requirements, finds comparable past projects, estimates hours from their actual (not estimated) effort, builds a timeline, prices three options and flags risks with questions to ask the client. Use whenever a user pastes a brief, RFP or project request, or asks what something would cost or how long it would take.",
    inputSchema: { brief: z.string().min(40).describe("The client's brief, RFP or request, verbatim") },
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
    _meta: { "openai/outputTemplate": WIDGET_URI, "openai/toolInvocation/invoking": "Running the estimation engine…", "openai/toolInvocation/invoked": "Proposal built", "openai/widgetAccessible": true },
  }, async ({ brief }) => {
    // Full speed: ChatGPT waits for the tool; the widget replays the recorded event timing instead.
    const p = finish(await run(brief, undefined, { pace: 0 }), base);
    const rec = p.pricing.options.find((o) => o.recommended);
    return {
      content: [{ type: "text", text: `Built a proposal for ${p.client}: ${p.requirements.length} requirements, ${p.schedule.totalWeeks} weeks, recommended ${rec.label} (${p.currency ?? p.pricing.currency}), based on ${p.matches.length} comparable past projects. ${p.risks.filter((k) => k.severity === "high").length} high risks. Printable: ${p.shareUrl}. The widget replays the engine run; summarise in two sentences and list the client questions.` }],
      structuredContent: p,
    };
  });
  return server;
}

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.all("/mcp", async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null });
  const server = createMcpServer(baseUrl(req));
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => { transport.close(); server.close(); });
  try { await server.connect(transport); await transport.handleRequest(req, res, req.body); }
  catch (err) { console.error(err); if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null }); }
});

app.get("/", (req, res) => res.type("html").send(file("app.html")));
app.get("/engine-ui.js", (req, res) => res.type("application/javascript").send(file("engine-ui.js")));
app.get("/widget.html", (req, res) => res.type("html").send(widgetHtml()));
app.get("/api/samples", (req, res) => res.json({ samples: SAMPLE_BRIEFS, history: { projects: history.length, components: history.reduce((s, p) => s + p.components.length, 0) }, live: llm.enabled() }));

// Live run: streams engine events as SSE, ends with the saved proposal.
app.post("/api/run", async (req, res) => {
  const brief = String(req.body?.brief || "").trim();
  if (brief.length < 40) return res.status(400).json({ error: "Paste a brief first (a few sentences is enough)." });
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  const write = (ev) => res.write(`data: ${JSON.stringify(ev)}\n\n`);
  try {
    const result = await run(brief, write);
    const p = finish(result, baseUrl(req));
    write({ type: "saved", id: p.id, shareUrl: p.shareUrl, markdown: p.markdown });
  } catch (err) {
    console.error(err);
    write({ type: "error", message: err.message });
  }
  res.end();
});

app.get("/api/history", (req, res) => res.json(history));
app.get("/api/proposal/:id", (req, res) => {
  const p = get(req.params.id);
  if (!p) return res.status(404).json({ error: "not found" });
  res.json({ ...p, markdown: toMarkdown(p), shareUrl: `${baseUrl(req)}/p/${p.id}` });
});

app.get("/p/:id.md", (req, res) => {
  const p = get(req.params.id);
  if (!p) return res.status(404).send("Proposal not found");
  if (req.query.download) res.setHeader("Content-Disposition", `attachment; filename="${p.client.replace(/[^\w-]+/g, "-")}-proposal.md"`);
  res.type("text/markdown").send(toMarkdown(p));
});
app.get("/p/:id", (req, res) => {
  const p = get(req.params.id);
  if (!p) return res.status(404).send("Proposal not found");
  res.type("html").send(toPrintableHtml(p));
});

app.listen(PORT, () => {
  console.log(`Proposal engine on http://localhost:${PORT}`);
  console.log(`  MCP: http://localhost:${PORT}/mcp · OpenAI: ${llm.enabled() ? `on (${llm.MODEL()})` : "off, deterministic engine only"} · history: ${history.length} projects`);
});
