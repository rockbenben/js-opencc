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

  it("should support custom dictionary overlay", async () => {
    // Custom dictionary is applied BEFORE standard conversion
    // So we need to use the simplified form as the key
    const customDict: string[][] = [["自定义", "自訂"]];
    const convert = await createConverter({ from: "cn", to: "tw" }, customDict);

    // 自定义 -> 自訂 (by customDict) -> 自訂 (by standard, remains same)
    expect(convert("自定义")).toBe("自訂");
  });
});
