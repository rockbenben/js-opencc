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
  jp: ["JPShinjitaiCharacters", "JPShinjitaiPhrases"],
};

/**
 * Dictionary file names for converting from OpenCC standard to variants
 */
export const standard2variants: Record<string, string[]> = {
  cn: ["TSCharacters", "TSPhrases"],
  hk: ["HKVariants"],
  tw: ["TWVariants"],
  twp: ["TWVariants", "TWPhrases"],
  jp: ["JPShinjitaiCharactersRev"],
};

/**
 * All dictionary file names
 */
export const allDictFiles = [...new Set([...Object.values(variants2standard).flat(), ...Object.values(standard2variants).flat()])];

/**
 * How the custom CNTWPhrases dict should be applied to a conversion:
 * `"forward"` as shipped (cn keys → tw values), `"reverse"` swapped, or `null`
 * to leave it out entirely.
 */
export type PhraseDictDirection = "forward" | "reverse" | null;

/** Locales that carry Taiwan vocabulary. `t`/`hk`/`jp` are traditional but not Taiwanese. */
const isTwVocab = (locale: LocaleCode): boolean => locale === "tw" || locale === "twp";

/**
 * Decide whether — and in which direction — CNTWPhrases applies. This is the
 * single home for the rule: the main entry, both one-way bundles and the full
 * bundle all call it. Do not inline a copy at a call site — four copies is how
 * the four entry points came to disagree with each other.
 *
 * - Crossing INTO Taiwan vocabulary from outside it → `"forward"`.
 * - Leaving Taiwan vocabulary for `cn` → `"reverse"`.
 * - Everything else → `null`.
 *
 * Two asymmetries worth keeping straight, both deliberate:
 *
 * 1. A `tw`/`twp` SOURCE never gets the forward dict, even aimed at `twp`. Its
 *    keys are simplified, so against traditional input the only ones that can
 *    match are the script-invariant terms (土豆, 芝士, 高考, 雪糕, 薯片) — exactly
 *    the entries whose meaning differs in Taiwan (土豆 is peanut there, not
 *    馬鈴薯). A `t`/`hk`/`jp` source aimed at `twp` DOES get it, and should:
 *    芝士→起司 and 雪糕→冰淇淋 are the intended HK→TW conversions.
 * 2. `"reverse"` is confined to `to === "cn"`, not to any non-Taiwan target,
 *    because the reversed values are simplified (計程車 → 出租车) and would put
 *    simplified characters into a traditional target.
 *
 * @param loadCustomPhrases - Defaults to on when either end is `twp`. An
 *   explicit `true` enables the rule but does not override it: directions that
 *   score `null` (e.g. `cn → hk`) still get no dict.
 */
export function phraseDictDirection(from: LocaleCode, to: LocaleCode, loadCustomPhrases?: boolean): PhraseDictDirection {
  if (!(loadCustomPhrases ?? (from === "twp" || to === "twp"))) return null;
  if (!isTwVocab(from) && isTwVocab(to)) return "forward";
  if (isTwVocab(from) && to === "cn") return "reverse";
  return null;
}
