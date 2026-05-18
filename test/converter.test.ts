import { describe, it, expect } from "vitest";
import { createConverter } from "../src/converter.js";

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
