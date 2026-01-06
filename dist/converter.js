/**
 * OpenCC JS - Converter Builder
 * High-level API for creating converters
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { ConverterFactory } from "./core.js";
import { variants2standard, standard2variants } from "./presets.js";
/**
 * Create a Converter factory with locale preset
 * @param localePreset - Preset containing dictionary groups for each locale
 * @returns Converter factory function
 */
export function ConverterBuilder(localePreset) {
    return function Converter(options) {
        const dictGroups = [];
        // Add 'from' dictionaries (variant -> standard)
        if (options.from !== "t" && localePreset.from[options.from]) {
            dictGroups.push(localePreset.from[options.from]);
        }
        // Add 'to' dictionaries (standard -> variant)
        if (options.to !== "t" && localePreset.to[options.to]) {
            dictGroups.push(localePreset.to[options.to]);
        }
        return ConverterFactory(...dictGroups);
    };
}
/**
 * Get dictionary file list for a conversion direction
 */
export function getDictFiles(from, to) {
    const files = [];
    if (from !== "t") {
        files.push(...(variants2standard[from] || []));
    }
    if (to !== "t") {
        files.push(...(standard2variants[to] || []));
    }
    return files;
}
/**
 * Load custom dictionary from file
 */
function loadCustomDictFile(filePath) {
    try {
        if (!fs.existsSync(filePath))
            return null;
        const content = fs.readFileSync(filePath, "utf-8");
        const entries = [];
        for (const line of content.split("\n")) {
            if (line.startsWith("#") || !line.trim())
                continue;
            const [key, value] = line.split("\t");
            if (key && value) {
                entries.push([key.trim(), value.trim()]);
            }
        }
        return entries.length > 0 ? entries : null;
    }
    catch {
        return null;
    }
}
/**
 * Get the custom dictionary directory path
 */
function getCustomDictDir() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    return path.resolve(__dirname, "..", "data", "custom");
}
/**
 * Load dictionaries and create a converter
 * This is the recommended way to create converters in Node.js
 *
 * @param options - Converter options
 * @param customDict - Additional custom dictionary entries
 */
export async function createConverter(options, customDict) {
    const dictFiles = getDictFiles(options.from, options.to);
    const dictGroups = [];
    // Import all dictionaries
    const dictModules = await import("./dict/index.js");
    // Load each required dictionary
    for (const fileName of dictFiles) {
        const dictData = dictModules[fileName];
        if (dictData) {
            dictGroups.push([dictData]);
        }
        else {
            console.warn(`Dictionary ${fileName} not found. Run 'npm run sync:opencc' first.`);
        }
    }
    // Auto-load custom phrase dictionary for twp conversion
    const loadPhrases = options.loadCustomPhrases ?? (options.to === "twp" || options.from === "twp");
    if (loadPhrases) {
        const customDir = getCustomDictDir();
        const phrasesFile = path.join(customDir, "CNTWPhrases.txt");
        const phrases = loadCustomDictFile(phrasesFile);
        if (phrases) {
            // For cn → twp: use as-is (大陸 → 台灣)
            // For twp → cn: reverse the mapping (台灣 → 大陸)
            if (options.from === "twp" && options.to === "cn") {
                const reversed = phrases.map(([cn, tw]) => [tw, cn]);
                dictGroups.push([reversed]);
            }
            else {
                dictGroups.push([phrases]);
            }
        }
    }
    // Add user-provided custom dictionary
    if (customDict) {
        dictGroups.push([customDict]);
    }
    // Apply character fixes at the end (always enabled by default)
    const applyFixes = options.applyCharFixes ?? true;
    if (applyFixes) {
        const customDir = getCustomDictDir();
        const fixesFile = path.join(customDir, "CharFixes.txt");
        const fixes = loadCustomDictFile(fixesFile);
        if (fixes) {
            dictGroups.push([fixes]);
        }
    }
    return ConverterFactory(...dictGroups);
}
//# sourceMappingURL=converter.js.map