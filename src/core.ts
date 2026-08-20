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
 * `input[i]` 起是不是一个合法的代理对（高代理后面真的跟着低代理）。
 *
 * 存在的唯一理由是防一类静默错误：热循环从 `codePointAt` 换成 `charCodeAt` 之后，
 * 「孤立高代理」不再天然按一个单元处理——只判高代理就跳 2 会**吞掉它后面那个
 * 字符**，那个字符于是永远参与不了匹配，输出少转一处且不报错。真实词典里没有
 * 孤立代理，所以 556 官方用例和整段语料对拍都发现不了，只有专门造畸形 UTF-16
 * 才暴露。
 *
 * 三处不匹配步进（Trie.convert / Trie.segment / maskWithTrie）共用它。
 */
function isSurrogatePair(input: string, i: number, length: number): boolean {
  const hi = input.charCodeAt(i);
  if (hi < 0xd800 || hi > 0xdbff || i + 1 >= length) return false;
  const lo = input.charCodeAt(i + 1);
  return lo >= 0xdc00 && lo <= 0xdfff;
}

/**
 * Trie tree for efficient string matching and conversion
 */
export class Trie {
  /**
   * Children, allocated on first insert.
   *
   * Half the nodes in a real dictionary trie are leaves (measured on
   * STPhrases: 42 950 of 86 388, 49.7%), and an eagerly-constructed `new Map()`
   * on every one of them is pure overhead — an empty Map is not free. Leaving
   * this `undefined` until a child is actually added drops a Map allocation
   * for every leaf. Read sites must therefore go through `?.get(...)`, which
   * returns `undefined` for a leaf exactly as an empty Map's `get` would.
   */
  private map?: Map<number, Trie>;
  private value?: string;

  /**
   * Add a word to the trie
   * @param key - The string to match
   * @param value - The replacement string
   */
  addWord(key: string, value: string): void {
    // charCodeAt + 手动代理对配对,不走 for..of 迭代器/codePointAt:构建整棵
    // STPhrases 树实测 1.72×(10.3 → 6.0 ms)。五个走 trie 的循环(addWord /
    // findLongestMatch / matchLongestInto / convert / segment)统一这一种写法,
    // 改其一记得同步其余。
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let node: Trie = this;
    for (let i = 0; i < key.length; ) {
      let codePoint = key.charCodeAt(i);
      if (codePoint >= 0xd800 && codePoint <= 0xdbff && i + 1 < key.length) {
        const lo = key.charCodeAt(i + 1);
        if (lo >= 0xdc00 && lo <= 0xdfff) {
          codePoint = (codePoint - 0xd800) * 0x400 + (lo - 0xdc00) + 0x10000;
          i += 2;
        } else i += 1; // 孤立高代理,按单元收——与 codePointAt 行为一致
      } else i += 1;
      let nextNode = node.map?.get(codePoint);
      if (!nextNode) {
        nextNode = new Trie();
        (node.map ??= new Map()).set(codePoint, nextNode);
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
   *
   * 热路径请用 {@link matchLongestInto}（免分配变体，语义一致）——两边改其一必同步另一个。
   */
  findLongestMatch(input: string, start: number): { end: number; value: string | undefined } {
    // 同 addWord:charCodeAt + 手动配对(热循环写法统一,见 addWord 注释)。
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let node: Trie | undefined = this;
    let matchEnd = 0;
    let matchValue: string | undefined;
    for (let j = start; j < input.length && node; ) {
      let codePoint = input.charCodeAt(j);
      let step = 1;
      if (codePoint >= 0xd800 && codePoint <= 0xdbff && j + 1 < input.length) {
        const lo = input.charCodeAt(j + 1);
        if (lo >= 0xdc00 && lo <= 0xdfff) {
          codePoint = (codePoint - 0xd800) * 0x400 + (lo - 0xdc00) + 0x10000;
          step = 2;
        }
      }
      j += step;
      const nextNode: Trie | undefined = node.map?.get(codePoint);
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
   * findLongestMatch 的免分配变体:结果写进调用方复用的 `out`,不造对象。
   * 给每个位置都要探一次的热调用方用(maskWithTrie 一个位置一次——对象版
   * 在 4 万字语料上就是 4 万次 {end,value} 分配)。语义与 findLongestMatch
   * 完全一致,改其一必同步另一个。
   */
  matchLongestInto(input: string, start: number, out: { end: number; value: string | undefined }): void {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let node: Trie | undefined = this;
    out.end = 0;
    out.value = undefined;
    const length = input.length;
    for (let j = start; j < length && node; ) {
      let codePoint = input.charCodeAt(j);
      let step = 1;
      if (codePoint >= 0xd800 && codePoint <= 0xdbff && j + 1 < length) {
        const lo = input.charCodeAt(j + 1);
        if (lo >= 0xdc00 && lo <= 0xdfff) {
          codePoint = (codePoint - 0xd800) * 0x400 + (lo - 0xdc00) + 0x10000;
          step = 2;
        }
      }
      j += step;
      const nextNode: Trie | undefined = node.map?.get(codePoint);
      if (!nextNode) break;
      node = nextNode;
      if (node.value !== undefined) {
        out.end = j;
        out.value = node.value;
      }
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
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      let currentNode: Trie | undefined = this;
      let matchEnd = 0;
      let matchValue: string | undefined;

      // Find the longest match starting at position i
      // (charCodeAt + 手动配对,写法统一见 addWord 注释;实测 convert 1.30×)
      for (let j = i; j < length && currentNode; ) {
        let codePoint = input.charCodeAt(j);
        let step = 1;
        if (codePoint >= 0xd800 && codePoint <= 0xdbff && j + 1 < length) {
          const lo = input.charCodeAt(j + 1);
          if (lo >= 0xdc00 && lo <= 0xdfff) {
            codePoint = (codePoint - 0xd800) * 0x400 + (lo - 0xdc00) + 0x10000;
            step = 2;
          }
        }
        j += step;

        const nextNode: Trie | undefined = currentNode.map?.get(codePoint);
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
        i += isSurrogatePair(input, i, length) ? 2 : 1;
      }
    }

    // Flush remaining original text
    if (originalStart !== null) {
      result.push(input.slice(originalStart, length));
    }

    return result.join("");
  }

  /**
   * Split input into segments on this trie's entries, longest match first.
   *
   * Every matched entry becomes its own segment, and the runs between them are
   * emitted as segments too, so `segments.join("")` reconstructs the input
   * exactly. Nothing is converted here — only cut.
   *
   * Exists for {@link ConverterFactoryWithSegmentation}; see there for why the
   * cut changes results.
   *
   * @param input - The string to split
   * @returns Segments whose concatenation equals `input`
   */
  segment(input: string): string[] {
    const segments: string[] = [];
    const length = input.length;
    let originalStart: number | null = null;

    for (let i = 0; i < length; ) {
      // Inlined longest-match walk, same as `convert`. Calling
      // `findLongestMatch` here instead would allocate a `{ end, value }`
      // object at every position — on Chinese text that is roughly one
      // short-lived object per character, and segmentation already runs an
      // extra full pass. Measured worth keeping inline.
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      let node: Trie | undefined = this;
      let end = 0;
      for (let j = i; j < length && node; ) {
        let codePoint = input.charCodeAt(j);
        let step = 1;
        if (codePoint >= 0xd800 && codePoint <= 0xdbff && j + 1 < length) {
          const lo = input.charCodeAt(j + 1);
          if (lo >= 0xdc00 && lo <= 0xdfff) {
            codePoint = (codePoint - 0xd800) * 0x400 + (lo - 0xdc00) + 0x10000;
            step = 2;
          }
        }
        j += step;
        const nextNode: Trie | undefined = node.map?.get(codePoint);
        if (!nextNode) break;
        node = nextNode;
        if (node.value !== undefined) end = j;
      }

      if (end > i) {
        if (originalStart !== null) {
          segments.push(input.slice(originalStart, i));
          originalStart = null;
        }
        segments.push(input.slice(i, end));
        i = end;
      } else {
        if (originalStart === null) {
          originalStart = i;
        }
        i += isSurrogatePair(input, i, length) ? 2 : 1;
      }
    }

    if (originalStart !== null) {
      segments.push(input.slice(originalStart, length));
    }

    return segments;
  }
}

/**
 * CJK Compatibility Ideographs, both blocks: U+F900..U+FAFF and
 * U+2F800..U+2FA1F. Characters here duplicate unified ideographs and exist
 * only to round-trip legacy encodings — 類 U+F9D0 renders the same as
 * 類 U+985E but is a different code point, so it misses dictionary lookups,
 * searches and string comparisons.
 */
// ⚠ 端点一律写转义，不要写字面字符。这里原来是字面的「豈」，本意 U+F900
// （CJK 兼容汉字），但它和 U+8C48（普通汉字）**字形完全一样**，某次被 NFC
// 归一化悄悄换掉了——范围于是从 [F900,FAFF] 变成 [8C48,FAFF]，覆盖了大半常用
// 汉字和整个 PUA。输出仍然正确（normalize 对普通字是恒等），只是每段中文都要
// 白跑一遍 replace。肉眼、grep、测试全都看不出来，只有把端点打成码位才现形。
const COMPATIBILITY_IDEOGRAPHS = /[\uF900-\uFAFF\u{2F800}-\u{2FA1F}]/gu;

/**
 * Fold CJK Compatibility Ideographs to their unified equivalents.
 *
 * OpenCC does this with a 1002-entry dictionary
 * (`CJK_Compatibility_Ideographs`) loaded as a normalization step by every
 * config. **We ship no such table.** Those mappings are canonical singleton
 * decompositions in the Unicode standard, which is precisely what
 * `String.prototype.normalize` performs — checked entry by entry against
 * opencc-js's copy: all 1002 agree, and NFC folds nothing the table misses.
 * So ~8.7 KB of data becomes a call into the engine's own ICU, which has the
 * side benefit of tracking new Unicode versions without a resync.
 *
 * Two deliberate details:
 *
 * 1. **NFC, not NFKC.** NFKC would also fold full-width forms (`，`→`,`,
 *    `Ａ`→`A`) and enclosed characters (`㈱`→`(株)`). In Chinese prose that is
 *    destructive: full-width punctuation is correct typography, not a
 *    compatibility artifact.
 * 2. **Only the two compatibility blocks are touched**, not the whole string.
 *    Whole-string NFC would also compose combining sequences the caller never
 *    asked us to touch. The pre-test means ordinary text — which has no
 *    compatibility ideographs at all — is returned as-is with no allocation.
 *
 * @param input - The string to normalize
 * @returns The string with compatibility ideographs folded
 */
export function normalizeCompatibilityIdeographs(input: string): string {
  // 手写 charCodeAt 预扫描,正则 .test 的 5×(0.68 → 0.14 ms / 4 万字):
  // 兼容区只有两段——BMP 的 U+F900–FAFF,和增补区 U+2F800–2FA1F(整段的高代理
  // 恰好都是 U+D87E)。汉字主体 U+4E00–9FFF 一次比较出局。扫描判据是正则的
  // 超集(D87E 也覆盖 U+2FA20–2FBFF),命中了才交给正则精确判——所以只会多走
  // 慢路径,不会漏。
  let hit = false;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    if ((c >= 0xf900 && c <= 0xfaff) || c === 0xd87e) {
      hit = true;
      break;
    }
  }
  if (!hit) return input;
  COMPATIBILITY_IDEOGRAPHS.lastIndex = 0;
  if (!COMPATIBILITY_IDEOGRAPHS.test(input)) return input;
  COMPATIBILITY_IDEOGRAPHS.lastIndex = 0;
  return input.replace(COMPATIBILITY_IDEOGRAPHS, (char) => char.normalize("NFC"));
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
    return tries.reduce((text, trie) => trie.convert(text), normalizeCompatibilityIdeographs(input));
  };
}

/**
 * Like {@link ConverterFactory}, but cuts the input into segments first and
 * runs every conversion step **inside each segment** instead of across the
 * whole string.
 *
 * ## What this is for
 *
 * With a two-step chain (`cn → t`, then `t → tw`), the second step sees text
 * the first step produced. Without segmentation it can match across a word
 * boundary the first step established, and the regional vocabulary tables
 * (`TWPhrases`, `HKPhrases`) then fire in places OpenCC does not fire them.
 * Measured against OpenCC's own output on 1707 phrases in context, dropping
 * segmentation changes 21 of them — always by over-applying:
 *
 * ```text
 * 他优化了   OpenCC 他優化了    no segmentation 他最佳化了
 * 他函数了   OpenCC 他函數了    no segmentation 他函式了
 * 他宽带了   OpenCC 他寬帶了    no segmentation 他寬頻了
 * ```
 *
 * Note the bare phrase still converts (`优化` → `最佳化`) either way. It is
 * only *in context* that the boundary matters, which is what makes the bug
 * easy to miss with word-list tests.
 *
 * ## Which dictionary to cut on
 *
 * The segmentation dictionary must be keyed in the **input's** script, since
 * it is the raw input being cut: OpenCC uses `STPhrases` for `s2*` and
 * `TSPhrases` for `*2s`. {@link segmentationDictsFor} encodes that choice.
 *
 * ## Cost
 *
 * One extra trie walk plus per-segment string handling — roughly 2× the
 * conversion time (0.73 ms → 1.45 ms on a 15 000-character chapter, which cut
 * into ~5200 segments). Only chains with two or more steps need it, and
 * {@link segmentationDictsFor} returns nothing for the rest, so single-step
 * conversions keep the cheap path.
 *
 * @param segmentation - Dictionary group to cut on, or `null` for no cutting
 * @param dictGroups - Conversion steps, applied in order within each segment
 * @returns Converter function
 */
export function ConverterFactoryWithSegmentation(segmentation: DictGroup | null, ...dictGroups: DictGroup[]): (input: string) => string {
  if (!segmentation || segmentation.length === 0) {
    return ConverterFactory(...dictGroups);
  }

  const segmenter = new Trie();
  segmenter.loadDictGroup(segmentation);
  const tries = dictGroups.map((group) => {
    const trie = new Trie();
    trie.loadDictGroup(group);
    return trie;
  });

  return function convert(input: string): string {
    const segments = segmenter.segment(normalizeCompatibilityIdeographs(input));
    return tries.reduce((current, trie) => current.map((segment) => trie.convert(segment)), segments).join("");
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
 *
 * Rules must not contain PUA characters (U+E000..U+F8FF) — throws TypeError at
 * build time. This was documented-but-unenforced for a while: a PUA char inside
 * a rule VALUE can collide with an allocated placeholder and get swapped for a
 * different rule's value at restore time. That failure needs two rules plus a
 * specific allocation order, so it would surface as rare, unreproducible
 * corruption — exactly the kind of bug a constructor throw is cheapest against.
 * (PUA in user INPUT text is fine — the input scan routes around it.)
 */
/**
 * PUA 字符（U+E000..U+F8FF）是 ProtectedConverter 的内部占位符段，规则里不能有它。
 *
 * 危害不是假设的：规则**值**里的 PUA 可能撞上分配出去的占位符，还原时被换成另一条
 * 规则的值——要两条规则加特定分配顺序才触发，表现为罕见且无法复现的串词。
 *
 * 处理方式是**静默剥掉**，不是抛错。理由：这些字符肉眼不可见，用户看到的规则本来就是
 * 剥掉之后那个样子；而规则常常来自最终用户（粘贴 / 导入 / localStorage 里的历史数据），
 * 抛错等于把库的内部不变式变成每个调用方都要先洗一遍的负担。剥完为空的键值对整条跳过，
 * 与 `Trie.loadDict` 对畸形条目的一贯宽容度一致。
 *
 * 用户**输入文本**里的 PUA 不受影响——那是数据，掩码分配器会绕开它们走。
 */
function stripPUA(text: string): string {
  // 转义写法，不写裸字符——裸 PUA 在多数编辑器里完全不可见。
  return text.replace(/[\uE000-\uF8FF]/g, "");
}

function sanitizeRules(protectedDict: DictLike): string[][] {
  const entries: Array<readonly string[]> =
    typeof protectedDict === "string"
      ? protectedDict.split("|").map((e) => {
          const i = e.indexOf(" ");
          return i < 0 ? [e] : [e.slice(0, i), e.slice(i + 1)];
        })
      : protectedDict;
  const out: string[][] = [];
  for (const entry of entries) {
    const key = stripPUA(entry[0] ?? "");
    const value = stripPUA(entry[1] ?? "");
    if (key && value) out.push([key, value]);
  }
  return out;
}

export function ProtectedConverter(
  protectedDict: DictLike,
  innerConvert: (input: string) => string
): (input: string) => string {
  const trie = new Trie();
  trie.loadDict(sanitizeRules(protectedDict));

  return function convert(input: string): string {
    const slotsByCode = new Map<number, string>();
    const valueToPlaceholder = new Map<string, string>();
    const masked = maskWithTrie(input, trie, slotsByCode, valueToPlaceholder);
    const converted = innerConvert(masked);
    return restorePlaceholders(converted, slotsByCode);
  };
}

/**
 * Reverse a packed dict string ("k1 v1|k2 v2") into `[value, key][]` entries.
 * The value is everything after the FIRST space (values may contain spaces,
 * e.g. 二维码 → "QR Code") — same rule as `Trie.loadDict`'s string form.
 *
 * Collision policy, identical to `reverseEntries` in scripts/sync-opencc.ts:
 * when several keys share one value (U盘/优盘 → 隨身碟) the FIRST key wins,
 * because dicts list the preferred term first and the trie is last-wins — so
 * without this the trailing synonym takes over (隨身碟 → 优盘). An identity pair
 * outranks that, leaving the term untouched rather than guessing a synonym.
 *
 * Entries with no separator are skipped, as `Trie.loadDict` does.
 */
export function reverseDictString(data: string): string[][] {
  const reversed = new Map<string, string>();
  for (const entry of data.split("|")) {
    const sep = entry.indexOf(" ");
    if (sep < 0) continue;
    const key = entry.slice(0, sep);
    const value = entry.slice(sep + 1);
    if (!reversed.has(value) || key === value) reversed.set(value, key);
  }
  return [...reversed];
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
  // layers, or plain user data). Their ONLY consumer is allocateCode below —
  // matching needs no per-char passthrough branch: the constructor guarantees
  // rules contain no PUA, so no trie match can ever cover a PUA char and it
  // falls into the unmatched run untouched. (PUA is Plane 0 → plain charCodeAt
  // scan, no surrogate pairing needed; measured ~5× over the for..of version.)
  const existingPUA = new Set<number>();
  for (let k = 0; k < input.length; k++) {
    const cp = input.charCodeAt(k);
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

  // Inlined longest-match walk + run slicing, same shape as Trie.convert:
  // the previous version called findLongestMatch per position (one {end,value}
  // allocation per character) and pushed per-char substrings (one string per
  // character even with zero matches). One PC layer cost +2.7 ms on a 40k-char
  // corpus — nearly doubling the whole pipeline; this rewrite makes the
  // no-match path allocation-free.
  const result: string[] = [];
  const length = input.length;
  let originalStart: number | null = null;
  const hit: { end: number; value: string | undefined } = { end: 0, value: undefined };
  for (let i = 0; i < length; ) {
    trie.matchLongestInto(input, i, hit);
    const matchEnd = hit.end;
    const matchValue = hit.value;
    if (matchEnd > 0 && matchValue !== undefined) {
      if (originalStart !== null) {
        result.push(input.slice(originalStart, i));
        originalStart = null;
      }
      let placeholder = valueToPlaceholder.get(matchValue);
      if (placeholder === undefined) {
        const code = allocateCode();
        placeholder = String.fromCodePoint(code);
        valueToPlaceholder.set(matchValue, placeholder);
        slotsByCode.set(code, matchValue);
      }
      result.push(placeholder);
      i = matchEnd;
    } else {
      if (originalStart === null) originalStart = i;
      i += isSurrogatePair(input, i, length) ? 2 : 1;
    }
  }
  if (originalStart !== null) result.push(input.slice(originalStart, length));
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
  // Run slicing instead of one push per character: placeholders are Plane-0
  // PUA, so a plain charCodeAt compare finds them and everything between two
  // placeholders is emitted as a single slice. The per-char version allocated
  // 40k single-char strings to restore 3 placeholders.
  const result: string[] = [];
  const length = text.length;
  let runStart = 0;
  for (let i = 0; i < length; i++) {
    const cp = text.charCodeAt(i);
    if (cp >= PROTECT_PLACEHOLDER_BASE && cp <= PROTECT_PLACEHOLDER_END) {
      const restored = slotsByCode.get(cp);
      if (restored !== undefined) {
        if (runStart < i) result.push(text.slice(runStart, i));
        result.push(restored);
        runStart = i + 1;
      }
      // 不在本层 map 里的 PUA(外层的占位符/用户数据)留在 run 里原样通过
    }
  }
  if (runStart === 0) return text;
  if (runStart < length) result.push(text.slice(runStart, length));
  return result.join("");
}
