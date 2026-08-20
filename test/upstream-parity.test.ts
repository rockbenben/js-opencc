/**
 * Parity against OpenCC itself — every case in the official
 * `BYVoid/OpenCC:test/testcases/testcases.json` (upstream path, not ours), run
 * through every config it covers.
 *
 * The reference used to be opencc-js. That was the wrong judge twice over: it
 * is a competing port (a dependency on it is a strange thing for this package
 * to carry, even as a devDependency), and it is itself downstream of OpenCC —
 * matching it byte-for-byte only proves we share its bugs. The fixture in
 * `test/fixtures/opencc-testcases.json` is OpenCC's own acceptance suite,
 * refreshed by `npm run sync:opencc` from the same upstream snapshot as the
 * dictionaries, so cases and dicts can never drift apart.
 *
 * Two behaviours this suite pins that word-list tests cannot see:
 *
 * 1. **Segmentation.** A bare phrase converts correctly either way
 *    (`优化` → `最佳化`); only *in context* does a missing cut show up
 *    (`他优化了` → `他最佳化了` instead of `他優化了`).
 * 2. **CJK compatibility ideographs.** 類 U+F9D0 and 類 U+985E render
 *    identically; a mismatch is invisible on screen and only shows by
 *    code point.
 *
 * Parity runs with `loadCustomPhrases: false` and an empty protectedDict:
 * CNTWPhrases and the packaged ProtectedDict are THIS package's features, not
 * OpenCC's — they are tested separately below, with literal expectations.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createConverter } from "../src/index.js";
import type { LocaleCode } from "../src/presets.js";

// ── 官方用例 ─────────────────────────────────────────────────────────────

/** OpenCC config 名 → 我们的 locale 对。16 种全部有映射。 */
const CONFIG_LOCALES: Record<string, { from: LocaleCode; to: LocaleCode }> = {
  s2t: { from: "cn", to: "t" },
  t2s: { from: "t", to: "cn" },
  s2tw: { from: "cn", to: "tw" },
  tw2s: { from: "tw", to: "cn" },
  s2twp: { from: "cn", to: "twp" },
  tw2sp: { from: "twp", to: "cn" },
  s2hk: { from: "cn", to: "hk" },
  hk2s: { from: "hk", to: "cn" },
  s2hkp: { from: "cn", to: "hkp" },
  hk2sp: { from: "hkp", to: "cn" },
  t2tw: { from: "t", to: "tw" },
  tw2t: { from: "tw", to: "t" },
  t2hk: { from: "t", to: "hk" },
  hk2t: { from: "hk", to: "t" },
  t2jp: { from: "t", to: "jp" },
  jp2t: { from: "jp", to: "t" },
};

interface TestCase {
  id: string;
  input: string;
  expected: Record<string, string>;
}

const fixturePath = fileURLToPath(new URL("./fixtures/opencc-testcases.json", import.meta.url));
// 上游文件带尾逗号（JSON5 风味），宽松解析
const CASES: TestCase[] = JSON.parse(readFileSync(fixturePath, "utf8").replace(/,\s*([}\]])/g, "$1")).cases;

/**
 * 已知的、和 OpenCC 官方结果不一致的用例，键是 `config:id`，值是查明的原因。
 *
 * 列在这里而不是跳过：下面对每一条**断言它仍然不一致**——谁修好了会红，
 * 提醒把它挪出名单。一条永远绿的断言等于没有断言，一条永远红的测试
 * 会被人整个关掉，两种都不要。
 */
const KNOWN_DIVERGENCES = new Map<string, string>([
  // OpenCC 的 t2s 链默认带 TSCharactersExt（把 殢 转成二平面的 𣨼 这类映射）。
  // 我们**刻意不收**那个词典：它是 tofu-risk 提取——输出的字在多数字体里
  // 渲染成豆腐块，对以显示为目的的 JS 场景是负资产。opencc-js 的 config 解析
  // 也同样按 may_output_tofu 排除它。注意同一用例的 s2t 方向是过的：
  // tofu 风险只在输出侧。
  ["t2s:BYVoid_OpenCC_PR_1228_existing_behaviors", "TSCharactersExt（tofu-risk）刻意不收"],
  // 同一类：TSCharacters 原始行是 `圞→圞 𪢮`（identity 在前，我们取它，安全），
  // 把它压成二平面 𪢮 的是 TSCharactersExt
  ["t2s:BYVoid_OpenCC_PR_1229_existing_behaviors", "TSCharactersExt（tofu-risk）刻意不收"],
  ["t2s:BYVoid_OpenCC_PR_464_xi_vs_xi", "TSCharactersExt（tofu-risk）刻意不收：樠→𣗊 也是二平面输出"],
]);

describe("OpenCC 官方 testcases 全量比对", () => {
  const byConfig = new Map<string, Array<{ id: string; input: string; want: string }>>();
  for (const c of CASES) {
    for (const [config, want] of Object.entries(c.expected)) {
      if (!(config in CONFIG_LOCALES)) throw new Error(`testcases 里出现未映射的 config: ${config} — 补进 CONFIG_LOCALES`);
      const list = byConfig.get(config) ?? [];
      list.push({ id: c.id, input: c.input, want });
      byConfig.set(config, list);
    }
  }

  for (const [config, cases] of byConfig) {
    const { from, to } = CONFIG_LOCALES[config];

    it(`${config}（${cases.length} 例）`, async () => {
      // 空 protectedDict + 关掉 CNTWPhrases：比对的是「OpenCC 语义」这一层，
      // 本包自己的功能不参与，另测
      const convert = await createConverter({ from, to, loadCustomPhrases: false }, []);

      // 先收集再一次报，不在第一条就停：上游词典一变往往同时波及多条，
      // 打地鼠式的逐条失败会把「同一成因的三条」拖成三轮排查
      const mismatches: string[] = [];
      const healed: string[] = [];
      for (const { id, input, want } of cases) {
        const got = convert(input);
        const key = `${config}:${id}`;
        const reason = KNOWN_DIVERGENCES.get(key);
        if (reason) {
          if (got === want) healed.push(`${key}（${reason}）已一致，移出 KNOWN_DIVERGENCES`);
        } else if (got !== want) {
          mismatches.push(`${key} 输入 ${input}
    我们 ${got}
    官方 ${want}`);
        }
      }
      expect(mismatches, mismatches.join("\n")).toEqual([]);
      expect(healed, healed.join("\n")).toEqual([]);
    });
  }

  it("名单里的键都真实存在（防止改 id 之后名单空转）", () => {
    const valid = new Set<string>();
    for (const c of CASES) for (const config of Object.keys(c.expected)) valid.add(`${config}:${c.id}`);
    for (const key of KNOWN_DIVERGENCES.keys()) {
      expect(valid.has(key), `KNOWN_DIVERGENCES 里的 ${key} 在 testcases 里不存在`).toBe(true);
    }
  });
});

// ── 本包自己的行为（OpenCC 没有的部分，用字面量钉住）──────────────────────

const codePoints = (s: string) => [...s].map((c) => "U+" + c.codePointAt(0)!.toString(16).toUpperCase()).join(" ");

describe("兼容汉字：折叠靠 NFC，不靠内置词表", () => {
  it("两个兼容区都折叠，且折叠发生在转换之前", async () => {
    const toTraditional = await createConverter({ from: "cn", to: "t" });
    // U+F9D0 類 → U+985E 類（统一汉字）；字形一样，只能按码位断言
    expect(codePoints(toTraditional(String.fromCodePoint(0xf9d0)))).toBe("U+985E");
    expect(codePoints(toTraditional(String.fromCodePoint(0xf900)))).toBe("U+8C48");
    // 补充平面 U+2F800 → U+4E3D 丽，**然后**简繁转换把它变成 U+9E97 麗。
    // 归一化在前、转换在后，这一条钉的就是顺序
    expect(codePoints(toTraditional(String.fromCodePoint(0x2f800)))).toBe("U+9E97");
  });

  it("归一化让兼容汉字真的能参与转换（这才是做它的理由）", async () => {
    const convert = await createConverter({ from: "cn", to: "tw" });
    expect(convert(String.fromCodePoint(0xf9d0) + "似的头发")).toBe("類似的頭髮");
  });

  it("全角标点不许动——那是 NFKC 干的事，会毁掉中文排版", async () => {
    const convert = await createConverter({ from: "cn", to: "t" });
    expect(convert("，。！？（）「」…—")).toBe("，。！？（）「」…—");
    expect(convert("ＡＢＣ１２３")).toBe("ＡＢＣ１２３");
    expect(convert("㈱㈲")).toBe("㈱㈲");
  });
});

describe("切段（segmentation）", () => {
  it("地区词表在上下文里不能越界匹配", async () => {
    const convert = await createConverter({ from: "cn", to: "twp" });
    // 光看词条本身对不对分不出来（`优化`→`最佳化` 两种实现都对），
    // **带上下文才露馅**——这正是词表式测试发现不了这个 bug 的原因
    expect(convert("优化")).toBe("最佳化");
    expect(convert("他优化了")).toBe("他優化了");
    expect(convert("他函数了")).toBe("他函數了");
    expect(convert("他宽带了")).toBe("他寬帶了");
    expect(convert("他刻录了")).toBe("他刻錄了");
  });

  it("自定义词库（CNTWPhrases）是硬覆盖：既不被切碎、也不被后续步骤二次转换", async () => {
    // 这两条是拿全部 41 个自定义词条逐个放进句子里探出来的，各代表一类死法：
    const convert = await createConverter({ from: "cn", to: "twp" });
    // ① 切段把键切碎（人脸识别 → [人脸][识别]），词条在段内永远匹配不上。
    //    曾以普通 trie 组的形状实现时真发生过——切段改造引入的回归
    expect(convert("他说这个人脸识别很不错")).toBe("他說這個人臉辨識很不錯");
    // ② 输出被后续步骤再嚼一遍：调制解调器 → 數據機，再被 TWPhrases 的
    //    數據→資料 咬成 資料機。这一条比切段还老，从最初就错着
    expect(convert("他说这个调制解调器很不错")).toBe("他說這個數據機很不錯");
    // 反向（twp→cn）同一机制
    const rev = await createConverter({ from: "twp", to: "cn" });
    expect(rev("他說這個隨身碟很不錯")).toBe("他说这个U盘很不错");
  });

  it("生成词典钉住地区词的边界：出租车必须整词换成計程車", async () => {
    // 这一条**只有** STPhrases_GeneratedFromRegionalPhrases 在场才对：
    // 没有它，切段会把「出租车」切碎，TWPhrases 的「出租車→計程車」
    // 在段内永远匹配不上，结果停在 出租車司機
    const convert = await createConverter({ from: "cn", to: "twp" });
    expect(convert("出租车司机打开了收音机")).toBe("計程車司機打開了收音機");
    // 词典值的意义（不是只当切段边界）：整词替换钉住每个字的正确字形
    const toT = await createConverter({ from: "cn", to: "t" });
    expect(toT("出租车")).toBe("出租車");
  });

  it("保护词典压得住切段和地区词表：被保护的词一个字都不许动", async () => {
    // 三层机制叠满的方向（保护 > 自定义词 > 切段 + 生成词典 + 地区词表），
    // 保护的又恰好是地区词表最想转换的词（出租车→計程車）和
    // 词组级消歧的招牌词（头发→頭髮）——它们必须原样穿过整条管线
    const convert = await createConverter({ from: "cn", to: "twp" }, [
      ["出租车", "出租车"],
      ["头发", "头发"],
    ]);
    expect(convert("出租车司机的头发很乱，另一辆出租车开走了")).toBe("出租车司機的头发很亂，另一輛出租车開走了");
  });

  it("单步链不切段（切了也白切，只是慢一倍）", async () => {
    const convert = await createConverter({ from: "cn", to: "t" });
    expect(convert("头发和发现")).toBe("頭髮和發現");
  });

  it("切段不改变可逆性：段拼回去必须等于原文", async () => {
    const { Trie } = await import("../src/core.js");
    const trie = new Trie();
    trie.loadDict("头发 頭髮|发现 發現");
    for (const text of ["头发和发现", "", "abc", "头发", "无关文字", "头发头发头发"]) {
      expect(trie.segment(text).join(""), `切段丢字：${text}`).toBe(text);
    }
  });
});
