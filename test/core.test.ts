import { describe, it, expect } from "vitest";
import { Trie, CustomConverter, ConverterFactory, ProtectedConverter, parseOpenCCDict } from "../src/core.js";

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
