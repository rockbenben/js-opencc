import { describe, it, expect } from "vitest";
import { Trie, CustomConverter, ConverterFactory } from "../src/core.js";

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
