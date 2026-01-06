/**
 * OpenCC JS - Core Conversion Engine
 * Based on Trie data structure for efficient longest-match conversion
 */
/**
 * Dictionary format: "key1 value1|key2 value2" or [["key1", "value1"], ["key2", "value2"]]
 */
export type DictLike = string | string[][];
/**
 * Group of dictionaries to apply in sequence
 */
export type DictGroup = DictLike[];
/**
 * Trie tree for efficient string matching and conversion
 */
export declare class Trie {
    private map;
    private value?;
    constructor();
    /**
     * Add a word to the trie
     * @param key - The string to match
     * @param value - The replacement string
     */
    addWord(key: string, value: string): void;
    /**
     * Load dictionary data into the trie
     * @param dict - Dictionary in string format "k1 v1|k2 v2" or array format
     */
    loadDict(dict: DictLike): void;
    /**
     * Load multiple dictionaries
     * @param dictGroup - Array of dictionaries
     */
    loadDictGroup(dictGroup: DictGroup): void;
    /**
     * Convert a string using the trie
     * Uses longest match algorithm for optimal conversion
     * @param input - The string to convert
     * @returns The converted string
     */
    convert(input: string): string;
}
/**
 * Create a converter from multiple dictionary groups
 * Each dictionary group is applied in sequence
 * @param dictGroups - Array of dictionary groups
 * @returns Converter function
 */
export declare function ConverterFactory(...dictGroups: DictGroup[]): (input: string) => string;
/**
 * Create a custom converter with user-defined dictionary
 * @param dict - Custom dictionary entries
 * @returns Converter function
 */
export declare function CustomConverter(dict: DictLike): (input: string) => string;
//# sourceMappingURL=core.d.ts.map