/**
 * Export custom dictionary entries for OpenCC PR
 *
 * Usage: npx tsx scripts/export-pr.ts
 *
 * This script compares your custom dictionary with official dictionaries
 * and generates a diff that can be submitted as a PR to OpenCC.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

interface DictEntry {
  key: string;
  value: string;
}

// Official phrase dictionaries to compare against (only vocabulary/phrase dicts)
const OFFICIAL_PHRASE_DICTS = ["TWPhrasesIT.txt", "TWPhrasesName.txt", "TWPhrasesOther.txt"];

function parseOfficialDict(content: string): Map<string, string> {
  const dict = new Map<string, string>();
  for (const line of content.trim().split("\n")) {
    const [key, values] = line.split("\t");
    if (key && values) {
      dict.set(key, values.split(" ")[0]); // Take first value
    }
  }
  return dict;
}

function parseCustomDict(content: string): DictEntry[] {
  const entries: DictEntry[] = [];
  for (const line of content.trim().split("\n")) {
    if (line.startsWith("#") || !line.trim()) continue;
    const [key, value] = line.split("\t");
    if (key && value) {
      entries.push({ key: key.trim(), value: value.trim() });
    }
  }
  return entries;
}

function main() {
  const customDir = path.join(ROOT_DIR, "data", "custom");
  const officialDir = path.join(ROOT_DIR, "data", "official");

  if (!fs.existsSync(customDir)) {
    console.log("No custom dictionary found at data/custom/");
    console.log('Create a .txt file with format: "key\\tvalue" per line');
    return;
  }

  const customFiles = fs.readdirSync(customDir).filter((f) => f.endsWith(".txt"));

  if (customFiles.length === 0) {
    console.log("No .txt files found in data/custom/");
    return;
  }

  // Load all official phrase dictionaries
  const officialPhrases = new Map<string, { value: string; source: string }>();
  for (const dictFile of OFFICIAL_PHRASE_DICTS) {
    const dictPath = path.join(officialDir, dictFile);
    if (fs.existsSync(dictPath)) {
      const content = fs.readFileSync(dictPath, "utf-8");
      const dict = parseOfficialDict(content);
      for (const [key, value] of dict) {
        if (!officialPhrases.has(key)) {
          officialPhrases.set(key, { value, source: dictFile });
        }
      }
    }
  }

  console.log(`已載入 ${officialPhrases.size} 個官方詞條\n`);

  for (const customFile of customFiles) {
    const customPath = path.join(customDir, customFile);
    const customContent = fs.readFileSync(customPath, "utf-8");
    const customEntries = parseCustomDict(customContent);

    if (customEntries.length === 0) continue;

    console.log(`=== ${customFile} (${customEntries.length} 個自定義詞條) ===\n`);

    const newEntries: DictEntry[] = [];
    const existingEntries: { entry: DictEntry; official: { value: string; source: string } }[] = [];
    const differentEntries: { entry: DictEntry; official: { value: string; source: string } }[] = [];

    for (const entry of customEntries) {
      const official = officialPhrases.get(entry.key);
      if (!official) {
        newEntries.push(entry);
      } else if (official.value === entry.value) {
        existingEntries.push({ entry, official });
      } else {
        differentEntries.push({ entry, official });
      }
    }

    // Summary
    console.log("📊 統計:");
    console.log(`   ✅ 已被 OpenCC 收錄: ${existingEntries.length}`);
    console.log(`   🆕 OpenCC 未收錄:    ${newEntries.length}`);
    console.log(`   ⚠️  與官方不同:       ${differentEntries.length}\n`);

    // New entries that can be contributed
    if (newEntries.length > 0) {
      console.log("🆕 可以提交給 OpenCC 的新詞條:");
      console.log("─".repeat(50));
      for (const e of newEntries.slice(0, 30)) {
        console.log(`   ${e.key}\t→\t${e.value}`);
      }
      if (newEntries.length > 30) {
        console.log(`   ... 還有 ${newEntries.length - 30} 個詞條`);
      }
      console.log();
    }

    // Different from official
    if (differentEntries.length > 0) {
      console.log("⚠️  與官方字典不同（可能需要討論）:");
      console.log("─".repeat(50));
      for (const d of differentEntries.slice(0, 10)) {
        console.log(`   ${d.entry.key}`);
        console.log(`      官方 (${d.official.source}): ${d.official.value}`);
        console.log(`      自定義: ${d.entry.value}`);
      }
      if (differentEntries.length > 10) {
        console.log(`   ... 還有 ${differentEntries.length - 10} 個不同的詞條`);
      }
      console.log();
    }
  }

  console.log("─".repeat(50));
  console.log("如何貢獻給 OpenCC:");
  console.log("1. Fork https://github.com/BYVoid/OpenCC");
  console.log("2. 將詞條添加到 data/dictionary/TWPhrasesIT.txt");
  console.log("3. 提交 Pull Request");
}

main();
