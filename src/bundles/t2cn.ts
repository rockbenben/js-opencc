/**
 * t2cn bundle - Traditional Chinese to Simplified Chinese only
 * Smaller bundle size for one-way conversion
 */

import { Trie, ConverterFactory, CustomConverter, ProtectedConverter, parseOpenCCDict, reverseDictString, DictLike } from "../core.js";
import { HTMLConverter, HTMLConverterOptions } from "../html-converter.js";
import { variants2standard, phraseDictDirection } from "../presets.js";

// Import only the dictionaries needed for t/tw/twp/hk -> cn
import TSCharacters from "../dict/TSCharacters.js";
import TSPhrases from "../dict/TSPhrases.js";
import TWVariantsRev from "../dict/TWVariantsRev.js";
import TWVariantsRevPhrases from "../dict/TWVariantsRevPhrases.js";
import TWPhrasesRev from "../dict/TWPhrasesRev.js";
import HKVariantsRev from "../dict/HKVariantsRev.js";
import HKVariantsRevPhrases from "../dict/HKVariantsRevPhrases.js";
import JPShinjitaiCharacters from "../dict/JPShinjitaiCharacters.js";
import JPShinjitaiPhrases from "../dict/JPShinjitaiPhrases.js";
import CNTWPhrases from "../dict/CNTWPhrases.js";

type DictGroup = DictLike[];

// Available source locales for t2cn
type SourceLocale = "t" | "tw" | "twp" | "hk" | "jp";

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

  // CNTWPhrases (custom vocabulary dict) — whether it applies comes from the
  // shared rule, so UMD output matches the npm main entry (幼稚園→幼儿园). The
  // direction can only be "reverse" here: `to` is always cn, never Taiwanese.
  if (phraseDictDirection(options.from, "cn", options.loadCustomPhrases)) {
    dictGroups.unshift([reverseDictString(CNTWPhrases)]);
  }

  let convert = ConverterFactory(...dictGroups);
  if (protectedDict) {
    convert = ProtectedConverter(protectedDict, convert);
  }
  return convert;
}

export { Converter, CustomConverter, ConverterFactory, ProtectedConverter, parseOpenCCDict, HTMLConverter, Trie };

export type { ConverterOptions, HTMLConverterOptions, DictLike, DictGroup };
