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
export const variants2standard: Record<string, string[]> = {
  cn: ["STCharacters", "STPhrases"],
  hk: ["HKVariantsRev", "HKVariantsRevPhrases"],
  tw: ["TWVariantsRev", "TWVariantsRevPhrases"],
  twp: ["TWVariantsRev", "TWVariantsRevPhrases", "TWPhrasesRev"],
  jp: ["JPVariantsRev", "JPShinjitaiCharacters", "JPShinjitaiPhrases"],
};

/**
 * Dictionary file names for converting from OpenCC standard to variants
 */
export const standard2variants: Record<string, string[]> = {
  cn: ["TSCharacters", "TSPhrases"],
  hk: ["HKVariants"],
  tw: ["TWVariants"],
  twp: ["TWVariants", "TWPhrasesIT", "TWPhrasesName", "TWPhrasesOther"],
  jp: ["JPVariants"],
};

/**
 * All dictionary file names
 */
export const allDictFiles = [...new Set([...Object.values(variants2standard).flat(), ...Object.values(standard2variants).flat()])];
