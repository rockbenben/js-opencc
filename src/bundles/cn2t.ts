/**
 * cn2t bundle - Simplified Chinese to Traditional Chinese only
 * Smaller bundle size for one-way conversion
 */

import { Trie, ConverterFactory, ConverterFactoryWithSegmentation, CustomConverter, ProtectedConverter, parseOpenCCDict, DictLike, normalizeCompatibilityIdeographs } from "../core.js";
import { HTMLConverter, HTMLConverterOptions } from "../html-converter.js";
import { standard2variants, phraseDictDirection, segmentationDictsFor } from "../presets.js";

// Import only the dictionaries needed for cn -> t/tw/twp/hk
import STCharacters from "../dict/STCharacters.js";
import STPhrases from "../dict/STPhrases.js";
import STPhrases_GeneratedFromRegionalPhrases from "../dict/STPhrases_GeneratedFromRegionalPhrases.js";
import TWVariants from "../dict/TWVariants.js";
import TWVariantsPhrases from "../dict/TWVariantsPhrases.js";
import TWPhrases from "../dict/TWPhrases.js";
import HKVariants from "../dict/HKVariants.js";
import HKVariantsPhrases from "../dict/HKVariantsPhrases.js";
import HKPhrases from "../dict/HKPhrases.js";
import JPShinjitaiCharactersRev from "../dict/JPShinjitaiCharactersRev.js";
import CNTWPhrases from "../dict/CNTWPhrases.js";

type DictGroup = DictLike[];

// Available target locales for cn2t
type TargetLocale = "t" | "tw" | "twp" | "hk" | "hkp" | "jp";

interface ConverterOptions {
  from?: "cn";
  to: TargetLocale;
  /** Whether to load the custom CNTWPhrases dict (default: on for `to: "twp"`) */
  loadCustomPhrases?: boolean;
}

const dictMap: Record<string, string> = {
  STCharacters,
  STPhrases,
  STPhrases_GeneratedFromRegionalPhrases,
  TWVariants,
  TWVariantsPhrases,
  TWPhrases,
  HKVariants,
  HKVariantsPhrases,
  HKPhrases,
  JPShinjitaiCharactersRev,
};

/**
 * Create a converter from Simplified Chinese to Traditional variants.
 *
 * @param options - Conversion options (locale)
 * @param protectedDict - Optional hard-override dictionary. Matches are masked
 *   with PUA placeholders before built-in conversion, then restored after —
 *   OpenCC dictionaries never see or modify them. Highest priority.
 *
 *   UMD bundles do NOT auto-load `data/custom/ProtectedDict.txt` (no fs
 *   access in browsers). Pass the dict explicitly. To load from a remote URL,
 *   `fetch` the text and use `parseOpenCCDict()`.
 */
function Converter(options: ConverterOptions, protectedDict?: DictLike): (input: string) => string {
  // Only cn→variant dicts ship here; reject another source rather than ignore
  // it and run the cn→tw chain over input the caller declared as traditional.
  if (options.from !== undefined && options.from !== "cn") {
    throw new Error(`cn2t bundle only converts from 'cn', got '${options.from}' — use the full bundle for other directions`);
  }
  if ((options.to as string) === "cn") {
    throw new Error(`cn2t bundle cannot convert to 'cn' — use the t2cn bundle`);
  }

  const dictGroups: DictGroup[] = [];

  // From cn to standard (always needed). Order = last-write-wins priority;
  // the generated dict pins regional terms (出租车→出租車) so segmentation can
  // keep them whole — see presets.ts segmentationDictsFor.
  dictGroups.push([STCharacters, STPhrases_GeneratedFromRegionalPhrases, STPhrases]);

  // From standard to target variant. Unknown locales and preset files missing
  // from dictMap throw loudly — silently skipping a step would return
  // partially-converted text (JS callers bypass the TS type check).
  if (options.to !== "t") {
    const dictFiles = standard2variants[options.to];
    // Array.isArray, not truthiness: `standard2variants["constructor"]` is a
    // truthy prototype member that would fall through to an opaque TypeError.
    if (!Array.isArray(dictFiles)) throw new Error(`Unknown 'to' locale: ${options.to}`);
    dictGroups.push(
      dictFiles.map((name) => {
        const d = dictMap[name];
        // typeof, not truthiness: a dict CAN legitimately optimize to "" (all
        // entries single-char identity pairs), and this also rejects prototype
        // members like "toString" that `in` would accept.
        if (typeof d !== "string") throw new Error(`Dictionary ${name} missing from cn2t bundle`);
        return d;
      })
    );
  }

  // Cut the input before converting: without it the second step's regional
  // vocabulary table matches across word boundaries the first step set, and
  // 他优化了 comes out 他最佳化了 where OpenCC gives 他優化了. Only the
  // cn <-> tw/hk directions segment; segmentationDictsFor decides.
  const segmentation = segmentationDictsFor("cn", options.to).length
    ? [STPhrases, STPhrases_GeneratedFromRegionalPhrases]
    : null;

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
  // Direction can only be "forward" here: `from` is always cn, never Taiwanese.
  if (phraseDictDirection("cn", options.to, options.loadCustomPhrases)) {
    convert = ProtectedConverter(CNTWPhrases, convert);
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
