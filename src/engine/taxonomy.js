// Shared vocabulary for the whole pipeline: what kinds of work exist, how to spot them in a brief,
// which delivery phase they belong to, and how much a unit of each costs at a given complexity.
// Keywords match on a word boundary; a trailing * allows any suffix ("integrat*" → integrate, integration).

export const CATEGORIES = {
  discovery:       { label: "Discovery & workflow mapping", phase: "Discovery",  base: 40,  keywords: ["discovery", "audit", "requirements", "map our", "assess*"] },
  "knowledge-base":{ label: "Knowledge base",               phase: "Foundation", base: 90,  keywords: ["sop", "sops", "knowledge", "documents", "policy", "policies", "faq", "faqs", "manual", "manuals", "handbook", "guidelines", "playbook", "wiki"] },
  integration:     { label: "System integration",           phase: "Foundation", base: 110, keywords: ["integrat*", "api", "apis", "crm", "erp", "lab system", "lis", "salesforce", "hubspot", "sap", "connect to", "system data", "database", "zendesk", "freshdesk", "shopify", "purchase orders", "booking system"] },
  "data-pipeline": { label: "Data pipeline",                phase: "Foundation", base: 100, keywords: ["etl", "warehouse", "sync*", "pipeline", "migrat*", "spreadsheets", "excel", "csv", "ingest*"] },
  auth:            { label: "Access & roles",               phase: "Foundation", base: 50,  keywords: ["login", "sso", "auth*", "roles", "permission*", "single sign"] },
  "llm-assistant": { label: "AI assistant",                 phase: "Build",      base: 120, keywords: ["assistant", "draft*", "replies", "chatbot", "copilot", "answer*", "summar*", "generate*", "suggest*", "ai that", "scores", "classif*", "extracts", "extract"] },
  channel:         { label: "Messaging channel",            phase: "Build",      base: 60,  keywords: ["whatsapp", "email*", "sms", "slack", "teams", "voice", "phone", "chat widget", "messenger", "pdfs"] },
  "web-app":       { label: "Web interface",                phase: "Build",      base: 110, keywords: ["portal", "web app", "frontend", "screen*", "interface", "web page", "console"] },
  mobile:          { label: "Mobile app",                   phase: "Build",      base: 160, keywords: ["mobile", "ios", "android", "app store"] },
  dashboard:       { label: "Dashboard & reporting",        phase: "Build",      base: 70,  keywords: ["dashboard*", "analytics", "metrics", "kpi*", "reporting", "insights", "pipeline quality"] },
  automation:      { label: "Workflow automation",          phase: "Automate",   base: 100, keywords: ["automat*", "workflow*", "route*", "routing", "escalat*", "trigger*", "on its own", "autonomous*", "without an agent", "without the agents", "hands-free", "self-serve", "self serve", "matches it", "qualif*"] },
  compliance:      { label: "Compliance & safety",          phase: "Automate",   base: 60,  keywords: ["hipaa", "gdpr", "compliance", "audit log*", "pii", "consent", "security", "regulat*", "dpdp", "redact*"] },
  training:        { label: "Team training",                phase: "Enablement", base: 40,  keywords: ["train*", "onboard*", "enable*", "workshop*", "upskill*", "adoption"] },
};

export const PHASES = ["Discovery", "Foundation", "Build", "Automate", "Enablement"];

export const COMPLEXITY_FACTOR = { 1: 1, 2: 1.6, 3: 2.5 };

export const INDUSTRIES = ["Healthcare", "Logistics", "Retail", "Banking", "Insurance", "Education", "Real estate", "Manufacturing", "Hospitality", "SaaS", "Legal", "Public sector"];

export const INDUSTRY_HINTS = {
  Healthcare: ["patient", "clinic", "hospital", "diagnostic", "lab", "labs", "pathology", "medical", "health"],
  Logistics: ["shipment", "freight", "courier", "delivery", "fleet", "warehouse"],
  Retail: ["store", "stores", "shopper", "ecommerce", "e-commerce", "orders", "catalogue"],
  Banking: ["bank", "loan", "credit", "account holders", "kyc"],
  Insurance: ["claim", "claims", "policyholder", "underwrit", "insurer"],
  Education: ["student", "students", "course", "university", "school", "learners"],
  "Real estate": ["property", "realty", "tenant", "listing", "tower", "broker", "estate"],
  Manufacturing: ["plant", "plants", "factory", "manufactur", "supplier", "production line"],
  Hospitality: ["hotel", "guest", "guests", "booking", "resort", "restaurant"],
  SaaS: ["saas", "subscription", "churn", "trial users"],
  Legal: ["law firm", "contract", "contracts", "legal", "counsel"],
  "Public sector": ["council", "citizen", "municipal", "ministry", "government"],
};

// Blended hourly rates by currency. Indicative; replace with a real rate card.
export const RATES = {
  USD: { symbol: "$", perHour: 95, locale: "en-US", round: 500 },
  INR: { symbol: "₹", perHour: 5500, locale: "en-IN", round: 25000 },
  AED: { symbol: "AED ", perHour: 350, locale: "en-AE", round: 2500 },
  GBP: { symbol: "£", perHour: 80, locale: "en-GB", round: 500 },
  SGD: { symbol: "S$", perHour: 130, locale: "en-SG", round: 500 },
};

export const CURRENCY_HINTS = [
  ["INR", ["india", "₹", "inr", "rupee", "lakh", "crore", "maharashtra", "karnataka", "bengaluru", "mumbai", "delhi", "pune", "chennai", "hyderabad"]],
  ["AED", ["uae", "dubai", "abu dhabi", "aed", "dirham", "gcc", "saudi", "riyadh", "qatar"]],
  ["GBP", ["uk", "london", "£", "gbp", "nhs", "british"]],
  ["SGD", ["singapore", "sgd", "s$"]],
];

export const TEAM = { size: 3, productiveHoursPerWeek: 32, pmOverhead: 0.12 };
