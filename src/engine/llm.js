// Thin OpenAI client over fetch. Every call here has a local fallback in the pipeline, so a missing key or a
// failed request degrades to the deterministic engine instead of breaking the run.
const KEY = () => process.env.OPENAI_API_KEY;
export const MODEL = () => process.env.OPENAI_MODEL || "gpt-5-mini";
export const EMBED_MODEL = () => process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small";
export const enabled = () => Boolean(KEY());

const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${KEY()}` });

export async function structured(system, user, name, schema, { timeoutMs = 45000 } = {}) {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST", headers: headers(), signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({ model: MODEL(), input: [{ role: "system", content: system }, { role: "user", content: user }], text: { format: { type: "json_schema", name, strict: true, schema } } }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = data.output_text ?? data.output?.flatMap((o) => o.content ?? []).find((c) => c.type === "output_text")?.text;
  return JSON.parse(text);
}

const embedCache = new Map();
export async function embed(texts) {
  const missing = texts.filter((t) => !embedCache.has(t));
  if (missing.length) {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST", headers: headers(), signal: AbortSignal.timeout(30000),
      body: JSON.stringify({ model: EMBED_MODEL(), input: missing }),
    });
    if (!res.ok) throw new Error(`OpenAI embeddings ${res.status}`);
    const { data } = await res.json();
    data.forEach((d, i) => embedCache.set(missing[i], d.embedding));
  }
  return texts.map((t) => embedCache.get(t));
}

// Streams output text deltas to onToken; resolves with the full text.
export async function stream(system, user, onToken, { timeoutMs = 60000 } = {}) {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST", headers: headers(), signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({ model: MODEL(), stream: true, input: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });
  if (!res.ok || !res.body) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", full = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const ev = JSON.parse(payload);
        if (ev.type === "response.output_text.delta" && ev.delta) { full += ev.delta; onToken(ev.delta); }
        if (ev.type === "error") throw new Error(ev.error?.message || "stream error");
      } catch (e) { if (e.message !== "Unexpected end of JSON input") throw e; }
    }
  }
  return full;
}

export const EXTRACT_SYSTEM = `You extract software requirements from a client brief for an estimation engine.
Return every distinct piece of work the client is asking for, one requirement each, in the client's own words where possible.
Categories: discovery, knowledge-base, integration, data-pipeline, auth, llm-assistant, channel, web-app, mobile, dashboard, automation, compliance, training.
complexity: 1 = standard, 2 = multiple systems/high volume, 3 = autonomous/real-time/novel.
quote: an exact substring of the brief (max 80 chars) that this requirement comes from.
Also extract the client name and constraints.`;

export const EXTRACT_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    client: { type: "string" },
    requirements: { type: "array", items: { type: "object", additionalProperties: false, properties: {
      text: { type: "string" }, quote: { type: "string" },
      category: { type: "string", enum: ["discovery", "knowledge-base", "integration", "data-pipeline", "auth", "llm-assistant", "channel", "web-app", "mobile", "dashboard", "automation", "compliance", "training"] },
      complexity: { type: "integer" }, confidence: { type: "number" },
    }, required: ["text", "quote", "category", "complexity", "confidence"] } },
    constraints: { type: "object", additionalProperties: false, properties: { deadlineWeeks: { type: ["number", "null"] }, budgetStated: { type: "boolean" }, currency: { type: "string", enum: ["USD", "INR", "AED", "GBP", "SGD"] } }, required: ["deadlineWeeks", "budgetStated", "currency"] },
  },
  required: ["client", "requirements", "constraints"],
};
