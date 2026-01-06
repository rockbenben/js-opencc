/**
 * Sync dictionaries from OpenCC official repository
 *
 * Usage: npx tsx scripts/sync-opencc.ts
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

// OpenCC dictionary source
const OPENCC_BASE_URL = "https://raw.githubusercontent.com/BYVoid/OpenCC/master/data/dictionary";

// Dictionary files available in OpenCC official repo (based on API check)
const OFFICIAL_DICT_FILES = [
  "HKVariants",
  "HKVariantsRevPhrases",
  "JPShinjitaiCharacters",
  "JPShinjitaiPhrases",
  "JPVariants",
  "STCharacters",
  "STPhrases",
  "TSCharacters",
  "TSPhrases",
  "TWPhrasesIT",
  "TWPhrasesName",
  "TWPhrasesOther",
  "TWVariants",
  "TWVariantsRevPhrases",
];

// Reverse dictionaries to generate (not available in OpenCC, need to create from forward dicts)
const REVERSE_DICT_MAPPINGS: Record<string, string> = {
  HKVariantsRev: "HKVariants",
  TWVariantsRev: "TWVariants",
  JPVariantsRev: "JPVariants",
  TWPhrasesRev: "TWPhrasesIT", // Combine IT, Name, Other for reverse
};

async function downloadFile(fileName: string): Promise<string> {
  const url = `${OPENCC_BASE_URL}/${fileName}.txt`;
  console.log(`  Downloading ${fileName}...`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${fileName}: ${response.status}`);
  }

  return response.text();
}

function parseToEntries(content: string): [string, string][] {
  return content
    .trim()
    .split("\n")
    .map((line) => {
      const [key, values] = line.split("\t");
      const value = values?.split(" ")[0]; // Take only first candidate
      return [key, value] as [string, string];
    })
    .filter(([k, v]) => k && v);
}

function entriesToOptimized(entries: [string, string][]): string {
  return entries
    .filter(([k, v]) => k !== v || k.length > 1) // Remove identity mappings for single chars
    .map(([k, v]) => `${k} ${v}`)
    .join("|");
}

function reverseEntries(entries: [string, string][]): [string, string][] {
  // Create reverse mapping: value -> key
  // For multiple keys mapping to same value, keep all
  return entries.map(([k, v]) => [v, k] as [string, string]);
}

async function main() {
  const officialDir = path.join(ROOT_DIR, "data", "official");
  const dictDir = path.join(ROOT_DIR, "src", "dict");

  // Create directories
  fs.mkdirSync(officialDir, { recursive: true });
  fs.mkdirSync(dictDir, { recursive: true });

  console.log("Syncing dictionaries from OpenCC...\n");

  const allEntries: Record<string, [string, string][]> = {};

  // Download official dictionaries
  console.log("1. Downloading official dictionaries:");
  for (const fileName of OFFICIAL_DICT_FILES) {
    try {
      const content = await downloadFile(fileName);

      // Save raw file to data/official/
      const rawPath = path.join(officialDir, `${fileName}.txt`);
      fs.writeFileSync(rawPath, content, "utf-8");

      // Parse entries
      const entries = parseToEntries(content);
      allEntries[fileName] = entries;

      // Save optimized format to src/dict/
      const optimized = entriesToOptimized(entries);
      const dictPath = path.join(dictDir, `${fileName}.ts`);
      fs.writeFileSync(dictPath, `export default "${optimized}";\n`, "utf-8");

      console.log(`    ✓ ${fileName} (${entries.length} entries)`);
    } catch (error) {
      console.error(`    ✗ ${fileName}: ${error}`);
    }
  }

  // Generate reverse dictionaries
  console.log("\n2. Generating reverse dictionaries:");
  for (const [revName, srcName] of Object.entries(REVERSE_DICT_MAPPINGS)) {
    const srcEntries = allEntries[srcName];
    if (!srcEntries) {
      console.log(`    ⚠ ${revName}: Source ${srcName} not found`);
      continue;
    }

    let entries: [string, string][];

    if (revName === "TWPhrasesRev") {
      // Combine multiple sources for TWPhrasesRev
      const sources = ["TWPhrasesIT", "TWPhrasesName", "TWPhrasesOther"];
      entries = [];
      for (const src of sources) {
        if (allEntries[src]) {
          entries.push(...reverseEntries(allEntries[src]));
        }
      }
    } else {
      entries = reverseEntries(srcEntries);
    }

    // Save reverse dict
    const optimized = entriesToOptimized(entries);
    const dictPath = path.join(dictDir, `${revName}.ts`);
    fs.writeFileSync(dictPath, `export default "${optimized}";\n`, "utf-8");

    console.log(`    ✓ ${revName} (${entries.length} entries, from ${srcName})`);
  }

  // Generate dict index file
  const allDictNames = [...OFFICIAL_DICT_FILES, ...Object.keys(REVERSE_DICT_MAPPINGS)];
  const indexContent = allDictNames.map((name) => `export { default as ${name} } from './${name}.js';`).join("\n");
  fs.writeFileSync(path.join(dictDir, "index.ts"), indexContent + "\n", "utf-8");

  console.log("\n✓ Sync complete!");
  console.log(`  Raw files: data/official/ (${OFFICIAL_DICT_FILES.length} files)`);
  console.log(`  Dict modules: src/dict/ (${allDictNames.length} files)`);
}

main().catch(console.error);
