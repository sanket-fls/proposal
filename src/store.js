import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { getStore } from "@netlify/blobs";

const dir = new URL("../data/", import.meta.url);
const file = new URL("proposals.json", dir);

let db = {};
if (process.env.NETLIFY !== "true" && existsSync(file)) {
  try { db = JSON.parse(readFileSync(file, "utf8")); } catch { db = {}; }
}

const cloudStore = () => getStore({ name: "proposals", consistency: "strong" });

export async function save(proposal) {
  const id = randomBytes(5).toString("hex");
  const record = { ...proposal, id, createdAt: new Date().toISOString() };
  if (process.env.NETLIFY === "true") {
    await cloudStore().setJSON(id, record);
    return record;
  }
  db[id] = record;
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify(db, null, 2));
  return record;
}

export const get = async (id) => process.env.NETLIFY === "true"
  ? cloudStore().get(id, { type: "json" })
  : db[id];
