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
        // Split on the FIRST space only: the key is one token, but a value may
        // itself contain spaces (e.g. multi-word replacements). Splitting on
        // every space would silently drop everything after the first value token.
        const sep = entry.indexOf(" ");
        if (sep < 0) continue;
        const key = entry.slice(0, sep);
        const value = entry.slice(sep + 1);
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
   * Find the longest match starting at `start` in `input`.
   *
   * @returns `{ end, value }` where `end` is the exclusive end index in `input`
   *   and `value` is the matched replacement value. On no match, returns
   *   `{ end: 0, value: undefined }` — note `end: 0` is a fixed sentinel,
   *   not relative to `start`. Callers should check `end > start`.
   * @param input - The string to search
   * @param start - The index to start matching from
   */
  findLongestMatch(input: string, start: number): { end: number; value: string | undefined } {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let node: Trie | undefined = this;
    let matchEnd = 0;
    let matchValue: string | undefined;
    for (let j = start; j < input.length && node; ) {
      const codePoint = input.codePointAt(j)!;
      const charLength = codePoint > 0xffff ? 2 : 1;
      j += charLength;
      const nextNode = node.map.get(codePoint);
      if (!nextNode) break;
      node = nextNode;
      if (node.value !== undefined) {
        matchEnd = j;
        matchValue = node.value;
      }
    }
    return { end: matchEnd, value: matchValue };
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
      // eslint-disable-next-line @typescript-eslint/no-this-alias
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

/**
 * Private Use Area base codepoint. Plane 0 PUA spans U+E000..U+F8FF (6400 slots).
 * OpenCC dictionaries do not contain PUA characters, so masking with PUA
 * guarantees inner converters never match or modify them.
 */
const PROTECT_PLACEHOLDER_BASE = 0xe000;
const PROTECT_PLACEHOLDER_END = 0xf8ff;

/**
 * Wrap an inner converter with a protected dictionary layer.
 * Strings matching `protectedDict` are masked with PUA placeholders before
 * inner conversion runs, then restored afterward — guaranteeing the inner
 * dictionaries never see or modify them (hard override).
 *
 * Identical target values reuse the same placeholder char to economize the
 * 6400-slot PUA range; if more than 6400 distinct target values appear, a
 * RangeError is thrown.
 *
 * Safe to nest: each layer scans its input for existing PUA codepoints (from
 * outer layers) and allocates around them. PUA chars from outer layers pass
 * through unchanged.
 */
export function ProtectedConverter(
  protectedDict: DictLike,
  innerConvert: (input: string) => string
): (input: string) => string {
  const trie = new Trie();
  trie.loadDict(protectedDict);

  return function convert(input: string): string {
    const slotsByCode = new Map<number, string>();
    const valueToPlaceholder = new Map<string, string>();
    const masked = maskWithTrie(input, trie, slotsByCode, valueToPlaceholder);
    const converted = innerConvert(masked);
    return restorePlaceholders(converted, slotsByCode);
  };
}

/**
 * Parse OpenCC-format dictionary text into `[key, value][]` — the shape
 * accepted by `protectedDict`, `CustomConverter`, and `ConverterFactory`.
 *
 * Format (same as OpenCC's own `data/dictionary/*.txt`):
 * - One entry per line: `key<TAB>value` or `key<TAB>value1 value2 ...`
 *   (first space-separated value wins, matching OpenCC's convention)
 * - `#`-prefixed lines are comments; blank lines are skipped
 * - Whitespace around key and chosen value is trimmed
 *
 * Typical use — load a user-maintained file at runtime (Node.js):
 *
 * ```ts
 * import fs from "node:fs";
 * import { createConverter, parseOpenCCDict } from "js-opencc";
 *
 * const dict = parseOpenCCDict(fs.readFileSync("./data/protected.txt", "utf8"));
 * const convert = await createConverter({ from: "cn", to: "tw" }, dict);
 * ```
 *
 * @param text - Dictionary text in OpenCC format
 * @returns Array of `[key, value]` pairs ready to pass to `protectedDict`
 */
export function parseOpenCCDict(text: string): string[][] {
  const entries: string[][] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    // Use the first tab as separator. Some OpenCC files use multiple spaces
    // rather than tabs in edge cases — accept either by treating runs of
    // whitespace as the separator after locating the first non-whitespace token.
    const tabIdx = line.indexOf("\t");
    let key: string;
    let valueField: string;
    if (tabIdx >= 0) {
      key = line.slice(0, tabIdx).trim();
      valueField = line.slice(tabIdx + 1).trim();
    } else {
      // Fallback: split on first whitespace run
      const m = line.match(/^(\S+)\s+(.+)$/);
      if (!m) continue;
      key = m[1];
      valueField = m[2];
    }
    if (!key || !valueField) continue;
    // First space-separated value wins (OpenCC convention for ambiguous keys).
    const value = valueField.split(/\s+/)[0];
    if (!value) continue;
    entries.push([key, value]);
  }
  return entries;
}

/**
 * Scan `input` with `trie` (longest match) and replace each hit with a PUA
 * placeholder character. Identical target values reuse the same placeholder.
 * Pre-existing PUA chars (from outer ProtectedConverter layers) are passed
 * through unchanged and skipped during trie matching.
 */
function maskWithTrie(
  input: string,
  trie: Trie,
  slotsByCode: Map<number, string>,
  valueToPlaceholder: Map<string, string>
): string {
  // Scan input for any existing PUA codepoints (from outer ProtectedConverter
  // layers). We must not allocate the same codepoint, and we must not try to
  // match these against our trie — they're opaque to us.
  const existingPUA = new Set<number>();
  for (const c of input) {
    const cp = c.codePointAt(0)!;
    if (cp >= PROTECT_PLACEHOLDER_BASE && cp <= PROTECT_PLACEHOLDER_END) {
      existingPUA.add(cp);
    }
  }

  let nextCode = PROTECT_PLACEHOLDER_BASE;
  const allocateCode = (): number => {
    while (existingPUA.has(nextCode)) nextCode++;
    if (nextCode > PROTECT_PLACEHOLDER_END) {
      throw new RangeError(
        "ProtectedConverter: too many distinct target values (>6400 PUA slots exhausted)"
      );
    }
    return nextCode++;
  };

  const result: string[] = [];
  const length = input.length;
  let i = 0;
  while (i < length) {
    const currentCp = input.codePointAt(i)!;
    // Pass through pre-existing PUA chars (from outer layers) unchanged
    if (existingPUA.has(currentCp)) {
      const charLength = currentCp > 0xffff ? 2 : 1;
      result.push(input.substring(i, i + charLength));
      i += charLength;
      continue;
    }
    const { end, value } = trie.findLongestMatch(input, i);
    if (end > i && value !== undefined) {
      let placeholder = valueToPlaceholder.get(value);
      if (placeholder === undefined) {
        const code = allocateCode();
        placeholder = String.fromCodePoint(code);
        valueToPlaceholder.set(value, placeholder);
        slotsByCode.set(code, value);
      }
      result.push(placeholder);
      i = end;
    } else {
      const charLength = currentCp > 0xffff ? 2 : 1;
      result.push(input.substring(i, i + charLength));
      i += charLength;
    }
  }
  return result.join("");
}

/**
 * Single-pass scan: each PUA codepoint present in `slotsByCode` is replaced
 * by its mapped value; otherwise the character passes through unchanged.
 * Outer-layer PUA codepoints (not in this map) pass through to be restored
 * by their owning layer.
 */
function restorePlaceholders(text: string, slotsByCode: Map<number, string>): string {
  if (slotsByCode.size === 0) return text;
  const result: string[] = [];
  for (const c of text) {
    const cp = c.codePointAt(0)!;
    const restored = slotsByCode.get(cp);
    if (restored !== undefined) {
      result.push(restored);
    } else {
      result.push(c);
    }
  }
  return result.join("");
}
