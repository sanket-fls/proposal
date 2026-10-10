import serverless from "serverless-http";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

// Also supports the existing local key spelling without exposing it to the browser.
process.env.NETLIFY = "true";
process.env.OPENAI_API_KEY ||= process.env.OPEN_AI_API_KEY;
const { app, createMcpServer, finish } = await import("../../src/server.js");
const { run } = await import("../../src/engine/index.js");
const buffered = serverless(app);

export default async function handler(request) {
  const url = new URL(request.url);
  const base = process.env.PUBLIC_URL?.replace(/\/$/, "") || url.origin;
  if (url.pathname === "/api/run" && request.method === "POST") {
    let body;
    try { body = await request.json(); }
    catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
    const brief = String(body?.brief || "").trim();
    if (brief.length < 40) return Response.json({ error: "Paste a brief first (a few sentences is enough)." }, { status: 400 });
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const write = (event) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        try {
          const result = await run(brief, write, { pace: 0 });
          const p = await finish(result, base);
          write({ type: "saved", id: p.id, shareUrl: p.shareUrl, markdown: p.markdown });
        } catch (error) {
          console.error(error);
          write({ type: "error", message: "Proposal generation failed. Please try again." });
        } finally { controller.close(); }
      },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
  }
  if (url.pathname === "/mcp") {
    const server = createMcpServer(base);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    try {
      await server.connect(transport);
      return await transport.handleRequest(request);
    } finally { await server.close(); }
  }
  const result = await buffered({
    httpMethod: request.method, path: url.pathname,
    headers: Object.fromEntries(request.headers),
    queryStringParameters: Object.fromEntries(url.searchParams),
    body: ["GET", "HEAD"].includes(request.method) ? null : await request.text(),
    isBase64Encoded: false,
    requestContext: { identity: {}, httpMethod: request.method },
  });
  return new Response(result.isBase64Encoded ? Buffer.from(result.body, "base64") : result.body, {
    status: result.statusCode, headers: result.headers,
  });
}

export const config = { path: ["/api/*", "/p/*", "/mcp", "/widget.html"] };
