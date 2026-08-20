/**
 * Full bundle - includes all locales and converters
 */

import { Trie, ConverterFactory, ConverterFactoryWithSegmentation, CustomConverter, ProtectedConverter, parseOpenCCDict, reverseDictString, DictLike, normalizeCompatibilityIdeographs } from "../core.js";
import { HTMLConverter, HTMLConverterOptions } from "../html-converter.js";
import { variants2standard, standard2variants, phraseDictDirection, segmentationDictsFor, LocaleCode } from "../presets.js";

// Import all preset dictionaries eagerly — UMD bundles are single-file by
// design, so they bypass the lazy dictLoaders map in dict/index.js.
import STCharacters from "../dict/STCharacters.js";
import STPhrases from "../dict/STPhrases.js";
import STPhrases_GeneratedFromRegionalPhrases from "../dict/STPhrases_GeneratedFromRegionalPhrases.js";
import TSCharacters from "../dict/TSCharacters.js";
import TSPhrases from "../dict/TSPhrases.js";
import HKVariants from "../dict/HKVariants.js";
import HKVariantsPhrases from "../dict/HKVariantsPhrases.js";
import HKVariantsRev from "../dict/HKVariantsRev.js";
import HKVariantsRevPhrases from "../dict/HKVariantsRevPhrases.js";
import HKPhrases from "../dict/HKPhrases.js";
import HKPhrasesRev from "../dict/HKPhrasesRev.js";
import TWVariants from "../dict/TWVariants.js";
import TWVariantsPhrases from "../dict/TWVariantsPhrases.js";
import TWVariantsRev from "../dict/TWVariantsRev.js";
import TWVariantsRevPhrases from "../dict/TWVariantsRevPhrases.js";
import TWPhrases from "../dict/TWPhrases.js";
import TWPhrasesRev from "../dict/TWPhrasesRev.js";
import JPShinjitaiCharacters from "../dict/JPShinjitaiCharacters.js";
import JPShinjitaiCharactersRev from "../dict/JPShinjitaiCharactersRev.js";
import JPShinjitaiPhrases from "../dict/JPShinjitaiPhrases.js";
import CNTWPhrases from "../dict/CNTWPhrases.js";

const dict: Record<string, string> = {
  STCharacters,
  STPhrases,
  STPhrases_GeneratedFromRegionalPhrases,
  TSCharacters,
  TSPhrases,
  HKVariants,
  HKVariantsPhrases,
  HKVariantsRev,
  HKVariantsRevPhrases,
  HKPhrases,
  HKPhrasesRev,
  TWVariants,
  TWVariantsPhrases,
  TWVariantsRev,
  TWVariantsRevPhrases,
  TWPhrases,
  TWPhrasesRev,
  JPShinjitaiCharacters,
  JPShinjitaiCharactersRev,
  JPShinjitaiPhrases,
};

// Invariant: `dict` carries every name in allDictFiles, so the lookups below
// index it directly. Do not add a `.filter(Boolean)` here — dropping an unknown
// name silently returns partially-converted text. Both sides are static, so the
// guard is the test "full bundle carries every preset dict", not shipped bytes.

type DictGroup = DictLike[];

interface ConverterOptions {
  from: LocaleCode;
  to: LocaleCode;
  /**
   * Whether to consider the custom CNTWPhrases dict (default: on when either
   * end is `twp`). `true` enables it only in the directions
   * `phraseDictDirection` supports; `false` disables it everywhere.
   */
  loadCustomPhrases?: boolean;
}

/**
 * Create a converter with the specified locales.
 *
 * @param options - Conversion options (from/to locale)
 * @param protectedDict - Optional hard-override dictionary. Matches are masked
 *   with PUA placeholders before built-in conversion, then restored — OpenCC
 *   dictionaries never see or modify them. Highest priority.
 *
 *   UMD bundles do NOT auto-load `data/custom/ProtectedDict.txt` (no fs in
 *   browsers). Pass the dict explicitly; use `parseOpenCCDict` to parse
 *   OpenCC-format text fetched at runtime.
 */
function Converter(options: ConverterOptions, protectedDict?: DictLike): (input: string) => string {
  // Reject unknown locales loudly rather than silently skipping a step and
  // returning partially-converted text (JS callers bypass the TS type check).
  // Array.isArray, not truthiness: `variants2standard["constructor"]` is a
  // truthy prototype member that would fall through to an opaque TypeError.
  if (options.from !== "t" && !Array.isArray(variants2standard[options.from])) {
    throw new Error(`Unknown 'from' locale: ${options.from}`);
  }
  if (options.to !== "t" && !Array.isArray(standard2variants[options.to])) {
    throw new Error(`Unknown 'to' locale: ${options.to}`);
  }

  const dictGroups: DictGroup[] = [];

  // From variant to standard
  if (options.from !== "t") {
    dictGroups.push(variants2standard[options.from].map((name) => dict[name]));
  }

  // From standard to variant
  if (options.to !== "t") {
    dictGroups.push(standard2variants[options.to].map((name) => dict[name]));
  }

  // Cut the input before converting: without it the second step's regional
  // vocabulary table matches across word boundaries the first step set, and
  // 他优化了 comes out 他最佳化了 where OpenCC gives 他優化了. Only the
  // cn <-> tw/hk directions segment; segmentationDictsFor decides which dict.
  const segmentationFiles = segmentationDictsFor(options.from, options.to);
  const segmentation = segmentationFiles.length ? segmentationFiles.map((name) => dict[name]) : null;

  let convert = ConverterFactoryWithSegmentation(segmentation, ...dictGroups);

  // CNTWPhrases as a masking override, not a first trie group — the group
  // shape let segmentation cut its keys (人脸识别 → [人脸][识别], entry dead)
  // and let later steps re-chew its output (调制解调器 → 數據機 → 資料機 via
  // TWPhrases 數據→資料). Masking hides the span from the whole inner pipeline
  // and restores the TARGET VALUE at the end; the user's protectedDict still
  // wraps outermost, keeping its priority above this layer. Direction and
  // default come from the shared rule (presets.phraseDictDirection);
  // "reverse" flips the dict for Taiwanese→cn conversions.
  const phraseDir = phraseDictDirection(options.from, options.to, options.loadCustomPhrases);
  if (phraseDir) {
    convert = ProtectedConverter(phraseDir === "reverse" ? reverseDictString(CNTWPhrases) : CNTWPhrases, convert);
  }

  if (protectedDict) {
    convert = ProtectedConverter(protectedDict, convert);
  }
  return convert;
}

// Locale data for ConverterBuilder compatibility
const Locale = {
  from: Object.fromEntries(Object.entries(variants2standard).map(([locale, files]) => [locale, files.map((name) => dict[name])])),
  to: Object.fromEntries(Object.entries(standard2variants).map(([locale, files]) => [locale, files.map((name) => dict[name])])),
};

// // 带切段的工厂也导出：只给不带切段的那个，自己拼链的人会静默丢掉地区词边界处理
export {
  Converter,
  CustomConverter,
  ConverterFactory,
  ConverterFactoryWithSegmentation,
  ProtectedConverter,
  normalizeCompatibilityIdeographs,
  parseOpenCCDict,
  HTMLConverter,
  Locale, Trie,
};

export type { ConverterOptions, HTMLConverterOptions, LocaleCode, DictLike, DictGroup };
