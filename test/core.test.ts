import { describe, it, expect } from "vitest";
import { Trie, CustomConverter, ConverterFactory, ProtectedConverter, parseOpenCCDict, reverseDictString } from "../src/core.js";

describe("Trie", () => {
  it("should add and convert single word", () => {
    const trie = new Trie();
    trie.addWord("你好", "您好");

    expect(trie.convert("你好世界")).toBe("您好世界");
  });

  it("should handle longest match", () => {
    const trie = new Trie();
    trie.addWord("中", "中");
    trie.addWord("中国", "中國");
    trie.addWord("中国人", "中國人");

    expect(trie.convert("中国人民")).toBe("中國人民");
  });

  it("should load dictionary from string", () => {
    const trie = new Trie();
    trie.loadDict("软件 軟體|硬件 硬體");

    expect(trie.convert("软件和硬件")).toBe("軟體和硬體");
  });

  it("should load dictionary from array", () => {
    const trie = new Trie();
    trie.loadDict([
      ["电脑", "電腦"],
      ["手机", "手機"],
    ]);

    expect(trie.convert("电脑和手机")).toBe("電腦和手機");
  });

  // Regression (B6): string-form values may contain spaces. Splitting on every
  // space would drop everything after the first value token.
  it("should keep multi-token values intact when loading from string", () => {
    const trie = new Trie();
    trie.loadDict("AB alpha beta|C gamma");

    expect(trie.convert("AB")).toBe("alpha beta");
    expect(trie.convert("C")).toBe("gamma");
  });

  it("should expose findLongestMatch primitive", () => {
    const trie = new Trie();
    trie.addWord("中国", "中國");
    trie.addWord("中国人", "中國人");

    // 最长匹配从位置 0 开始
    const m1 = trie.findLongestMatch("中国人民万岁", 0);
    expect(m1).toEqual({ end: 3, value: "中國人" });

    // 从位置 1 开始（"国人民"）无匹配
    const m2 = trie.findLongestMatch("中国人民万岁", 1);
    expect(m2).toEqual({ end: 0, value: undefined });
  });
});

describe("CustomConverter", () => {
  it("should create converter from array", () => {
    const convert = CustomConverter([
      ["测试", "測試"],
      ["代码", "代碼"],
    ]);

    expect(convert("测试代码")).toBe("測試代碼");
  });

  it("should create converter from string", () => {
    const convert = CustomConverter("测试 測試|成功 成功");

    expect(convert("测试成功")).toBe("測試成功");
  });
});

describe("ConverterFactory", () => {
  it("should chain multiple dictionary groups", () => {
    const convert = ConverterFactory(
      [
        [
          ["软", "軟"],
          ["件", "體"],
        ],
      ],
      [[["軟體", "軟件"]]]
    );

    // First pass: 软 -> 軟, 件 -> 體 => 軟體
    // Second pass: 軟體 -> 軟件
    expect(convert("软件")).toBe("軟件");
  });
});

describe("ProtectedConverter", () => {
  it("规则里的 PUA 字符被静默剥掉，不抛错（U+E000..U+F8FF 是内部占位符段）", () => {
    // 早先这里是抛 TypeError。改成剥离的理由：这些字符肉眼不可见，用户看到的规则
    // 本来就是剥掉之后那个样子；而规则常常来自最终用户（粘贴 / 导入 / localStorage
    // 里的历史数据），抛错等于把库的内部不变式变成每个调用方都要先洗一遍的负担。
    // PUA 一律写 \uE000 转义，别写裸字符。
    const inner = (x: string): string => x;
    expect(ProtectedConverter([["软\uE000件", "軟體"]], inner)("软件")).toBe("軟體");
    expect(ProtectedConverter([["软件", "軟\uF8FF體"]], inner)("软件")).toBe("軟體");
    expect(ProtectedConverter("软\uE000件 軟體", inner)("软件")).toBe("軟體");
  });

  it("规则剥完变空的一侧，整条跳过而不是把空串塞进 trie", () => {
    const inner = (x: string): string => x;
    expect(ProtectedConverter([["\uE000", "某值"]], inner)("某值")).toBe("某值");
    expect(ProtectedConverter([["某键", "\uE000\uE000"]], inner)("某键")).toBe("某键");
  });

  it("字符串形式的规则表：分隔、含空格的值、缺分隔符的条目都和 loadDict 一致", () => {
    // 规则清洗把字符串形式拆成键值对再重建，这一步容易和 loadDict 的解析口径分叉：
    // 值可以含空格（`二维码 QR Code`），没有分隔符的条目要整条跳过。
    const inner = (x: string): string => x;
    expect(ProtectedConverter("二维码 QR Code", inner)("二维码")).toBe("QR Code");
    expect(ProtectedConverter("a b|c d", inner)("ac")).toBe("bd");
    expect(ProtectedConverter("nosep", inner)("nosep")).toBe("nosep");
    expect(ProtectedConverter("", inner)("x")).toBe("x");
    expect(ProtectedConverter("k ", inner)("k")).toBe("k");
  });

  it("畸形的单元素条目按 loadDict 的一贯做法跳过，不崩", () => {
    // 规则清洗要和 loadDict 一样宽容：[["a"]] 的 value 是 undefined，
    // 早先一版在这里读 undefined.replace 崩出过一句和 PUA 毫无关系的报错。
    const inner = (s: string): string => s;
    const c = ProtectedConverter([["a"]] as unknown as string[][], inner);
    expect(c("ab")).toBe("ab");
  });

  it("passes PUA characters in the INPUT through untouched (they are data, not placeholders)", () => {
    // 拦的是规则里的 PUA；用户文本里的 PUA 是数据，掩码分配器会绕开它们。
    // U+E000 恰好是分配器的第一个候选槽位——占用它，逼分配器让位。
    const inner = ConverterFactory([[["B", "X"]]]);
    const convert = ProtectedConverter([["A", "B"]], inner);
    expect(convert("\uE000A\uE000")).toBe("\uE000B\uE000");
  });

  it("should mask and restore, bypassing inner converter", () => {
    // Inner: B → X
    const inner = ConverterFactory([[["B", "X"]]]);
    // Protected: A → B
    const convert = ProtectedConverter([["A", "B"]], inner);
    // 软覆盖（旧软语义）：A → B → X
    // 硬覆盖（新）：A 被 mask 为 PUA，inner 看不到 A 也看不到 B；restore 后 B
    expect(convert("A")).toBe("B");
  });

  it("should pass non-matched text to inner converter", () => {
    const inner = ConverterFactory([[["X", "Y"]]]);
    const convert = ProtectedConverter([["A", "B"]], inner);
    // 完全无匹配 → 走 inner
    expect(convert("X")).toBe("Y");
    // 部分匹配：A 走 protected，X 走 inner
    expect(convert("AX")).toBe("BY");
  });

  it("should be stackable: each layer allocates distinct PUA slots and restores its own", () => {
    const innermost = ConverterFactory([[["X", "Y"]]]);
    const layer2 = ProtectedConverter([["B", "M"]], innermost);
    const layer1 = ProtectedConverter([["A", "Z"]], layer2);
    // Trace:
    //   layer1.mask    "AB X"       → "<P1>B X"       (P1 for "Z")
    //   layer2.mask    "<P1>B X"    → "<P1><P2> X"    (P2 skips P1)
    //   innermost      "<P1><P2> X" → "<P1><P2> Y"    (X→Y; PUA passes through)
    //   layer2.restore               → "<P1>M Y"       (P2→M; P1 is outer's, kept)
    //   layer1.restore               → "ZM Y"
    expect(layer1("AB X")).toBe("ZM Y");
  });

  it("PUA 密集的用户数据穿过多层嵌套不受损（掩码主循环删掉透传分支后的守卫）", () => {
    // maskWithTrie 原来在主循环里逐字符查 existingPUA 做透传，优化时删掉了，
    // 论证是「构造期守卫保证规则里没有 PUA ⇒ 任何 trie 匹配都盖不到 PUA 字符」。
    // 那条论证只在这里被压过：PUA 与规则字符交错、且套三层。
    // existingPUA 表本身仍然要留着——它是槽位分配的避让依据。
    const inner = ConverterFactory([[["X", "Y"]]]);
    const l3 = ProtectedConverter([["C", "c3"]], inner);
    const l2 = ProtectedConverter([["B", "b2"]], l3);
    const l1 = ProtectedConverter([["A", "a1"]], l2);
    const pua = "\uE000\uE100\uF8FF";
    expect(l1(pua + "ABC")).toBe(pua + "a1b2c3");
    expect(l1("A" + pua + "B" + pua + "C")).toBe("a1" + pua + "b2" + pua + "c3");
    expect(l1("\uE000".repeat(200) + "X")).toBe("\uE000".repeat(200) + "Y");
  });

  it("should be a no-op when protectedDict is empty", () => {
    const inner = ConverterFactory([[["A", "Z"]]]);
    const convert = ProtectedConverter([], inner);
    // 空字典 trie 永远不匹配，输入原样流入 inner
    expect(convert("AB")).toBe("ZB");
  });

  it("should reuse placeholder for identical target values", () => {
    // 1000 条规则，但所有 to 都是 "锁定"
    const rules: string[][] = Array.from({ length: 1000 }, (_, i) => [`src${i}`, "锁定"]);
    const inner = ConverterFactory([[["锁定", "X"]]]);
    const convert = ProtectedConverter(rules, inner);
    // 即使 1000 条规则，valueToPlaceholder 只占 1 槽（"锁定" 共用）
    expect(convert("src1 src500 src999")).toBe("锁定 锁定 锁定");
  });

  it("should apply longest match within protectedDict", () => {
    const inner = ConverterFactory([[["X", "X"]]]);
    const convert = ProtectedConverter(
      [
        ["中国", "Z"],
        ["中国人民", "ZZZZ"],
      ],
      inner
    );
    // 最长优先："中国人民" → "ZZZZ"，不是 "中国" → "Z" 再继续
    expect(convert("中国人民万岁")).toBe("ZZZZ万岁");
  });

  it("should throw when distinct target values exceed PUA range", () => {
    // 6401 条规则，每条 target 唯一 → 触发 RangeError
    const rules: string[][] = Array.from({ length: 6401 }, (_, i) => [`src${i}`, `dst${i}`]);
    const inner = (s: string) => s;
    const convert = ProtectedConverter(rules, inner);
    // 构造能命中所有 6401 个 src 的输入
    const input = rules.map(([s]) => s).join("");
    expect(() => convert(input)).toThrow(RangeError);
  });
});

describe("parseOpenCCDict", () => {
  it("should parse simple tab-separated entries", () => {
    const text = "你好\t您好\n世界\t地球";
    expect(parseOpenCCDict(text)).toEqual([
      ["你好", "您好"],
      ["世界", "地球"],
    ]);
  });

  it("should skip comments and blank lines", () => {
    const text = [
      "# This is a comment",
      "",
      "  # Indented comment",
      "你好\t您好",
      "",
      "  # Another comment   ",
      "世界\t地球",
      "",
    ].join("\n");
    expect(parseOpenCCDict(text)).toEqual([
      ["你好", "您好"],
      ["世界", "地球"],
    ]);
  });

  it("should take the first space-separated value when multiple candidates exist", () => {
    const text = "干\t幹 乾";
    expect(parseOpenCCDict(text)).toEqual([["干", "幹"]]);
  });

  it("should accept CRLF line endings", () => {
    const text = "你好\t您好\r\n世界\t地球\r\n";
    expect(parseOpenCCDict(text)).toEqual([
      ["你好", "您好"],
      ["世界", "地球"],
    ]);
  });

  it("should fall back to whitespace separator if no tab is present", () => {
    const text = "你好 您好\n世界  地球";
    expect(parseOpenCCDict(text)).toEqual([
      ["你好", "您好"],
      ["世界", "地球"],
    ]);
  });

  it("should produce output compatible with protectedDict", async () => {
    // Integration check: parsed output flows directly into createConverter.
    const text = "你好\tHELLO";
    const dict = parseOpenCCDict(text);
    // (This test stays in core.test.ts; use ProtectedConverter directly
    //  rather than createConverter to avoid the async dict loader.)
    const inner = ConverterFactory([[["X", "Y"]]]);
    const convert = ProtectedConverter(dict, inner);
    expect(convert("你好 X")).toBe("HELLO Y");
  });
});

describe("reverseDictString", () => {
  it("keeps the whole value, which may contain spaces", () => {
    expect(reverseDictString("二维码 QR Code")).toEqual([["QR Code", "二维码"]]);
  });

  // Regression: reversal had no collision policy, so the trie's last-wins rule
  // handed the value to the LAST synonym — 隨身碟 reversed to 优盘 rather than
  // the preferred term the dict lists first.
  it("gives a shared value to the FIRST key", () => {
    expect(reverseDictString("U盘 隨身碟|优盘 隨身碟")).toEqual([["隨身碟", "U盘"]]);
  });

  // Matches reverseEntries in sync-opencc: an identity pair beats an earlier
  // synonym, so an ambiguous term is left alone rather than guessed at.
  it("lets an identity pair override an earlier key", () => {
    expect(reverseDictString("优盘 隨身碟|隨身碟 隨身碟")).toEqual([["隨身碟", "隨身碟"]]);
  });

  // Regression: a separator-less entry fabricated [entry, entry-minus-last-char]
  // instead of being skipped, so 幼稚園 mapped to 幼稚.
  it("skips entries with no separator instead of truncating them", () => {
    expect(reverseDictString("幼稚園")).toEqual([]);
    expect(reverseDictString("幼稚園|你好 您好")).toEqual([["您好", "你好"]]);
  });
});

describe("Trie 的子节点按需分配", () => {
  it("叶子节点不持有 Map（一半节点是叶子，空 Map 不是免费的）", () => {
    const trie = new Trie();
    trie.loadDict("头发 頭髮|发现 發現");
    // 走到 `发`（有子节点）和 `髮`（叶子）两类节点，直接看私有字段：
    // 这条断言守的是内存形状，不是行为——行为由下面那条守
    const root = trie as unknown as { map?: Map<number, unknown> };
    expect(root.map, "根节点有子节点，必须有 Map").toBeDefined();
    const leafOf = (node: { map?: Map<number, unknown> }): { map?: Map<number, unknown> } => {
      let cur = node;
      while (cur.map && cur.map.size > 0) cur = [...cur.map.values()][0] as typeof cur;
      return cur;
    };
    expect(leafOf(root).map, "叶子节点不该分配 Map").toBeUndefined();
  });

  it("按需分配不改变任何匹配行为", () => {
    const trie = new Trie();
    trie.loadDict("头发 頭髮|发现 發現|头 X");
    // 叶子、中间节点、最长匹配优先、不匹配回落，四条路径都走一遍
    expect(trie.convert("头发")).toBe("頭髮");
    expect(trie.convert("头")).toBe("X");
    expect(trie.convert("发现")).toBe("發現");
    expect(trie.convert("头发和发现")).toBe("頭髮和發現");
    expect(trie.convert("无关")).toBe("无关");
    expect(trie.findLongestMatch("头发", 0)).toEqual({ end: 2, value: "頭髮" });
    expect(trie.findLongestMatch("无", 0).end).toBe(0);
    expect(trie.segment("头发和发现")).toEqual(["头发", "和", "发现"]);
  });
});
