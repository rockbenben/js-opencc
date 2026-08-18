/**
 * cn2t bundle - Simplified Chinese to Traditional Chinese only
 * Smaller bundle size for one-way conversion
 */

import { Trie, ConverterFactory, CustomConverter, ProtectedConverter, parseOpenCCDict, DictLike } from "../core.js";
import { HTMLConverter, HTMLConverterOptions } from "../html-converter.js";
import { standard2variants, phraseDictDirection } from "../presets.js";

// Import only the dictionaries needed for cn -> t/tw/twp/hk
import STCharacters from "../dict/STCharacters.js";
import STPhrases from "../dict/STPhrases.js";
import TWVariants from "../dict/TWVariants.js";
import TWPhrases from "../dict/TWPhrases.js";
import HKVariants from "../dict/HKVariants.js";
import JPShinjitaiCharactersRev from "../dict/JPShinjitaiCharactersRev.js";
import CNTWPhrases from "../dict/CNTWPhrases.js";

type DictGroup = DictLike[];

// Available target locales for cn2t
type TargetLocale = "t" | "tw" | "twp" | "hk" | "jp";

interface ConverterOptions {
  from?: "cn";
  to: TargetLocale;
  /** Whether to load the custom CNTWPhrases dict (default: on for `to: "twp"`) */
  loadCustomPhrases?: boolean;
}

const dictMap: Record<string, string> = {
  STCharacters,
  STPhrases,
  TWVariants,
  TWPhrases,
  HKVariants,
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

  // From cn to standard (always needed)
  dictGroups.push([STCharacters, STPhrases]);

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

  // CNTWPhrases (custom vocabulary dict) — whether it applies comes from the
  // shared rule, so UMD output matches the npm main entry (幼儿园→幼稚園). The
  // direction can only be "forward" here: `from` is always cn, never Taiwanese.
  if (phraseDictDirection("cn", options.to, options.loadCustomPhrases)) {
    dictGroups.unshift([CNTWPhrases]);
  }

  let convert = ConverterFactory(...dictGroups);
  if (protectedDict) {
    convert = ProtectedConverter(protectedDict, convert);
  }
  return convert;
}

export { Converter, CustomConverter, ConverterFactory, ProtectedConverter, parseOpenCCDict, HTMLConverter, Trie };

export type { ConverterOptions, HTMLConverterOptions, DictLike, DictGroup };
