/**
 * cn2t bundle - Simplified Chinese to Traditional Chinese only
 * Smaller bundle size for one-way conversion
 */
import { Trie, ConverterFactory, CustomConverter } from "../core.js";
import { HTMLConverter } from "../html-converter.js";
import { standard2variants } from "../presets.js";
// Import only the dictionaries needed for cn -> t/tw/twp/hk
import STCharacters from "../dict/STCharacters.js";
import STPhrases from "../dict/STPhrases.js";
import TWVariants from "../dict/TWVariants.js";
import TWPhrasesIT from "../dict/TWPhrasesIT.js";
import TWPhrasesName from "../dict/TWPhrasesName.js";
import TWPhrasesOther from "../dict/TWPhrasesOther.js";
import HKVariants from "../dict/HKVariants.js";
import JPVariants from "../dict/JPVariants.js";
const dictMap = {
    STCharacters,
    STPhrases,
    TWVariants,
    TWPhrasesIT,
    TWPhrasesName,
    TWPhrasesOther,
    HKVariants,
    JPVariants,
};
/**
 * Create a converter from Simplified Chinese to Traditional variants
 */
function Converter(options) {
    const dictGroups = [];
    // From cn to standard (always needed)
    dictGroups.push([STCharacters, STPhrases]);
    // From standard to target variant
    if (options.to !== "t") {
        const dictFiles = standard2variants[options.to] || [];
        const dicts = dictFiles.map((name) => dictMap[name]).filter(Boolean);
        if (dicts.length) {
            dictGroups.push(dicts);
        }
    }
    return ConverterFactory(...dictGroups);
}
export { Converter, CustomConverter, ConverterFactory, HTMLConverter, Trie };
//# sourceMappingURL=cn2t.js.map