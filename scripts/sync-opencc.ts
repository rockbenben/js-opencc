/**
 * Sync dictionaries from OpenCC official repository
 *
 * Usage: npx tsx scripts/sync-opencc.ts
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { fileURLToPath } from "url";
import { variants2standard, standard2variants, segmentationDictsFor, type LocaleCode } from "../src/presets.js";
import { Trie } from "../src/core.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

// OpenCC dictionary source
const OPENCC_BASE_URL = "https://raw.githubusercontent.com/BYVoid/OpenCC/master/data/dictionary";
const OPENCC_CONFIG_URL = "https://raw.githubusercontent.com/BYVoid/OpenCC/master/data/config";
const OPENCC_TESTCASES_URL = "https://raw.githubusercontent.com/BYVoid/OpenCC/master/test/testcases/testcases.json";

// Dictionary files available in OpenCC official repo (based on API check)
const OFFICIAL_DICT_FILES = [
  "HKPhrases",
  "HKPhrasesRev",
  "HKVariants",
  "HKVariantsPhrases",
  "HKVariantsRevPhrases",
  "JPShinjitaiCharacters",
  "JPShinjitaiPhrases",
  "STCharacters",
  "STPhrases",
  "TSCharacters",
  "TSPhrases",
  "TWPhrases",
  "TWPhrasesRev",
  "TWVariants",
  "TWVariantsPhrases",
  "TWVariantsRevPhrases",
];

/**
 * Upstream files we knowingly do NOT ship. Every upstream .txt must be in either
 * this list or OFFICIAL_DICT_FILES — anything else aborts the sync so a human
 * decides. `CJK_Compatibility_Ideographs` normalizes Unicode compatibility
 * ideographs and is not part of any OpenCC conversion_chain.
 */
const IGNORED_DICT_FILES = ["CJK_Compatibility_Ideographs"];

/**
 * Which OpenCC config each preset entry mirrors, so a drifting conversion chain
 * fails the sync instead of silently diverging.
 *
 * `step` indexes the config's `conversion_chain`: single-step configs (t2tw) use
 * 0; two-step ones (s2twp = cn→standard, then standard→twp) use 1 for the half
 * this preset owns. Missing here on purpose: the cn side (`STCharacters` /
 * `TSCharacters` groups), because OpenCC's s2t/t2s chains include dicts it
 * generates at build time (see UNAVAILABLE_UPSTREAM_DICTS) which we cannot
 * mirror from data/dictionary at all.
 */
const CONFIG_CHAINS: Array<{ config: string; side: "from" | "to"; locale: string; step: number }> = [
  { config: "s2t", side: "from", locale: "cn", step: 0 },
  { config: "t2tw", side: "to", locale: "tw", step: 0 },
  { config: "t2hk", side: "to", locale: "hk", step: 0 },
  { config: "s2twp", side: "to", locale: "twp", step: 1 },
  { config: "s2hkp", side: "to", locale: "hkp", step: 1 },
  { config: "t2jp", side: "to", locale: "jp", step: 0 },
  { config: "tw2t", side: "from", locale: "tw", step: 0 },
  { config: "hk2t", side: "from", locale: "hk", step: 0 },
  { config: "tw2sp", side: "from", locale: "twp", step: 0 },
  { config: "hk2sp", side: "from", locale: "hkp", step: 0 },
  { config: "jp2t", side: "from", locale: "jp", step: 0 },
];

/**
 * Which OpenCC configs declare a `segmentation`, and what our
 * `segmentationDictsFor` must return for the equivalent locale pair.
 *
 * The conversion-chain check above cannot see this field, so without a
 * separate comparison an upstream change to WHICH dictionary a config cuts on
 * would land silently — and cutting on the wrong-script dictionary produces
 * subtly wrong regional vocabulary, the failure mode that is invisible in
 * word-list tests. Upstream declares segmentation on exactly these eight.
 */
const CONFIG_SEGMENTATION: Array<{ config: string; from: LocaleCode; to: LocaleCode }> = [
  { config: "s2tw", from: "cn", to: "tw" },
  { config: "s2twp", from: "cn", to: "twp" },
  { config: "s2hk", from: "cn", to: "hk" },
  { config: "s2hkp", from: "cn", to: "hkp" },
  { config: "tw2s", from: "tw", to: "cn" },
  { config: "tw2sp", from: "twp", to: "cn" },
  { config: "hk2s", from: "hk", to: "cn" },
  { config: "hk2sp", from: "hkp", to: "cn" },
];

/** Configs that must NOT declare a segmentation — a new one appearing is drift too. */
const CONFIG_NO_SEGMENTATION = ["s2t", "t2s", "t2tw", "tw2t", "t2hk", "hk2t", "t2jp", "jp2t"];

/**
 * Dicts referenced by OpenCC configs that do NOT exist in data/dictionary and
 * that we cannot reproduce. Excluded from the chain comparison.
 *
 * `STPhrases_GeneratedFromRegionalPhrases` used to sit here — it IS
 * build-time-generated upstream, but its recipe turned out to be fully
 * reproducible (see generateRegionalStPhrases below), so we generate it too
 * and the chain check now covers it. `TSCharactersExt` stays: it is the
 * tofu-risk extraction, which depends on font-coverage data we don't ship.
 */
const UNAVAILABLE_UPSTREAM_DICTS = ["TSCharactersExt"];

// Reverse dictionaries to generate (not available in OpenCC, need to create from forward dicts)
const REVERSE_DICT_MAPPINGS: Record<string, string> = {
  HKVariantsRev: "HKVariants",
  TWVariantsRev: "TWVariants",
  // Upstream OpenCC #1302 (2026-06-11) removed JPVariants.txt, folding its
  // character data into JPShinjitaiCharacters.txt; t2jp is now generated by
  // reversing JPShinjitaiCharacters (see src/presets.ts jp mappings).
  JPShinjitaiCharactersRev: "JPShinjitaiCharacters",
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

/**
 * Compare each preset chain against the OpenCC config it mirrors and throw on
 * drift. File-level discovery cannot see this: upstream adding an EXISTING dict
 * to a chain, or reordering one, leaves the file list untouched while our
 * conversion output silently diverges (that is how TWVariantsPhrases sat unused
 * for three months while `張棟樑` was being mangled into `張棟梁`).
 *
 * Returns false if upstream configs could not be fetched, so a network blip
 * skips the check rather than failing the sync.
 */
async function verifyChainsAgainstUpstream(): Promise<boolean> {
  const collectDicts = (node: unknown, acc: string[] = []): string[] => {
    if (!node || typeof node !== "object") return acc;
    if (Array.isArray(node)) {
      node.forEach((n) => collectDicts(n, acc));
      return acc;
    }
    const n = node as { file?: string; dict?: unknown; dicts?: unknown };
    if (n.file) acc.push(n.file.replace(/\.(txt|ocd2)$/, ""));
    if (n.dicts) collectDicts(n.dicts, acc);
    if (n.dict) collectDicts(n.dict, acc);
    return acc;
  };

  const drift: string[] = [];
  for (const { config, side, locale, step } of CONFIG_CHAINS) {
    let chain: unknown;
    try {
      const res = await fetch(`${OPENCC_CONFIG_URL}/${config}.json`);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      chain = ((await res.json()) as { conversion_chain?: Array<{ dict?: unknown }> }).conversion_chain?.[step]?.dict;
    } catch (e) {
      console.warn(`  Chain check skipped: could not fetch ${config}.json (${(e as Error).message})`);
      return false;
    }
    const upstream = collectDicts(chain).filter((d) => !UNAVAILABLE_UPSTREAM_DICTS.includes(d));
    // presets list highest-priority LAST (trie is last-write-wins) while OpenCC
    // lists it FIRST (first match wins) — compare against the reversed preset.
    const ours = [...((side === "to" ? standard2variants : variants2standard)[locale] ?? [])].reverse();
    if (JSON.stringify(ours) !== JSON.stringify(upstream)) {
      drift.push(`  ${config}: upstream [${upstream.join(" + ")}]  vs  presets.${side === "to" ? "standard2variants" : "variants2standard"}.${locale} [${ours.join(" + ")}]`);
    }
  }

  if (drift.length > 0) {
    throw new Error(
      `OpenCC conversion chains changed upstream — update src/presets.ts (remember: presets list the ` +
        `highest-priority dict LAST, the reverse of OpenCC's order):\n${drift.join("\n")}`
    );
  }
  console.log(`✓ All ${CONFIG_CHAINS.length} conversion chains match upstream config.`);
  return true;
}

/**
 * Compare each config's `segmentation` field against `segmentationDictsFor`.
 *
 * Two directions of drift both abort:
 *   - a config we segment stops declaring one (or changes its dict), and
 *   - a config we do NOT segment starts declaring one.
 *
 * The second is the easy one to miss: nothing would fail, we would simply
 * skip a cut upstream now performs, and regional vocabulary would start
 * over-applying in context exactly as it did before segmentation existed.
 */
async function verifySegmentationAgainstUpstream(): Promise<boolean> {
  const collect = (node: unknown, acc: string[] = []): string[] => {
    if (!node || typeof node !== "object") return acc;
    if (Array.isArray(node)) {
      node.forEach((n) => collect(n, acc));
      return acc;
    }
    const n = node as { file?: string; dict?: unknown; dicts?: unknown };
    if (n.file) acc.push(n.file.replace(/\.(txt|ocd2)$/, ""));
    if (n.dicts) collect(n.dicts, acc);
    if (n.dict) collect(n.dict, acc);
    return acc;
  };

  const fetchConfig = async (config: string): Promise<{ segmentation?: { dict?: unknown } } | null> => {
    try {
      const res = await fetch(`${OPENCC_CONFIG_URL}/${config}.json`);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return (await res.json()) as { segmentation?: { dict?: unknown } };
    } catch (e) {
      console.warn(`  Segmentation check skipped: could not fetch ${config}.json (${(e as Error).message})`);
      return null;
    }
  };

  const drift: string[] = [];

  for (const { config, from, to } of CONFIG_SEGMENTATION) {
    const cfg = await fetchConfig(config);
    if (!cfg) return false;
    const upstream = cfg.segmentation ? collect(cfg.segmentation.dict).sort() : [];
    const ours = [...segmentationDictsFor(from, to)].sort();
    if (JSON.stringify(ours) !== JSON.stringify(upstream)) {
      drift.push(`  ${config}: upstream segments on [${upstream.join(" + ") || "(none)"}]  vs  segmentationDictsFor("${from}","${to}") = [${ours.join(" + ") || "(none)"}]`);
    }
  }

  for (const config of CONFIG_NO_SEGMENTATION) {
    const cfg = await fetchConfig(config);
    if (!cfg) return false;
    if (cfg.segmentation) {
      drift.push(`  ${config}: upstream ADDED a segmentation [${collect(cfg.segmentation.dict).join(" + ")}] — we skip the cut for this pair`);
    }
  }

  if (drift.length > 0) {
    throw new Error(`OpenCC segmentation config changed upstream — update segmentationDictsFor in src/presets.ts:\n${drift.join("\n")}`);
  }
  console.log(`✓ All ${CONFIG_SEGMENTATION.length + CONFIG_NO_SEGMENTATION.length} segmentation declarations match upstream config.`);
  return true;
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
    .map((rawLine) => {
      // Trim BEFORE the comment test: the no-tab fallback below matches on a
      // trimmed line, so an indented `  # 交通` would otherwise parse as the
      // entry `# → 交通` and rewrite every `#` in converted text.
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) return null;

      // Tab is the normal separator, but some entries (and hand-edited custom
      // ones) use spaces — accept a whitespace run too, matching the runtime
      // parser in core.ts. Splitting on the FIRST run keeps multi-token values.
      const tabIdx = line.indexOf("\t");
      // A second tab ends the value field in both dict flavours — everything
      // after it is a trailing comment/column, never part of the value.
      const m = tabIdx >= 0 ? [line.slice(0, tabIdx), line.slice(tabIdx + 1).split("\t")[0]] : line.match(/^(\S+)\s+(.+)$/)?.slice(1);
      if (!m) return null;
      const [key, values] = m;
      if (!key || !values) return null;

      // Official dicts list space-separated candidates and the first wins;
      // a custom entry is ONE value that may contain spaces (二维码 → "QR Code").
      const value = isCustom ? values.trim() : values.trim().split(/\s+/)[0];
      return [key.trim(), value] as [string, string];
    })
    .filter((entry): entry is [string, string] => entry !== null && !!entry[0] && !!entry[1]);
}

function entriesToOptimized(entries: [string, string][]): string {
  // Packed format: entries joined by "|", key/value split on FIRST space
  // (Trie.loadDict string form). A "|" anywhere or a space in a KEY would
  // silently corrupt every entry after it — fail the sync loudly instead.
  // Values MAY contain spaces (custom dicts, e.g. 二维码 → "QR Code").
  for (const [k, v] of entries) {
    if (k.includes("|") || v.includes("|") || /\s/.test(k)) {
      throw new Error(`Dict entry breaks packed format (space in key or "|"): ${JSON.stringify([k, v])}`);
    }
  }
  return entries
    .filter(([k, v]) => k !== v || k.length > 1) // Remove identity mappings for single chars
    .map(([k, v]) => `${k} ${v}`)
    .join("|");
}

/**
 * 一个词典模块的源码。
 *
 * ⚠️ **类型必须显式写成 `string`。** 直接 `export default "…"` 的话 tsc 会把整本词典
 * 推断成一个字符串**字面量类型**——`STPhrases.d.ts` 因此长到 1.9 MB，全部 `.d.ts`
 * 合计 2.3 MB，比它们描述的运行时代码还大。那个类型对谁都没用（没人会去 narrow
 * 一本词典），却要让每一个消费者的 tsc 去解析它。
 *
 * 四处写词典的地方都走这里，别再各写各的——上一版就是四份重复的字面量拼接。
 */
const dictModuleSource = (optimized: string): string =>
  `const dict: string = ${JSON.stringify(optimized)};\nexport default dict;\n`;


function reverseEntries(entries: [string, string][]): [string, string][] {
  // Reverse mapping: value -> key. When several keys collapse onto one value
  // (HKVariants has both 才→才 and 纔→才), the IDENTITY pair must win: the
  // trie is last-wins, so keeping all entries shipped 才→纔, 煙→菸, 核→覈,
  // 梁→樑 — and entriesToOptimized then dropped the correct single-char
  // identity pair, leaving only the wrong mapping. Char-level reversal falls
  // back to identity; the *RevPhrases dicts disambiguate in context (上梁→上樑).
  // Non-identity collisions (none upstream today) keep the first entry.
  //
  // Status audited after the multi-value expansion: on CURRENT upstream data
  // the identity clause never fires — every collision group across
  // HKVariants / TWVariants / JPShinjitaiCharacters happens to list the
  // identity key first (it sorts lower by code point, e.g. 才 U+624D before
  // 纔 U+7E94), so first-wins already picks it. That ordering is a
  // coincidence of today's code points, not an upstream contract — a future
  // collision group whose identity key sorts AFTER a variant would ship the
  // wrong mapping without this clause. One `|| k === v` is cheap insurance;
  // do not delete it for being "never hit". The end behavior is pinned by
  // the 人才→人才 test either way, and the official OpenCC testcases now
  // guard all reverse-generated chains (t2jp/jp2t/tw2t/hk2t) wholesale.
  const reversed = new Map<string, string>();
  for (const [k, v] of entries) {
    if (!reversed.has(v) || k === v) {
      reversed.set(v, k);
    }
  }
  return [...reversed.entries()];
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
    const known = new Set([...OFFICIAL_DICT_FILES, ...IGNORED_DICT_FILES]);
    const upstream = new Set(upstreamFiles);
    const added = upstreamFiles.filter((f) => !known.has(f));
    const removed = OFFICIAL_DICT_FILES.filter((f) => !upstream.has(f));
    // Abort rather than warn: a warning on an otherwise-green run is invisible.
    // TWVariantsPhrases was announced this way for three months while every
    // affected conversion shipped wrong. Adopting a dict changes conversion
    // output, so it needs a human — the sync just has to stop and say so.
    if (added.length > 0 || removed.length > 0) {
      const lines: string[] = [];
      if (added.length > 0) {
        lines.push(`Upstream has dict file(s) we neither ship nor ignore: ${added.join(", ")}`);
        lines.push(`  → add each to OFFICIAL_DICT_FILES (and wire into src/presets.ts) or to IGNORED_DICT_FILES with a reason.`);
      }
      if (removed.length > 0) {
        lines.push(`OFFICIAL_DICT_FILES references file(s) no longer upstream: ${removed.join(", ")}`);
        lines.push(`  → remove them from OFFICIAL_DICT_FILES and from any src/presets.ts chain.`);
      }
      throw new Error(lines.join("\n"));
    }
    console.log("✓ OFFICIAL_DICT_FILES is in sync with upstream.");
  } else {
    console.log("Skipping file-list comparison (no API response).");
  }

  // Chain composition is the signal file discovery cannot see.
  console.log("Verifying conversion chains against upstream config...");
  await verifyChainsAgainstUpstream();
  console.log("Verifying segmentation declarations against upstream config...");
  await verifySegmentationAgainstUpstream();
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

    // Save optimized format to src/dict/. Use JSON.stringify (not manual
    // quotes) so any `"`, `\`, or control char in upstream data is escaped —
    // otherwise a single such char would emit a broken .ts file and fail the
    // build (and silently halt the automated biweekly publish).
    const optimized = entriesToOptimized(entries);
    const dictPath = path.join(dictDir, `${fileName}.ts`);
    fs.writeFileSync(dictPath, dictModuleSource(optimized), "utf-8");

    console.log(`    ✓ ${fileName} (${entries.length} entries)`);
  }

  // Generate reverse dictionaries
  console.log("\n2. Generating reverse dictionaries:");
  for (const [revName, srcName] of Object.entries(REVERSE_DICT_MAPPINGS)) {
    const srcRaw = officialContents[srcName];
    if (!srcRaw) {
      console.log(`    ⚠ ${revName}: Source ${srcName} not found`);
      continue;
    }

    // Reverse dicts must be built from ALL candidate values, not just the
    // first one that `parseToEntries` keeps for forward conversion —
    // JPShinjitaiCharacters has `弁→辨 辯 瓣`, and truncating to 辨→弁 loses
    // 辯→弁 and 瓣→弁, so t2jp turned 辯護士 into 辯護士 instead of 弁護士
    // (caught by official testcase case_040). OpenCC's own reverse.py emits
    // value→key for every value; this mirrors it. The identity-outranks-
    // first-wins collision policy in `reverseEntries` applies unchanged.
    const expanded: [string, string][] = [];
    for (const line of srcRaw.split("\n")) {
      const l = line.trim();
      if (!l || l.startsWith("#")) continue;
      const tab = l.indexOf("\t");
      if (tab < 0) continue;
      const key = l.slice(0, tab);
      for (const v of l.slice(tab + 1).trim().split(" ").filter(Boolean)) {
        expanded.push([key, v]);
      }
    }
    const entries = reverseEntries(expanded);

    // Save reverse dict (JSON.stringify escapes any special chars — see above).
    const optimized = entriesToOptimized(entries);
    const dictPath = path.join(dictDir, `${revName}.ts`);
    fs.writeFileSync(dictPath, dictModuleSource(optimized), "utf-8");

    console.log(`    ✓ ${revName} (${entries.length} entries, from ${srcName})`);
  }

  // Generate STPhrases_GeneratedFromRegionalPhrases — the second segmentation
  // dict of every s2* config, and a member of their first conversion group.
  //
  // This is OpenCC's own recipe, read from
  // data/scripts/generate_st_phrases_from_regional_phrases.py (do not guess at
  // it — a wrong filter over-applies regional vocabulary, the exact failure
  // segmentation exists to prevent):
  //
  //   1. take the KEYS of HKPhrases then TWPhrases (that input order);
  //   2. convert each key to Simplified via the t2s chain;
  //   3. DROP results shorter than 3 code points — upstream's comment: short
  //      regional keys would split longer Simplified words before STPhrases
  //      gets a chance to match them (优化/函数/内存 are all 2 chars: excluded);
  //   4. two different keys projecting to the same Simplified form is a hard
  //      error, matching upstream's build failure;
  //   5. entry = simplified projection → ORIGINAL traditional key. The value
  //      matters: converting 出租车 char-wise could pick wrong variants for
  //      ambiguous characters, the pinned key cannot.
  //
  // Upstream converts with tofu-risk dicts included (TSCharactersExt), which
  // we don't have — verified irrelevant here: against the opencc-data copy this
  // reproduces all 508 entries exactly, none missing, none extra, none
  // differing (regional phrase keys contain no tofu-risk-only characters).
  console.log("\n2.5 Generating STPhrases_GeneratedFromRegionalPhrases:");
  const GENERATED_REGIONAL_ST = "STPhrases_GeneratedFromRegionalPhrases";
  {
    const t2sTrie = new Trie();
    // Single merged trie; single-char TSCharacters cannot collide with
    // multi-char TSPhrases keys, so load order between them is immaterial.
    for (const src of ["TSCharacters", "TSPhrases"]) {
      const entries = allEntries[src];
      if (!entries) throw new Error(`${GENERATED_REGIONAL_ST}: source dict ${src} missing`);
      for (const [k, v] of entries) t2sTrie.addWord(k, v);
    }

    const projections = new Map<string, string[]>();
    for (const src of ["HKPhrases", "TWPhrases"]) {
      const entries = allEntries[src];
      if (!entries) throw new Error(`${GENERATED_REGIONAL_ST}: source dict ${src} missing`);
      for (const [key] of entries) {
        const simplified = t2sTrie.convert(key);
        if ([...simplified].length < 3) continue; // upstream's length filter
        const bucket = projections.get(simplified) ?? [];
        bucket.push(key);
        projections.set(simplified, bucket);
      }
    }

    const conflicts = [...projections].filter(([, keys]) => new Set(keys).size > 1);
    if (conflicts.length > 0) {
      // Loud failure, same as upstream: silently picking one would ship an
      // arbitrary regional term for that word.
      throw new Error(
        `${GENERATED_REGIONAL_ST}: conflicting simplified projections:\n` +
          conflicts.map(([k, keys]) => `  ${k}: ${keys.join(" ")}`).join("\n")
      );
    }

    const generated: [string, string][] = [...projections]
      .map(([k, keys]) => [k, keys[0]] as [string, string])
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)); // upstream sorts by key

    allEntries[GENERATED_REGIONAL_ST] = generated;
    const optimized = entriesToOptimized(generated);
    fs.writeFileSync(
      path.join(dictDir, `${GENERATED_REGIONAL_ST}.ts`),
      dictModuleSource(optimized),
      "utf-8"
    );
    console.log(`    \u2713 ${GENERATED_REGIONAL_ST} (${generated.length} entries, from HKPhrases + TWPhrases keys via t2s)`);
  }

  // Generate dict index file
  const allDictNames = [...OFFICIAL_DICT_FILES, ...Object.keys(REVERSE_DICT_MAPPINGS), GENERATED_REGIONAL_ST];

  // Process Custom Dictionaries
  console.log("\n3. Processing custom dictionaries:");
  const customDataDir = path.join(ROOT_DIR, "data", "custom");
  const customDataFiles = ["CNTWPhrases"];

  // Failures here abort the sync, same as official dicts. Custom dicts used to
  // warn-and-continue, but the UMD bundles now import src/dict/CNTWPhrases.js
  // statically: a skipped file leaves the bundles on stale data (or fails tsc)
  // while the main entry silently ships without the phrase dict — the npm/UMD
  // divergence this release exists to remove, hidden behind a "✓ Sync complete!".
  for (const name of customDataFiles) {
    const p = path.join(customDataDir, `${name}.txt`);
    if (!fs.existsSync(p)) {
      throw new Error(`Custom dict ${name}.txt missing from data/custom/ — the bundles import it directly.`);
    }
    const content = fs.readFileSync(p, "utf-8");
    // isCustom: keep the WHOLE value ("QR Code"), don't truncate to the
    // first space-separated token like official multi-candidate dicts.
    const entries = parseToEntries(content, true);
    const optimized = entriesToOptimized(entries);
    const dictPath = path.join(dictDir, `${name}.ts`);
    fs.writeFileSync(dictPath, dictModuleSource(optimized), "utf-8");
    allDictNames.push(name);
    console.log(`    ✓ ${name} (${entries.length} entries)`);
  }

  // Lazy loader map — one dynamic import per dict file so bundlers code-split
  // each dictionary into its own chunk and consumers fetch only what a
  // conversion direction needs (STPhrases alone is ~1MB; t→cn needs ~40KB).
  // Eager consumers (UMD bundles) import the dict files directly instead.
  const indexContent =
    "export const dictLoaders: Record<string, () => Promise<{ default: string }>> = {\n" +
    allDictNames.map((name) => `  ${name}: () => import('./${name}.js'),`).join("\n") +
    "\n};\n";
  fs.writeFileSync(path.join(dictDir, "index.ts"), indexContent, "utf-8");

  // Refresh OpenCC's official testcases — the ground truth our parity test
  // runs against. Committed under test/fixtures/ (data/official/ is
  // gitignored) so a fresh clone can run tests offline; refreshed here so the
  // fixture and the dictionaries always come from the same upstream snapshot —
  // testing master dicts against release-vintage cases (or vice versa) turns
  // real drift into noise and real bugs into "known divergence".
  console.log("\n4. Refreshing OpenCC official testcases fixture:");
  {
    const res = await fetch(OPENCC_TESTCASES_URL);
    if (!res.ok) throw new Error(`testcases.json download failed: ${res.status} ${res.statusText}`);
    const text = await res.text();
    fs.writeFileSync(path.join(ROOT_DIR, "test", "fixtures", "opencc-testcases.json"), text, "utf-8");
    console.log("    ✓ test/fixtures/opencc-testcases.json");
  }

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
