/**
 * OpenCC JS - Main Entry Point
 */

// Core exports
export { Trie, ConverterFactory, CustomConverter } from "./core.js";
export type { DictLike, DictGroup } from "./core.js";

// Converter exports
export { ConverterBuilder, createConverter, getDictFiles } from "./converter.js";
export type { ConverterOptions, LocalePreset } from "./converter.js";

// HTML Converter exports
export { HTMLConverter } from "./html-converter.js";
export type { HTMLConverterOptions } from "./html-converter.js";

// Preset exports
export { variants2standard, standard2variants, allDictFiles } from "./presets.js";
export type { LocaleCode } from "./presets.js";
