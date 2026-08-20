/**
 * 畸形 UTF-16（孤立代理）与兼容汉字范围的回归。
 *
 * 这两条都是「实测检查」轮里穷举出来的，而**常规手段一个都发现不了**：
 * 真实词典和 556 官方用例里没有孤立代理，整段语料对拍也不会造出来。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { Trie, normalizeCompatibilityIdeographs } from "../src/core.js";

const HI = "\uD800"; // 孤立高代理
const LO = "\uDC00"; // 孤立低代理

describe("孤立代理不吞字符", () => {
  // 热循环从 codePointAt 换成 charCodeAt 之后，「不匹配时步进」只判高代理就跳 2，
  // 会把孤立高代理后面那个字符一起吞进未匹配段——它再也参与不了匹配，输出少转
  // 一处、不报错、不崩。修法是 isSurrogatePair() 必须校验低代理。
  const trie = new Trie();
  trie.loadDict([
    ["𠀀", "[A]"],
    ["𠀀好", "[B]"],
    ["好", "[C]"],
  ]);

  it.each([
    [HI + "好", HI + "[C]"],
    ["好" + HI, "[C]" + HI],
    [LO + "好", LO + "[C]"],
    ["\uD842好", "\uD842[C]"], // 𠀀 的高代理单独出现，后面跟正常字
    [HI + "𠀀", HI + "[A]"],
    ["𠀀好", "[B]"], // 正控：真代理对仍走最长匹配
  ])("convert(%j) === %j", (input, want) => {
    expect(trie.convert(input)).toBe(want);
  });

  it("segment() 的 join 恒等式在畸形输入下也成立", () => {
    for (const input of [HI + "好", "好" + LO, HI + LO, "𠀀" + HI + "好"]) {
      expect(trie.segment(input).join("")).toBe(input);
    }
  });
});

describe("兼容汉字范围", () => {
  // 正则端点原来写的是**字面字符**「豈」，本意 U+F900（兼容汉字），但它和
  // U+8C48（普通汉字）字形完全一样，某次被 NFC 归一化悄悄换成了后者——范围
  // 从 [F900,FAFF] 变成 [8C48,FAFF]。输出仍然正确（normalize 对普通字是恒等），
  // 所以任何输出对拍都发现不了，只有把端点打成码位才现形。
  it("U+8C48（旧的误伤起点）原样不动", () => {
    const text = "前" + String.fromCodePoint(0x8c48) + "后";
    expect(normalizeCompatibilityIdeographs(text)).toBe(text);
  });

  it("正则端点写成转义且起点是 F900（源码级，行为测不出来）", () => {
    // 这一条必须查源码文本,不能查行为:快路径预扫描只认 [F900,FAFF],
    // 端点就算退回 U+8C48 也永远走不到正则,任何输出对拍都是绿的。
    // 而端点一旦写成字面字符,下一次 NFC 归一化又会把它换掉。
    const src = readFileSync(new URL("../src/core.ts", import.meta.url), "utf8");
    const line = src.split("\n").find((l) => l.includes("const COMPATIBILITY_IDEOGRAPHS"));
    expect(line, "没找到 COMPATIBILITY_IDEOGRAPHS 声明——改名了就同步这条测试").toBeDefined();
    expect(line).toContain("\\uF900-\\uFAFF");
    // 端点区间里不许出现字面字符（U+F900–FAFF 全域）
    for (const ch of line!) {
      const c = ch.charCodeAt(0);
      expect(c >= 0xf900 && c <= 0xfaff, `正则里有字面兼容汉字 U+${c.toString(16)}`).toBe(false);
    }
  });

  it("两个兼容区全域逐字符折叠正确", () => {
    const wrong: string[] = [];
    for (const [lo, hi] of [
      [0xf900, 0xfaff],
      [0x2f800, 0x2fa1f],
    ]) {
      for (let cp = lo; cp <= hi; cp++) {
        const ch = String.fromCodePoint(cp);
        const want = "前" + ch.normalize("NFC") + "后";
        if (normalizeCompatibilityIdeographs("前" + ch + "后") !== want) {
          wrong.push("U+" + cp.toString(16).toUpperCase());
        }
      }
    }
    expect(wrong, wrong.slice(0, 10).join(" ")).toEqual([]);
  });

  it("快路径预扫描不漏：正则命中的字符，函数必定处理", () => {
    // 快路径（手写 charCodeAt 预扫描）判据必须是正则的超集，否则会跳过该转的字。
    const RE = /[\uF900-\uFAFF\u{2F800}-\u{2FA1F}]/u;
    const missed: string[] = [];
    for (let cp = 0; cp <= 0x10ffff; cp++) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue;
      const ch = String.fromCodePoint(cp);
      if (!RE.test(ch)) continue;
      if (normalizeCompatibilityIdeographs(ch) === ch && ch.normalize("NFC") !== ch) {
        missed.push("U+" + cp.toString(16).toUpperCase());
      }
    }
    expect(missed, missed.slice(0, 10).join(" ")).toEqual([]);
  });

  it("全角标点与谚文不受影响（NFKC 才会动它们）", () => {
    const text = "，。！？（）ＡＢ１２한글";
    expect(normalizeCompatibilityIdeographs(text)).toBe(text);
  });
});
