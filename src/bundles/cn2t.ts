/**
 * cn2t bundle - Simplified Chinese to Traditional Chinese only
 * Smaller bundle size for one-way conversion
 */

import { Trie, ConverterFactory, CustomConverter, ProtectedConverter, parseOpenCCDict, DictLike } from "../core.js";
import { HTMLConverter, HTMLConverterOptions } from "../html-converter.js";
import { standard2variants } from "../presets.js";

// Import only the dictionaries needed for cn -> t/tw/twp/hk
import STCharacters from "../dict/STCharacters.js";
import STPhrases from "../dict/STPhrases.js";
import TWVariants from "../dict/TWVariants.js";
import TWPhrases from "../dict/TWPhrases.js";
import HKVariants from "../dict/HKVariants.js";
import JPVariants from "../dict/JPVariants.js";

type DictGroup = DictLike[];

// Available target locales for cn2t
type TargetLocale = "t" | "tw" | "twp" | "hk" | "jp";

interface ConverterOptions {
  from?: "cn";
  to: TargetLocale;
}

const dictMap: Record<string, string> = {
  STCharacters,
  STPhrases,
  TWVariants,
  TWPhrases,
  HKVariants,
  JPVariants,
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
  const dictGroups: DictGroup[] = [];

  // From cn to standard (always needed)
  dictGroups.push([STCharacters, STPhrases]);

  // From standard to target variant
  if (options.to !== "t") {
    const dictFiles = standard2variants[options.to] || [];
    const dicts = dictFiles.map((name) => dictMap[name]).filter(Boolean);
    if (dicts.length) {
      dictGroups.push(dicts);
    }
  }

  let convert = ConverterFactory(...dictGroups);
  if (protectedDict) {
    convert = ProtectedConverter(protectedDict, convert);
  }
  return convert;
}

export { Converter, CustomConverter, ConverterFactory, ProtectedConverter, parseOpenCCDict, HTMLConverter, Trie };

export type { ConverterOptions, HTMLConverterOptions, DictLike, DictGroup };
