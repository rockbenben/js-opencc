/**
 * Export custom dictionary entries that are candidates for OpenCC upstream PR.
 *
 * Compares data/custom/CNTWPhrases.txt against the latest upstream
 * TWPhrases.txt (fetched live from BYVoid/OpenCC@master). Prints:
 *   1. NEW entries — present in our custom dict, absent upstream → PR candidates
 *   2. CONFLICTS — present in both with different values → human review needed
 *
 * Usage: npx tsx scripts/export-pr.ts
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const UPSTREAM_URL =
  "https://raw.githubusercontent.com/BYVoid/OpenCC/master/data/dictionary/TWPhrases.txt";

interface DictEntry {
  key: string;
  value: string;
}

function parseOpenCCFormat(content: string): Map<string, string> {
  const dict = new Map<string, string>();
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const tabIdx = line.indexOf("\t");
    let key: string;
    let valueField: string;
    if (tabIdx >= 0) {
      key = line.slice(0, tabIdx).trim();
      valueField = line.slice(tabIdx + 1).trim();
    } else {
      const m = line.match(/^(\S+)\s+(.+)$/);
      if (!m) continue;
      key = m[1];
      valueField = m[2];
    }
    if (!key || !valueField) continue;
    // First space-separated value wins (matches OpenCC convention)
    const value = valueField.split(/\s+/)[0];
    if (value) dict.set(key, value);
  }
  return dict;
}

function parseCustomDict(content: string): DictEntry[] {
  const entries: DictEntry[] = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const tabIdx = line.indexOf("\t");
    if (tabIdx < 0) continue;
    const key = line.slice(0, tabIdx).trim();
    const value = line.slice(tabIdx + 1).trim().split(/\s+/)[0];
    if (key && value) entries.push({ key, value });
  }
  return entries;
}

async function fetchUpstream(): Promise<Map<string, string>> {
  console.log(`Fetching upstream TWPhrases.txt from BYVoid/OpenCC@master...`);
  const response = await fetch(UPSTREAM_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch upstream: ${response.status} ${response.statusText}`);
  }
  const text = await response.text();
  if (text.trimStart().startsWith("<")) {
    throw new Error("Upstream returned HTML (likely a CDN error page), not dict content.");
  }
  const dict = parseOpenCCFormat(text);
  console.log(`  Upstream entries: ${dict.size}`);
  return dict;
}

async function main() {
  const customPath = path.join(ROOT_DIR, "data", "custom", "CNTWPhrases.txt");

  if (!fs.existsSync(customPath)) {
    console.log("No custom dict at data/custom/CNTWPhrases.txt");
    return;
  }

  const customContent = fs.readFileSync(customPath, "utf-8");
  const customEntries = parseCustomDict(customContent);
  console.log(`Local CNTWPhrases entries: ${customEntries.length}`);

  const upstream = await fetchUpstream();

  const newEntries: DictEntry[] = [];
  const conflicts: Array<{ key: string; ours: string; upstream: string }> = [];

  for (const entry of customEntries) {
    const upstreamValue = upstream.get(entry.key);
    if (upstreamValue === undefined) {
      newEntries.push(entry);
    } else if (upstreamValue !== entry.value) {
      conflicts.push({ key: entry.key, ours: entry.value, upstream: upstreamValue });
    }
    // If upstreamValue === entry.value, entry already in upstream — silent skip.
  }

  console.log("");
  console.log("=".repeat(60));
  console.log(`NEW entries (PR candidates): ${newEntries.length}`);
  console.log("=".repeat(60));
  if (newEntries.length === 0) {
    console.log("(none — all local entries already in upstream)");
  } else {
    console.log("Paste into OpenCC's data/dictionary/TWPhrases.txt:");
    console.log("");
    for (const e of newEntries) {
      console.log(`${e.key}\t${e.value}`);
    }
  }

  if (conflicts.length > 0) {
    console.log("");
    console.log("=".repeat(60));
    console.log(`CONFLICTS (different value in upstream): ${conflicts.length}`);
    console.log("=".repeat(60));
    console.log("These require human review — upstream and local disagree:");
    console.log("");
    for (const c of conflicts) {
      console.log(`  ${c.key}`);
      console.log(`    ours:     ${c.ours}`);
      console.log(`    upstream: ${c.upstream}`);
    }
  }

  const inSync = customEntries.length - newEntries.length - conflicts.length;
  console.log("");
  console.log(`Summary: ${newEntries.length} new / ${conflicts.length} conflict / ${inSync} already in upstream`);
}

main().catch((err) => {
  console.error("export:pr failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
