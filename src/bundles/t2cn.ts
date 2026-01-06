/**
 * t2cn bundle - Traditional Chinese to Simplified Chinese only
 * Smaller bundle size for one-way conversion
 */

import { Trie, ConverterFactory, CustomConverter, DictLike } from "../core.js";
import { HTMLConverter, HTMLConverterOptions } from "../html-converter.js";
import { variants2standard } from "../presets.js";

// Import only the dictionaries needed for t/tw/twp/hk -> cn
import TSCharacters from "../dict/TSCharacters.js";
import TSPhrases from "../dict/TSPhrases.js";
import TWVariantsRev from "../dict/TWVariantsRev.js";
import TWVariantsRevPhrases from "../dict/TWVariantsRevPhrases.js";
import TWPhrasesRev from "../dict/TWPhrasesRev.js";
import HKVariantsRev from "../dict/HKVariantsRev.js";
import HKVariantsRevPhrases from "../dict/HKVariantsRevPhrases.js";
import JPVariantsRev from "../dict/JPVariantsRev.js";
import JPShinjitaiCharacters from "../dict/JPShinjitaiCharacters.js";
import JPShinjitaiPhrases from "../dict/JPShinjitaiPhrases.js";

type DictGroup = DictLike[];

// Available source locales for t2cn
type SourceLocale = "t" | "tw" | "twp" | "hk" | "jp";

interface ConverterOptions {
  from: SourceLocale;
  to?: "cn";
}

const dictMap: Record<string, string> = {
  TSCharacters,
  TSPhrases,
  TWVariantsRev,
  TWVariantsRevPhrases,
  TWPhrasesRev,
  HKVariantsRev,
  HKVariantsRevPhrases,
  JPVariantsRev,
  JPShinjitaiCharacters,
  JPShinjitaiPhrases,
};

/**
 * Create a converter from Traditional variants to Simplified Chinese
 */
function Converter(options: ConverterOptions): (input: string) => string {
  const dictGroups: DictGroup[] = [];

  // From source variant to standard
  if (options.from !== "t") {
    const dictFiles = variants2standard[options.from] || [];
    const dicts = dictFiles.map((name) => dictMap[name]).filter(Boolean);
    if (dicts.length) {
      dictGroups.push(dicts);
    }
  }

  // From standard to cn (always needed)
  dictGroups.push([TSCharacters, TSPhrases]);

  return ConverterFactory(...dictGroups);
}

export { Converter, CustomConverter, ConverterFactory, HTMLConverter, Trie };

export type { ConverterOptions, HTMLConverterOptions, DictLike, DictGroup };
