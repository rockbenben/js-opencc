/**
 * OpenCC JS - Preset Configurations
 * Defines dictionary mappings for different Chinese variants
 */
/**
 * Dictionary file names for converting from variants to OpenCC standard
 */
export const variants2standard = {
    cn: ["STCharacters", "STPhrases"],
    hk: ["HKVariantsRev", "HKVariantsRevPhrases"],
    tw: ["TWVariantsRev", "TWVariantsRevPhrases"],
    twp: ["TWVariantsRev", "TWVariantsRevPhrases", "TWPhrasesRev"],
    jp: ["JPVariantsRev", "JPShinjitaiCharacters", "JPShinjitaiPhrases"],
};
/**
 * Dictionary file names for converting from OpenCC standard to variants
 */
export const standard2variants = {
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
//# sourceMappingURL=presets.js.map