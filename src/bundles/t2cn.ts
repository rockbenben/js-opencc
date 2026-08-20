/**
 * t2cn bundle - Traditional Chinese to Simplified Chinese only
 * Smaller bundle size for one-way conversion
 */

import { Trie, ConverterFactory, ConverterFactoryWithSegmentation, CustomConverter, ProtectedConverter, parseOpenCCDict, reverseDictString, DictLike, normalizeCompatibilityIdeographs } from "../core.js";
import { HTMLConverter, HTMLConverterOptions } from "../html-converter.js";
import { variants2standard, phraseDictDirection, segmentationDictsFor } from "../presets.js";

// Import only the dictionaries needed for t/tw/twp/hk -> cn
import TSCharacters from "../dict/TSCharacters.js";
import TSPhrases from "../dict/TSPhrases.js";
import TWVariantsRev from "../dict/TWVariantsRev.js";
import TWVariantsRevPhrases from "../dict/TWVariantsRevPhrases.js";
import TWPhrasesRev from "../dict/TWPhrasesRev.js";
import HKVariantsRev from "../dict/HKVariantsRev.js";
import HKVariantsRevPhrases from "../dict/HKVariantsRevPhrases.js";
import HKPhrasesRev from "../dict/HKPhrasesRev.js";
import JPShinjitaiCharacters from "../dict/JPShinjitaiCharacters.js";
import JPShinjitaiPhrases from "../dict/JPShinjitaiPhrases.js";
import CNTWPhrases from "../dict/CNTWPhrases.js";

type DictGroup = DictLike[];

// Available source locales for t2cn
type SourceLocale = "t" | "tw" | "twp" | "hk" | "hkp" | "jp";

interface ConverterOptions {
  from: SourceLocale;
  to?: "cn";
  /** Whether to load the custom CNTWPhrases dict (default: on for `from: "twp"`) */
  loadCustomPhrases?: boolean;
}

const dictMap: Record<string, string> = {
  TSCharacters,
  TSPhrases,
  TWVariantsRev,
  TWVariantsRevPhrases,
  TWPhrasesRev,
  HKVariantsRev,
  HKVariantsRevPhrases,
  HKPhrasesRev,
  JPShinjitaiCharacters,
  JPShinjitaiPhrases,
};

/**
 * Create a converter from Traditional variants to Simplified Chinese.
 *
 * @param options - Conversion options (locale)
 * @param protectedDict - Optional hard-override dictionary. See cn2t bundle
 *   docs for semantics. UMD bundles do not auto-load ProtectedDict.txt;
 *   pass the dict explicitly (use `parseOpenCCDict` for OpenCC-format text).
 */
function Converter(options: ConverterOptions, protectedDict?: DictLike): (input: string) => string {
  // Only variant→cn dicts ship here; reject another target rather than ignore
  // it and hand back simplified text to a caller who asked for traditional.
  if (options.to !== undefined && options.to !== "cn") {
    throw new Error(`t2cn bundle only converts to 'cn', got '${options.to}' — use the full bundle for other directions`);
  }
  if ((options.from as string) === "cn") {
    throw new Error(`t2cn bundle cannot convert from 'cn' — use the cn2t bundle`);
  }

  const dictGroups: DictGroup[] = [];

  // From source variant to standard. Unknown locales and preset files missing
  // from dictMap throw loudly — silently skipping a step would return
  // partially-converted text (JS callers bypass the TS type check).
  if (options.from !== "t") {
    const dictFiles = variants2standard[options.from];
    // Array.isArray, not truthiness: `variants2standard["constructor"]` is a
    // truthy prototype member that would fall through to an opaque TypeError.
    if (!Array.isArray(dictFiles)) throw new Error(`Unknown 'from' locale: ${options.from}`);
    dictGroups.push(
      dictFiles.map((name) => {
        const d = dictMap[name];
        // typeof, not truthiness: a dict CAN legitimately optimize to "" (all
        // entries single-char identity pairs), and this also rejects prototype
        // members like "toString" that `in` would accept.
        if (typeof d !== "string") throw new Error(`Dictionary ${name} missing from t2cn bundle`);
        return d;
      })
    );
  }

  // From standard to cn (always needed)
  dictGroups.push([TSCharacters, TSPhrases]);

  // Cut the input before converting: without it the second step's regional
  // vocabulary table matches across word boundaries the first step set, and
  // 他优化了 comes out 他最佳化了 where OpenCC gives 他優化了. Only the
  // cn <-> tw/hk directions segment; segmentationDictsFor decides.
  const segmentation = segmentationDictsFor(options.from ?? "t", "cn").length ? [TSPhrases] : null;

  let convert = ConverterFactoryWithSegmentation(segmentation, ...dictGroups);

  // CNTWPhrases used to be unshifted as an ordinary FIRST trie group. That
  // shape had two failure modes, both found by probing every entry in context:
  //
  //   1. Its keys were not segmentation boundaries, so the cut could land
  //      inside one (人脸识别 → [人脸][识别]) and the entry never matched.
  //   2. Its OUTPUT was re-fed through the built-in steps, which re-converted
  //      pieces of it: 调制解调器 → 數據機 → TWPhrases hits 數據→資料 → 資料機.
  //      This one predates segmentation — it shipped wrong from the start.
  //
  // ProtectedConverter's masking already implements the semantics this dict
  // actually wants — match key, hide the span behind a PUA placeholder so the
  // whole inner pipeline (segmentation included) cannot see it, restore the
  // TARGET VALUE afterwards. Vocabulary override means override: nothing
  // downstream may re-chew the result. The user's own protectedDict still
  // wraps outermost, so its priority stays above this layer (inner masking
  // passes pre-existing PUA through untouched).
  // Only the "reverse" direction can occur here (`to` is always cn): flip the dict.
  if (phraseDictDirection(options.from, "cn", options.loadCustomPhrases)) {
    convert = ProtectedConverter(reverseDictString(CNTWPhrases), convert);
  }

  if (protectedDict) {
    convert = ProtectedConverter(protectedDict, convert);
  }
  return convert;
}

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
  Trie,
};

export type { ConverterOptions, HTMLConverterOptions, DictLike, DictGroup };
