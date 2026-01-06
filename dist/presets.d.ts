/**
 * OpenCC JS - Preset Configurations
 * Defines dictionary mappings for different Chinese variants
 */
/**
 * Supported locale codes
 * - cn: Simplified Chinese (Mainland China)
 * - tw: Traditional Chinese (Taiwan)
 * - twp: Traditional Chinese (Taiwan) with phrase conversion
 * - hk: Traditional Chinese (Hong Kong)
 * - jp: Japanese Shinjitai
 * - t: OpenCC standard Traditional Chinese
 */
export type LocaleCode = "cn" | "tw" | "twp" | "hk" | "jp" | "t";
/**
 * Dictionary file names for converting from variants to OpenCC standard
 */
export declare const variants2standard: Record<string, string[]>;
/**
 * Dictionary file names for converting from OpenCC standard to variants
 */
export declare const standard2variants: Record<string, string[]>;
/**
 * All dictionary file names
 */
export declare const allDictFiles: string[];
//# sourceMappingURL=presets.d.ts.map