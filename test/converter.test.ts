import { describe, it, expect } from "vitest";
import { createConverter, getDictFiles } from "../src/converter.js";
import type { LocaleCode } from "../src/converter.js";
import { dictLoaders } from "../src/dict/index.js";
import { allDictFiles } from "../src/presets.js";

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
    // cn→tw: two steps (cn→standard, standard→tw); TWVariantsPhrases rides in
    // the same group as TWVariants so proper nouns win the longest match
    expect(getDictFiles("cn", "tw")).toEqual([
      ["STCharacters", "STPhrases"],
      ["TWVariants", "TWVariantsPhrases"],
    ]);
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

describe("inner converter cache", () => {
  // Inner converters are cached by (from, to, loadPhrases). Caching the BUILD
  // PROMISE means concurrent calls (a batch converting N files) share ONE trie
  // build — the identity check below fails if each call builds its own.
  it("returns the identical converter for the same direction, incl. concurrent calls", async () => {
    const [a, b] = await Promise.all([createConverter({ from: "t", to: "cn" }, []), createConverter({ from: "t", to: "cn" }, [])]);
    expect(a).toBe(b);
    const c = await createConverter({ from: "cn", to: "t" }, []);
    expect(c).not.toBe(a);
  });

  it("wraps protection per call OUTSIDE the cache — the shared inner is never contaminated", async () => {
    const plain = await createConverter({ from: "cn", to: "t" }, []);
    const withProtection = await createConverter({ from: "cn", to: "t" }, [["头发", "头发"]]);
    expect(withProtection).not.toBe(plain);
    expect(withProtection("头发干燥")).toBe("头发乾燥");
    // The cached inner must still convert normally after the protected call.
    expect(plain("头发干燥")).toBe("頭髮乾燥");
  });

  // Pins the string-form CNTWPhrases key/value swap (twp→cn is the only
  // direction that reverses a dict at load time).
  it("reverses CNTWPhrases for twp→cn", async () => {
    const convert = await createConverter({ from: "twp", to: "cn" }, []);
    expect(convert("幼稚園")).toBe("幼儿园");
  });
});

// Regression: the direction rule lived in four places and only excluded twp→cn
// from the forward dict, so a twp SOURCE aimed at any traditional target loaded
// the cn→tw dict and rewrote script-invariant terms by mainland meaning —
// 土豆 is peanut in Taiwan, silently converted to 馬鈴薯.
describe("CNTWPhrases direction rule", () => {
  it("leaves Taiwan-side text alone when the target is not cn", async () => {
    for (const to of ["t", "tw", "hk"] as const) {
      const convert = await createConverter({ from: "twp", to }, []);
      expect(convert("土豆"), `twp→${to}`).toBe("土豆");
      expect(convert("芝士"), `twp→${to}`).toBe("芝士");
    }
    // tw→twp is Taiwan-side on both ends too, so nothing applies.
    const tw2twp = await createConverter({ from: "tw", to: "twp" }, []);
    expect(tw2twp("土豆")).toBe("土豆");
  });

  it("still converts into and out of Taiwan vocabulary", async () => {
    const cn2twp = await createConverter({ from: "cn", to: "twp" }, []);
    expect(cn2twp("土豆")).toBe("馬鈴薯");
    const twp2cn = await createConverter({ from: "twp", to: "cn" }, []);
    expect(twp2cn("馬鈴薯")).toBe("土豆");
  });

  // The main entry loaded the FORWARD dict for an explicit opt-in on tw→cn while
  // the t2cn bundle reversed it, so the same options produced 芝士→起司 (Taiwanese
  // vocabulary) in a to-cn conversion.
  it("reverses for an explicit opt-in on tw→cn, like the t2cn bundle", async () => {
    const convert = await createConverter({ from: "tw", to: "cn", loadCustomPhrases: true }, []);
    expect(convert("計程車")).toBe("出租车");
    expect(convert("起司")).toBe("芝士");
  });
});

// Regression: sync-opencc parsed custom dicts with the OFFICIAL-dict rule
// (first space-separated token wins), truncating multi-token values —
// 二维码 → "QR" instead of "QR Code". The v1.3.2 Trie.loadDict fix solved the
// same truncation downstream but left this upstream copy in the generator.
describe("custom dict multi-token values", () => {
  it("keeps the whole value through cn→twp", async () => {
    const convert = await createConverter({ from: "cn", to: "twp" }, []);
    expect(convert("扫二维码支付")).toBe("掃QR Code支付");
  });

  it("round-trips through the twp→cn reversal (key contains a space)", async () => {
    const convert = await createConverter({ from: "twp", to: "cn" }, []);
    expect(convert("QR Code")).toBe("二维码");
  });
});

// Regression: reverseEntries was last-wins on key collisions, so HKVariants'
// 才→才 + 纔→才 reversed into 才→纔 — and entriesToOptimized then dropped the
// correct single-char identity pair, leaving ONLY the wrong mapping (人才→人纔,
// 煙→菸, 核心→覈心, 梁先生→樑先生). Char-level reversal must fall back to
// identity; the *RevPhrases dicts disambiguate in context.
describe("reverse dict identity fallback", () => {
  it("hk→t keeps ambiguous chars as identity", async () => {
    const convert = await createConverter({ from: "hk", to: "t" }, []);
    expect(convert("人才")).toBe("人才"); // not 人纔
    expect(convert("核心")).toBe("核心"); // not 覈心
    expect(convert("煙")).toBe("煙"); // not 菸
  });

  it("tw→t keeps identity while *RevPhrases still disambiguate", async () => {
    const convert = await createConverter({ from: "tw", to: "t" }, []);
    expect(convert("梁先生")).toBe("梁先生"); // not 樑先生
    expect(convert("橋梁")).toBe("橋樑"); // phrase dict still wins in-context
  });
});

// Regression: the presets skipped HKVariantsPhrases / TWVariantsPhrases, which
// OpenCC's own t2hk / t2tw / s2twp / s2hkp chains include. They are the dicts
// that stop proper nouns from being over-converted, so without them 264/272 of
// HKVariantsPhrases and 12/12 of TWVariantsPhrases disagreed with OpenCC.
describe("variant phrase dicts (OpenCC parity)", () => {
  it("keeps proper nouns intact for t→tw", async () => {
    const convert = await createConverter({ from: "t", to: "tw" }, []);
    expect(convert("張棟樑")).toBe("張棟樑"); // not 張棟梁
    expect(convert("林杰樑")).toBe("林杰樑");
    expect(convert("純喫茶")).toBe("純喫茶"); // not 純吃茶
    // the plain variant rule still applies outside those phrases
    expect(convert("棟樑之材")).toBe("棟梁之材");
  });

  it("applies HK phrase variants for t→hk", async () => {
    const convert = await createConverter({ from: "t", to: "hk" }, []);
    expect(convert("仙姑峯")).toBe("仙姑峰");
    expect(convert("一粥麪")).toBe("一粥麵");
  });
});

// hkp mirrors twp: HK regional vocabulary on top of the hk variant chain,
// matching OpenCC's s2hkp / hk2sp configs.
describe("hkp locale", () => {
  it("converts mainland vocabulary to HK usage", async () => {
    const convert = await createConverter({ from: "cn", to: "hkp" }, []);
    expect(convert("伍迪·艾伦")).toBe("活地·亞倫");
    // plain hk must NOT do the vocabulary step
    const plain = await createConverter({ from: "cn", to: "hk" }, []);
    expect(plain("伍迪·艾伦")).toBe("伍迪·艾倫");
  });

  it("round-trips HK vocabulary back to mainland", async () => {
    const convert = await createConverter({ from: "hkp", to: "cn" }, []);
    expect(convert("活地·亞倫")).toBe("伍迪·艾伦");
  });
});

describe("dictLoaders", () => {
  // Invariant: the generated loader map must cover every dict file the presets
  // can ask for (plus CNTWPhrases), and each loader must resolve to dict data.
  // Catches drift between sync-opencc's index generation and presets.ts.
  it("covers every preset dict file plus CNTWPhrases", async () => {
    for (const name of [...allDictFiles, "CNTWPhrases"]) {
      const loader = dictLoaders[name];
      if (!loader) throw new Error(`missing loader for ${name}`);
      const data = (await loader()).default;
      // "k1 v1|k2 v2" format — at least one space-separated entry
      expect(data, `dict ${name} looks empty`).toMatch(/ /);
    }
  });
});
