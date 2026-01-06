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
export class Trie {
  private map: Map<number, Trie>;
  private value?: string;

  constructor() {
    this.map = new Map();
  }

  /**
   * Add a word to the trie
   * @param key - The string to match
   * @param value - The replacement string
   */
  addWord(key: string, value: string): void {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let node: Trie = this;
    for (const char of key) {
      const codePoint = char.codePointAt(0)!;
      let nextNode = node.map.get(codePoint);
      if (!nextNode) {
        nextNode = new Trie();
        node.map.set(codePoint, nextNode);
      }
      node = nextNode;
    }
    node.value = value;
  }

  /**
   * Load dictionary data into the trie
   * @param dict - Dictionary in string format "k1 v1|k2 v2" or array format
   */
  loadDict(dict: DictLike): void {
    if (typeof dict === "string") {
      const entries = dict.split("|");
      for (const entry of entries) {
        const [key, value] = entry.split(" ");
        if (key && value) {
          this.addWord(key, value);
        }
      }
    } else {
      for (const [key, value] of dict) {
        if (key && value) {
          this.addWord(key, value);
        }
      }
    }
  }

  /**
   * Load multiple dictionaries
   * @param dictGroup - Array of dictionaries
   */
  loadDictGroup(dictGroup: DictGroup): void {
    for (const dict of dictGroup) {
      this.loadDict(dict);
    }
  }

  /**
   * Convert a string using the trie
   * Uses longest match algorithm for optimal conversion
   * @param input - The string to convert
   * @returns The converted string
   */
  convert(input: string): string {
    const result: string[] = [];
    const length = input.length;
    let originalStart: number | null = null;

    for (let i = 0; i < length; ) {
      let currentNode: Trie | undefined = this;
      let matchEnd = 0;
      let matchValue: string | undefined;

      // Find the longest match starting at position i
      for (let j = i; j < length && currentNode; ) {
        const codePoint = input.codePointAt(j)!;
        const charLength = codePoint > 0xffff ? 2 : 1;
        j += charLength;

        const nextNode = currentNode.map.get(codePoint);
        if (!nextNode) {
          break;
        }
        currentNode = nextNode;

        if (currentNode.value !== undefined) {
          matchEnd = j;
          matchValue = currentNode.value;
        }
      }

      if (matchEnd > 0 && matchValue !== undefined) {
        // Found a match - flush any accumulated original text first
        if (originalStart !== null) {
          result.push(input.slice(originalStart, i));
          originalStart = null;
        }
        result.push(matchValue);
        i = matchEnd;
      } else {
        // No match - accumulate original text
        if (originalStart === null) {
          originalStart = i;
        }
        const codePoint = input.codePointAt(i)!;
        i += codePoint > 0xffff ? 2 : 1;
      }
    }

    // Flush remaining original text
    if (originalStart !== null) {
      result.push(input.slice(originalStart, length));
    }

    return result.join("");
  }
}

/**
 * Create a converter from multiple dictionary groups
 * Each dictionary group is applied in sequence
 * @param dictGroups - Array of dictionary groups
 * @returns Converter function
 */
export function ConverterFactory(...dictGroups: DictGroup[]): (input: string) => string {
  const tries = dictGroups.map((group) => {
    const trie = new Trie();
    trie.loadDictGroup(group);
    return trie;
  });

  return function convert(input: string): string {
    return tries.reduce((text, trie) => trie.convert(text), input);
  };
}

/**
 * Create a custom converter with user-defined dictionary
 * @param dict - Custom dictionary entries
 * @returns Converter function
 */
export function CustomConverter(dict: DictLike): (input: string) => string {
  return ConverterFactory([dict]);
}
