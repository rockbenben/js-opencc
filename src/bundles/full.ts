/**
 * Full bundle - includes all locales and converters
 */

import { Trie, ConverterFactory, CustomConverter, ProtectedConverter, parseOpenCCDict, DictLike } from "../core.js";
import { HTMLConverter, HTMLConverterOptions } from "../html-converter.js";
import { variants2standard, standard2variants, LocaleCode } from "../presets.js";

// Import all dictionaries
import * as dict from "../dict/index.js";

type DictGroup = DictLike[];

interface ConverterOptions {
  from: LocaleCode;
  to: LocaleCode;
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
  const dictGroups: DictGroup[] = [];

  // From variant to standard
  if (options.from !== "t") {
    const dictFiles = variants2standard[options.from] || [];
    const dicts = dictFiles.map((name) => (dict as Record<string, string>)[name]).filter(Boolean);
    if (dicts.length) {
      dictGroups.push(dicts);
    }
  }

  // From standard to variant
  if (options.to !== "t") {
    const dictFiles = standard2variants[options.to] || [];
    const dicts = dictFiles.map((name) => (dict as Record<string, string>)[name]).filter(Boolean);
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

// Locale data for ConverterBuilder compatibility
const Locale = {
  from: Object.fromEntries(Object.entries(variants2standard).map(([locale, files]) => [locale, files.map((name) => (dict as Record<string, string>)[name]).filter(Boolean)])),
  to: Object.fromEntries(Object.entries(standard2variants).map(([locale, files]) => [locale, files.map((name) => (dict as Record<string, string>)[name]).filter(Boolean)])),
};

export { Converter, CustomConverter, ConverterFactory, ProtectedConverter, parseOpenCCDict, HTMLConverter, Locale, Trie };

export type { ConverterOptions, HTMLConverterOptions, LocaleCode, DictLike, DictGroup };
