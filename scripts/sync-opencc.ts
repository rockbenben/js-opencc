/**
 * Sync dictionaries from OpenCC official repository
 *
 * Usage: npx tsx scripts/sync-opencc.ts
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
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
  "TWPhrases",
  "TWPhrasesRev",
  "TWVariants",
  "TWVariantsRevPhrases",
];

// Reverse dictionaries to generate (not available in OpenCC, need to create from forward dicts)
const REVERSE_DICT_MAPPINGS: Record<string, string> = {
  HKVariantsRev: "HKVariants",
  TWVariantsRev: "TWVariants",
  JPVariantsRev: "JPVariants",
};

/**
 * Discover the current list of .txt dictionary files in OpenCC's master branch
 * via the GitHub API. Used to detect upstream additions/removals that our
 * hardcoded OFFICIAL_DICT_FILES list might miss.
 */
async function listUpstreamDictFiles(): Promise<string[] | null> {
  const apiUrl = "https://api.github.com/repos/BYVoid/OpenCC/contents/data/dictionary?ref=master";
  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      console.warn(`  GitHub API discovery skipped: ${response.status} ${response.statusText}`);
      return null;
    }
    const data = await response.json() as Array<{ name: string; type: string }>;
    return data
      .filter((entry) => entry.type === "file" && entry.name.endsWith(".txt"))
      .map((entry) => entry.name.replace(/\.txt$/, ""));
  } catch (e) {
    console.warn(`  GitHub API discovery skipped: ${(e as Error).message}`);
    return null;
  }
}

async function downloadFile(fileName: string): Promise<string> {
  const url = `${OPENCC_BASE_URL}/${fileName}.txt`;
  console.log(`  Downloading ${fileName}...`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${fileName}: ${response.status}`);
  }

  const content = await response.text();

  // Sanity check: reject HTML error pages or other unexpected content.
  // Real dict files are UTF-8 text starting with a CJK character or comment ('#').
  const trimmedStart = content.trimStart();
  if (trimmedStart.startsWith("<") || trimmedStart.startsWith("{") || trimmedStart.startsWith("[")) {
    throw new Error(
      `Downloaded ${fileName} appears to be ${trimmedStart.startsWith("<") ? "HTML" : "JSON"}, not a dict file. ` +
      `First 80 chars: ${trimmedStart.slice(0, 80)}`
    );
  }

  return content;
}

function parseToEntries(content: string, isCustom: boolean = false): [string, string][] {
  return content
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      // Skip comments
      if (line.startsWith("#") || !line.trim()) return null;

      const [key, values] = line.split("\t");
      if (!key || !values) return null;

      let value = values;
      if (!isCustom) {
        // For official dicts, take first candidate (space separated)
        value = values.split(" ")[0];
      } else {
        // For custom dicts, take the whole string (trim whitespace)
        value = values.trim();
      }
      return [key.trim(), value] as [string, string];
    })
    .filter((entry): entry is [string, string] => entry !== null && !!entry[0] && !!entry[1]);
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

  console.log("Discovering upstream dict files via GitHub API...");
  const upstreamFiles = await listUpstreamDictFiles();
  if (upstreamFiles) {
    const known = new Set(OFFICIAL_DICT_FILES);
    const upstream = new Set(upstreamFiles);
    const added = upstreamFiles.filter((f) => !known.has(f));
    const removed = OFFICIAL_DICT_FILES.filter((f) => !upstream.has(f));
    if (added.length > 0) {
      console.warn(`⚠️  Upstream has new dict file(s) not in OFFICIAL_DICT_FILES: ${added.join(", ")}`);
      console.warn(`   If these are needed, add to OFFICIAL_DICT_FILES in scripts/sync-opencc.ts.`);
    }
    if (removed.length > 0) {
      console.warn(`⚠️  OFFICIAL_DICT_FILES references file(s) not present upstream: ${removed.join(", ")}`);
      console.warn(`   These will 404 during download. Update OFFICIAL_DICT_FILES.`);
    }
    if (added.length === 0 && removed.length === 0) {
      console.log("✓ OFFICIAL_DICT_FILES is in sync with upstream.");
    }
  } else {
    console.log("Skipping file-list comparison (no API response).");
  }
  console.log("");

  const allEntries: Record<string, [string, string][]> = {};
  const officialContents: Record<string, string> = {};

  // Download official dictionaries. Failures abort the script — partial syncs
  // would produce an inconsistent manifest and a bad release.
  console.log("1. Downloading official dictionaries:");
  for (const fileName of OFFICIAL_DICT_FILES) {
    const content = await downloadFile(fileName);

    // Save raw file to data/official/
    const rawPath = path.join(officialDir, `${fileName}.txt`);
    fs.writeFileSync(rawPath, content, "utf-8");

    // Parse entries
    const entries = parseToEntries(content);

    // Sanity check: official dicts must have at least one entry.
    // Zero entries signals corruption or a format change.
    if (entries.length === 0) {
      throw new Error(
        `Parsed zero entries from ${fileName}. Source may be corrupted or format has changed.`
      );
    }

    allEntries[fileName] = entries;
    officialContents[fileName] = content;

    // Save optimized format to src/dict/
    const optimized = entriesToOptimized(entries);
    const dictPath = path.join(dictDir, `${fileName}.ts`);
    fs.writeFileSync(dictPath, `export default "${optimized}";\n`, "utf-8");

    console.log(`    ✓ ${fileName} (${entries.length} entries)`);
  }

  // Generate reverse dictionaries
  console.log("\n2. Generating reverse dictionaries:");
  for (const [revName, srcName] of Object.entries(REVERSE_DICT_MAPPINGS)) {
    const srcEntries = allEntries[srcName];
    if (!srcEntries) {
      console.log(`    ⚠ ${revName}: Source ${srcName} not found`);
      continue;
    }

    const entries = reverseEntries(srcEntries);

    // Save reverse dict
    const optimized = entriesToOptimized(entries);
    const dictPath = path.join(dictDir, `${revName}.ts`);
    fs.writeFileSync(dictPath, `export default "${optimized}";\n`, "utf-8");

    console.log(`    ✓ ${revName} (${entries.length} entries, from ${srcName})`);
  }

  // Generate dict index file
  const allDictNames = [...OFFICIAL_DICT_FILES, ...Object.keys(REVERSE_DICT_MAPPINGS)];

  // Process Custom Dictionaries
  console.log("\n3. Processing custom dictionaries:");
  const customDataDir = path.join(ROOT_DIR, "data", "custom");
  const customDataFiles = ["CNTWPhrases"];

  for (const name of customDataFiles) {
    try {
      const p = path.join(customDataDir, `${name}.txt`);
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, "utf-8");
        const entries = parseToEntries(content);
        const optimized = entriesToOptimized(entries);
        const dictPath = path.join(dictDir, `${name}.ts`);
        fs.writeFileSync(dictPath, `export default "${optimized}";\n`, "utf-8");
        allDictNames.push(name);
        console.log(`    ✓ ${name} (${entries.length} entries)`);
      } else {
        console.log(`    ⚠ ${name} not found in data/custom/`);
      }
    } catch (e) {
      console.error(`    ✗ ${name}: ${e}`);
    }
  }

  const indexContent = allDictNames.map((name) => `export { default as ${name} } from './${name}.js';`).join("\n");
  fs.writeFileSync(path.join(dictDir, "index.ts"), indexContent + "\n", "utf-8");

  // Write tracked manifest of upstream dict content hashes.
  // CI watches this file's git diff to decide whether to publish.
  // Hashing the raw upstream text (not generated .ts output) means changes in
  // our generation algorithm don't trigger spurious "upstream changed" releases.
  const sortedNames = Object.keys(officialContents).sort();
  const fileHashes: Record<string, string> = {};
  for (const name of sortedNames) {
    const h = crypto.createHash("sha256").update(officialContents[name], "utf8").digest("hex");
    fileHashes[name] = `sha256:${h}`;
  }
  const manifest = {
    _comment:
      "Auto-generated by `npm run sync:opencc`. Tracks upstream OpenCC dict content " +
      "hashes for CI change detection. CI publishes a new release iff this file changes. " +
      "Do not edit by hand.",
    upstream: "https://github.com/BYVoid/OpenCC/tree/master/data/dictionary",
    files: fileHashes,
  };
  const manifestPath = path.join(ROOT_DIR, ".opencc-sync.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");

  console.log("\n✓ Sync complete!");
  console.log(`  Raw files: data/official/ (${OFFICIAL_DICT_FILES.length} files)`);
  console.log(`  Dict modules: src/dict/ (${allDictNames.length} files)`);
  console.log(`  Manifest:    .opencc-sync.json`);
}

main().catch((err) => {
  console.error("sync:opencc failed:", err);
  process.exit(1);
});
