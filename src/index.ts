/**
 * OpenCC JS - Main Entry Point
 */

// Core exports.
//
// `ConverterFactoryWithSegmentation` and `normalizeCompatibilityIdeographs`
// belong here next to `ConverterFactory`, not only on the `./core` subpath:
// anyone assembling a custom chain from this entry would otherwise find the
// unsegmented factory as the only option and silently lose regional-phrase
// boundary handling (他优化了 → 他最佳化了). Exporting the plain factory but
// not the segmented one reads as "segmentation is internal", when it is in
// fact what every preset uses.
export {
  Trie,
  ConverterFactory,
  ConverterFactoryWithSegmentation,
  CustomConverter,
  ProtectedConverter,
  normalizeCompatibilityIdeographs,
  parseOpenCCDict,
  reverseDictString,
} from "./core.js";
export type { DictLike, DictGroup } from "./core.js";

// Converter exports
export { ConverterBuilder, createConverter, getDictFiles } from "./converter.js";
export type { ConverterOptions, LocalePreset } from "./converter.js";

// HTML Converter exports
export { HTMLConverter } from "./html-converter.js";
export type { HTMLConverterOptions } from "./html-converter.js";

// Preset exports. `segmentationDictsFor` ships too — a custom chain needs it
// to know WHICH dict to cut on, and getting that wrong (cutting an `s2*`
// chain on a traditional-keyed dict) fails silently.
export { variants2standard, standard2variants, allDictFiles, segmentationDictsFor } from "./presets.js";
export type { LocaleCode } from "./presets.js";
