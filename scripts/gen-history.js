// Generates a realistic delivery history: past projects with components, estimated vs actual hours.
// Deterministic (seeded) so the demo numbers never drift. Run: node scripts/gen-history.js
import { writeFileSync } from "node:fs";
import { CATEGORIES, INDUSTRIES, COMPLEXITY_FACTOR } from "../src/engine/taxonomy.js";

let seed = 20261010;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const gauss = (m, s) => { const u = 1 - rnd(), v = rnd(); return m + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

// How much each kind of work has historically overrun its estimate (mean, spread).
const OVERRUN = {
  discovery: [1.02, 0.08], "knowledge-base": [1.18, 0.14], integration: [1.38, 0.22], "data-pipeline": [1.31, 0.2], auth: [1.1, 0.1],
  "llm-assistant": [1.22, 0.16], channel: [1.12, 0.1], "web-app": [1.2, 0.15], mobile: [1.34, 0.2], dashboard: [1.08, 0.1],
  automation: [1.29, 0.18], compliance: [1.42, 0.25], training: [0.96, 0.1],
};

const NAMES = {
  Healthcare: ["Meridian Diagnostics", "CarePoint Clinics", "Nova Pathology", "Sunrise Hospitals", "Apex Dental Group"],
  Logistics: ["SwiftFreight", "Harbour Logistics", "RoadRunner Cargo", "BlueLine Couriers"],
  Retail: ["Urban Basket", "StyleHouse", "FreshMart", "Lumen Electronics"],
  Banking: ["Crescent Bank", "Northgate Finance", "Pioneer Credit Union"],
  Insurance: ["ShieldSure", "Atlas Mutual", "ClearCover"],
  Education: ["BrightPath Academy", "Summit University", "LearnLoop"],
  "Real estate": ["Skyline Realty", "Harbor Homes", "Metro Estates"],
  Manufacturing: ["Forge Industrial", "Precision Parts Co", "Vertex Plastics"],
  Hospitality: ["Grand Meridian Hotels", "Oasis Resorts", "CityStay"],
  SaaS: ["Flowdesk", "Metricly", "Stackwise"],
  Legal: ["Hale & Partners", "Lexora"],
  "Public sector": ["Riverside Council", "Transit Authority"],
};

const TITLES = {
  "llm-assistant": ["support reply assistant", "agent copilot", "internal Q&A assistant", "claims triage assistant"],
  "knowledge-base": ["SOP knowledge base", "policy search", "product knowledge hub"],
  integration: ["CRM integration", "ERP connector", "ticketing integration", "LIS integration"],
  automation: ["ticket auto-routing", "self-serve status replies", "invoice processing automation", "lead qualification flow"],
  dashboard: ["ops dashboard", "quality dashboard", "SLA reporting"],
  "data-pipeline": ["data warehouse sync", "spreadsheet migration", "event pipeline"],
  channel: ["WhatsApp channel", "email channel", "Slack bot", "voice IVR"],
  "web-app": ["agent console", "customer portal", "review workbench"],
  mobile: ["field app", "customer app"],
  training: ["team enablement programme", "agent workshops"],
  compliance: ["audit logging & PII controls", "consent management"],
  auth: ["SSO & roles"],
  discovery: ["workflow discovery"],
};

const COMPONENT_NAMES = {
  "llm-assistant": ["Draft-reply assistant", "Summarisation assistant", "Q&A assistant", "Triage classifier"],
  "knowledge-base": ["Document ingestion & chunking", "Retrieval with citations", "Knowledge base admin"],
  integration: ["CRM read/write API", "Ticketing system sync", "Lab information system connector", "ERP order lookup", "Calendar/slot API"],
  automation: ["Auto-reply for status queries", "Escalation rules engine", "Approval workflow", "Lead routing"],
  dashboard: ["Quality dashboard", "SLA report", "Usage analytics"],
  "data-pipeline": ["Nightly warehouse sync", "CSV import pipeline", "Event stream"],
  channel: ["WhatsApp Business API", "Email inbox connector", "Slack app", "IVR hooks"],
  "web-app": ["Agent console UI", "Customer portal", "Admin settings"],
  mobile: ["iOS/Android app", "Push notifications"],
  training: ["Hands-on workshops", "Playbook & videos", "Hypercare"],
  compliance: ["PII redaction", "Audit log", "Consent capture"],
  auth: ["SSO (SAML/OIDC)", "Role-based access"],
  discovery: ["Workflow mapping", "Data audit", "Success metrics"],
};

const projects = [];
const cats = Object.keys(CATEGORIES);
for (let i = 0; i < 52; i++) {
  const industry = pick(INDUSTRIES);
  const client = pick(NAMES[industry]);
  const lead = pick(["llm-assistant", "automation", "knowledge-base", "integration", "dashboard", "web-app", "data-pipeline", "mobile"]);
  const n = 3 + Math.floor(rnd() * 4);
  const chosen = new Set([lead, "discovery"]);
  while (chosen.size < n) chosen.add(pick(cats));
  const components = [...chosen].map((cat) => {
    const complexity = 1 + Math.floor(rnd() * 3);
    const estimated = Math.round(CATEGORIES[cat].base * COMPLEXITY_FACTOR[complexity] * gauss(1, 0.15));
    const [m, s] = OVERRUN[cat];
    const actual = Math.round(estimated * Math.max(0.7, gauss(m, s)));
    return { name: pick(COMPONENT_NAMES[cat]), category: cat, complexity, estimatedHours: estimated, actualHours: actual };
  });
  const est = components.reduce((s, c) => s + c.estimatedHours, 0);
  const act = components.reduce((s, c) => s + c.actualHours, 0);
  const year = 2023 + Math.floor(rnd() * 3);
  const title = `${client} ${pick(TITLES[lead])}`;
  projects.push({
    id: `P-${String(100 + i)}`,
    client, industry, year, title,
    summary: `${industry} client. Built ${components.map((c) => c.name.toLowerCase()).join(", ")}.`,
    teamSize: 2 + Math.floor(rnd() * 3),
    plannedWeeks: Math.max(3, Math.round(est / 90)),
    actualWeeks: Math.max(3, Math.round(act / 90)),
    components,
    estimatedHours: est, actualHours: act,
    outcome: pick(["Live, in daily use", "Live, expanded to second team", "Live", "Live, follow-on phase sold", "Pilot completed"]),
  });
}

writeFileSync(new URL("../data/history.json", import.meta.url), JSON.stringify(projects, null, 1));
console.log(`wrote ${projects.length} projects, ${projects.reduce((s, p) => s + p.components.length, 0)} components`);
