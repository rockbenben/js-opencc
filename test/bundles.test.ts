import { describe, it, expect } from "vitest";
import { Converter as Cn2t } from "../src/bundles/cn2t.js";
import { Converter as T2cn } from "../src/bundles/t2cn.js";
import { Converter as Full, Locale } from "../src/bundles/full.js";

describe("cn2t / t2cn bundles", () => {
  it("convert with correct per-step grouping (phrase dicts apply)", () => {
    expect(Cn2t({ to: "tw" })("头发干燥")).toBe("頭髮乾燥");
    expect(T2cn({ from: "tw" })("頭髮乾燥")).toBe("头发干燥");
  });

  // Bundles used to skip CNTWPhrases entirely, so twp output drifted from the
  // npm main entry (幼儿园 stayed 幼儿园 in UMD). Same defaults now: loaded for
  // twp, reversed for twp→cn, opt-out via loadCustomPhrases.
  it("load CNTWPhrases for twp like the main entry", () => {
    expect(Cn2t({ to: "twp" })("幼儿园扫二维码")).toBe("幼稚園掃QR Code");
    expect(T2cn({ from: "twp" })("幼稚園")).toBe("幼儿园");
    expect(Full({ from: "cn", to: "twp" })("幼儿园")).toBe("幼稚園");
    expect(Full({ from: "twp", to: "cn" })("幼稚園")).toBe("幼儿园");
  });

  it("skip CNTWPhrases when loadCustomPhrases is false", () => {
    expect(Cn2t({ to: "twp", loadCustomPhrases: false })("幼儿园")).toBe("幼兒園");
  });

  // Regression: the bundles and the main entry each carried their own copy of
  // the "which CNTWPhrases, which direction" rule and the copies disagreed —
  // t2cn always reversed while full/main only reversed twp→cn, so the same
  // options produced Taiwanese vocabulary in a to-cn conversion.
  it("apply CNTWPhrases in the same direction as the main entry", async () => {
    const { createConverter } = await import("../src/converter.js");
    const opts = { from: "tw", to: "cn", loadCustomPhrases: true } as const;
    const main = await createConverter(opts, []);
    expect(T2cn({ from: "tw", loadCustomPhrases: true })("計程車")).toBe("出租车");
    expect(Full(opts)("計程車")).toBe("出租车");
    expect(main("計程車")).toBe("出租车");
  });

  // Regression: full.ts reversed only for twp→cn, so a twp SOURCE aimed at a
  // traditional target loaded the FORWARD cn→tw dict and rewrote script-invariant
  // terms by mainland meaning (土豆 is peanut in Taiwan, not 馬鈴薯).
  it("leave Taiwan-side text alone when the target is not cn", () => {
    expect(Full({ from: "twp", to: "t" })("土豆")).toBe("土豆");
    expect(Full({ from: "twp", to: "tw" })("土豆")).toBe("土豆");
    expect(Full({ from: "cn", to: "twp" })("土豆")).toBe("馬鈴薯");
  });

  // Regression: unknown locales fell into `standard2variants[to] || []` and
  // silently skipped the step, returning partially-converted text. The v1.3.2
  // loud-error policy covered full.ts and createConverter but missed these
  // two hand-written bundles (JS callers bypass the TS type check).
  it("throw on an unknown locale instead of silently skipping the step", () => {
    expect(() => Cn2t({ to: "xx" as never })).toThrow(/Unknown 'to' locale/);
    expect(() => T2cn({ from: "xx" as never })).toThrow(/Unknown 'from' locale/);
  });

  // Regression: the one-way bundles read only their own side of the pair, so the
  // opposite argument was discarded rather than rejected — T2cn({from:"twp",
  // to:"tw"})("計程車") returned "出租车", simplified script AND mainland
  // vocabulary, for a caller who asked for Taiwanese output.
  it("throw on a direction the bundle cannot serve", () => {
    expect(() => T2cn({ from: "twp", to: "tw" as never })).toThrow(/t2cn bundle only converts to 'cn'/);
    expect(() => Cn2t({ from: "tw" as never, to: "tw" })).toThrow(/cn2t bundle only converts from 'cn'/);
    // The reverse mistake used to surface as an internal 'missing dictionary'
    // error, pointing at a packaging bug that does not exist.
    expect(() => Cn2t({ to: "cn" as never })).toThrow(/cannot convert to 'cn' — use the t2cn bundle/);
    expect(() => T2cn({ from: "cn" as never })).toThrow(/cannot convert from 'cn' — use the cn2t bundle/);
    // The supported shapes still work, with or without the redundant argument.
    expect(T2cn({ from: "tw", to: "cn" })("軟件")).toBe("软件");
    expect(Cn2t({ from: "cn", to: "tw" })("软件")).toBe("軟件");
  });

  // A locale name reaching the preset maps through the prototype chain used to
  // pass the guard and die inside .map with an opaque TypeError.
  it("reject prototype member names as locales", () => {
    expect(() => Full({ from: "constructor" as never, to: "tw" })).toThrow(/Unknown 'from' locale/);
    expect(() => Cn2t({ to: "toString" as never })).toThrow(/Unknown 'to' locale/);
  });

  // The one-way bundles only check the locale actually requested, so a dict
  // added to hk/jp by a future OpenCC sync would ship and throw at runtime with
  // a green suite. Constructing every accepted locale is that missing guard.
  it("one-way bundles carry dicts for every locale they accept", () => {
    for (const to of ["t", "tw", "twp", "hk", "jp"] as const) {
      expect(() => Cn2t({ to }), `cn2t to:${to}`).not.toThrow();
    }
    for (const from of ["t", "tw", "twp", "hk", "jp"] as const) {
      expect(() => T2cn({ from }), `t2cn from:${from}`).not.toThrow();
    }
  });

  // The full bundle imports every dict eagerly; `Locale` is built from the same
  // map, so an undefined entry here means a preset dict is missing from it.
  it("full bundle carries every preset dict", () => {
    for (const [locale, group] of [...Object.entries(Locale.from), ...Object.entries(Locale.to)]) {
      expect(group.length, locale).toBeGreaterThan(0);
      for (const d of group) expect(typeof d, locale).toBe("string");
    }
  });
});
