import { describe, it, expect } from "vitest";
import { createConverter, getDictFiles } from "../src/converter.js";
import type { LocaleCode } from "../src/converter.js";

describe("createConverter", () => {
  it("should convert cn to tw", async () => {
    const convert = await createConverter({ from: "cn", to: "tw" });

    // Test basic character conversion (Simplified -> Traditional)
    // STCharacters: 汉 -> 漢, 语 -> 語
    expect(convert("汉语")).toBe("漢語");
    expect(convert("国家")).toBe("國家");
  });

  it("should convert cn to twp (with phrases)", async () => {
    const convert = await createConverter({ from: "cn", to: "twp" });

    // TWP includes IT phrase conversion (e.g., 软件 -> 軟體)
    expect(convert("软件")).toBe("軟體");

    // CNTWPhrases should also be loaded for twp: 幼儿园 -> 幼稚園
    expect(convert("幼儿园")).toBe("幼稚園");
  });

  // Regression: phrase dictionaries with SIMPLIFIED keys (STPhrases) must apply.
  // The per-file grouping bug ran STCharacters first, char-converting the source
  // before STPhrases could match its simplified keys, so every one-to-many char
  // resolved by its first character-dict value (头发→頭發 instead of 頭髮). The
  // "cn to twp" test above did NOT catch this because TWPhrases keys are
  // Traditional and survive the char step — only cn-side STPhrases is affected.
  it("should apply STPhrases for context-sensitive one-to-many characters (cn to t)", async () => {
    const convert = await createConverter({ from: "cn", to: "t" }, []);
    expect(convert("头发")).toBe("頭髮"); // not 頭發
    expect(convert("理发店")).toBe("理髮店"); // not 理發店
    expect(convert("干燥")).toBe("乾燥"); // not 幹燥
    expect(convert("复杂")).toBe("複雜"); // not 復雜
    expect(convert("皇后")).toBe("皇后"); // 后 stays, not 後
  });

  it("should apply TSPhrases on t2s (乾隆 stays, not 干隆)", async () => {
    const convert = await createConverter({ from: "t", to: "cn" }, []);
    expect(convert("乾隆皇帝")).toBe("乾隆皇帝"); // TSPhrases protects 乾隆
    expect(convert("頭髮")).toBe("头发");
  });

  // protectedDict (outermost masking layer) and the phrase dictionaries are
  // orthogonal: a protected term is masked verbatim while the REST of the text
  // still gets correct phrase conversion, and a protected mapping overrides what
  // the phrase dict would otherwise produce.
  it("should apply protectedDict and STPhrases together (orthogonal layers)", async () => {
    // 头发 protected (kept simplified), 干燥 still phrase-converts to 乾燥
    const keep = await createConverter({ from: "cn", to: "t" }, [["头发", "头发"]]);
    expect(keep("头发干燥")).toBe("头发乾燥");
    // protectedDict wins over the phrase dict for the same term (乾燥 → 幹燥)
    const override = await createConverter({ from: "cn", to: "t" }, [["干燥", "幹燥"]]);
    expect(override("干燥")).toBe("幹燥");
  });

  it("should convert tw to cn", async () => {
    const convert = await createConverter({ from: "tw", to: "cn" });

    // Traditional -> Simplified
    // TSCharacters: 漢 -> 汉, 語 -> 语
    expect(convert("漢語")).toBe("汉语");
    expect(convert("國家")).toBe("国家");
  });

  it("should inject non-CJK output that OpenCC cannot produce", async () => {
    // OpenCC has no rule mapping "你好" to "HELLO". Without protectedDict,
    // cn→tw conversion of "你好世界" returns "你好世界" (chars are simp/trad identical).
    // The only way the result contains "HELLO" is the protectedDict layer.
    const convert = await createConverter({ from: "cn", to: "tw" }, [["你好", "HELLO"]]);
    expect(convert("你好世界")).toBe("HELLO世界");
  });

  it("should force a semantic remapping OpenCC would never make", async () => {
    // OpenCC's cn→tw never maps 北京 → 東京 (different cities, no translation rule).
    // protectedDict forces this mapping and OpenCC's ST chain cannot undo it.
    const convert = await createConverter({ from: "cn", to: "tw" }, [["北京", "東京"]]);
    expect(convert("我去北京")).toBe("我去東京");
  });

  it("should preserve simplified-form characters inside a traditional-mode output", async () => {
    const convert = await createConverter({ from: "cn", to: "tw" }, [["CHINA", "中国"]]);
    expect(convert("我爱CHINA")).toBe("我愛中国");
  });

  it("should override OpenCC's built-in vocabulary preference (twp mode)", async () => {
    // OpenCC twp has "手机 → 手機" as a standard cn→twp rule.
    // protectedDict "手机 → 電話" overrides this entirely.
    // Other surrounding chars (买, 个) still get standard ST conversion.
    const convert = await createConverter({ from: "cn", to: "twp" }, [["手机", "電話"]]);
    expect(convert("买个手机")).toBe("買個電話");
  });

  it("should lock traditional fields against char-level simplification (t2s)", async () => {
    // v1.0.x soft-override failure case retained: in t2s direction the inner TS
    // chain would char-level convert 自/行/車 to 自/行/车. The protectedDict
    // identity rule "自行車 → 自行車" with hard override prevents this.
    const convert = await createConverter({ from: "tw", to: "cn" }, [["自行車", "自行車"]]);
    expect(convert("自行車是好的")).toBe("自行車是好的");
  });

  it("should produce no protected effect when protectedDict is not provided (baseline)", async () => {
    // Sanity check: omitting the second arg returns OpenCC's normal output.
    // Relies on the shipped data/custom/ProtectedDict.txt being all-commented.
    const convert = await createConverter({ from: "cn", to: "tw" });
    expect(convert("汉语")).toBe("漢語");
  });

  it("should bypass the auto-loaded ProtectedDict.txt when passed an empty array", async () => {
    // Robust baseline: independent of whatever ships in ProtectedDict.txt.
    // Passing [] explicitly bypasses auto-load and disables protection.
    const convert = await createConverter({ from: "cn", to: "tw" }, []);
    expect(convert("汉语")).toBe("漢語");
  });
});

describe("getDictFiles", () => {
  // The return type is string[][] (GROUPED by conversion step), not a flat
  // string[]. A flat list invites `ConverterFactory(...files.map(f => [f]))`,
  // which runs each file as its own trie sequentially and kills every phrase
  // dictionary (头发→頭發). The grouped shape makes the correct usage natural.
  it("groups each conversion step's files together (char + phrase in one group)", () => {
    // cn→t: single step (variant→standard); STCharacters + STPhrases MUST share a group
    expect(getDictFiles("cn", "t")).toEqual([["STCharacters", "STPhrases"]]);
    // cn→tw: two steps (cn→standard, standard→tw)
    expect(getDictFiles("cn", "tw")).toEqual([["STCharacters", "STPhrases"], ["TWVariants"]]);
    // t→cn: single step (standard→cn)
    expect(getDictFiles("t", "cn")).toEqual([["TSCharacters", "TSPhrases"]]);
    // the char dict and its phrase dict are never split into separate groups
    expect(getDictFiles("cn", "t")[0]).toContain("STPhrases");
  });

  // Regression (B5): an unknown locale must throw, not silently drop the step
  // and return a converter that leaves text partially/un-converted.
  it("throws on an unknown locale instead of silently skipping the step", async () => {
    const bad = "xx" as unknown as LocaleCode;
    expect(() => getDictFiles(bad, "t")).toThrow(/Unknown 'from' locale/);
    expect(() => getDictFiles("cn", bad)).toThrow(/Unknown 'to' locale/);
    await expect(createConverter({ from: bad, to: "t" }, [])).rejects.toThrow(/Unknown 'from' locale/);
  });
});
