/**
 * Full bundle - includes all locales and converters
 */
import { Trie, ConverterFactory, CustomConverter } from "../core.js";
import { HTMLConverter } from "../html-converter.js";
import { variants2standard, standard2variants } from "../presets.js";
// Import all dictionaries
import * as dict from "../dict/index.js";
/**
 * Create a converter with the specified locales
 */
function Converter(options) {
    const dictGroups = [];
    // From variant to standard
    if (options.from !== "t") {
        const dictFiles = variants2standard[options.from] || [];
        const dicts = dictFiles.map((name) => dict[name]).filter(Boolean);
        if (dicts.length) {
            dictGroups.push(dicts);
        }
    }
    // From standard to variant
    if (options.to !== "t") {
        const dictFiles = standard2variants[options.to] || [];
        const dicts = dictFiles.map((name) => dict[name]).filter(Boolean);
        if (dicts.length) {
            dictGroups.push(dicts);
        }
    }
    return ConverterFactory(...dictGroups);
}
// Locale data for ConverterBuilder compatibility
const Locale = {
    from: Object.fromEntries(Object.entries(variants2standard).map(([locale, files]) => [locale, files.map((name) => dict[name]).filter(Boolean)])),
    to: Object.fromEntries(Object.entries(standard2variants).map(([locale, files]) => [locale, files.map((name) => dict[name]).filter(Boolean)])),
};
export { Converter, CustomConverter, ConverterFactory, HTMLConverter, Locale, Trie };
//# sourceMappingURL=full.js.map