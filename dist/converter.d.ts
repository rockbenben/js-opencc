/**
 * OpenCC JS - Converter Builder
 * High-level API for creating converters
 */
import { DictGroup, DictLike } from "./core.js";
import { LocaleCode } from "./presets.js";
/**
 * Converter options
 */
export interface ConverterOptions {
    /** Source locale code */
    from: LocaleCode;
    /** Target locale code */
    to: LocaleCode;
    /** Whether to load custom phrase dictionary (default: true for twp) */
    loadCustomPhrases?: boolean;
    /** Whether to apply character fixes (default: true) */
    applyCharFixes?: boolean;
}
/**
 * Locale preset data containing dictionary groups
 */
export interface LocalePreset {
    from: Record<string, DictGroup>;
    to: Record<string, DictGroup>;
}
/**
 * Create a Converter factory with locale preset
 * @param localePreset - Preset containing dictionary groups for each locale
 * @returns Converter factory function
 */
export declare function ConverterBuilder(localePreset: LocalePreset): (options: ConverterOptions) => (input: string) => string;
/**
 * Get dictionary file list for a conversion direction
 */
export declare function getDictFiles(from: LocaleCode, to: LocaleCode): string[];
/**
 * Load dictionaries and create a converter
 * This is the recommended way to create converters in Node.js
 *
 * @param options - Converter options
 * @param customDict - Additional custom dictionary entries
 */
export declare function createConverter(options: ConverterOptions, customDict?: DictLike): Promise<(input: string) => string>;
export type { LocaleCode } from "./presets.js";
export type { DictLike, DictGroup } from "./core.js";
//# sourceMappingURL=converter.d.ts.map