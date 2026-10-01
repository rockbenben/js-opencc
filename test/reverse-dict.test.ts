/**
 * 反查字典（`*Rev`）的候选选择规则。
 *
 * 这组测试钉的不是某条映射，是**「多个候选时凭什么选这个」的判据**：上游
 * `data/scripts/common.py` 的 `Dict.swap()` 会读 `# @reverse-prefer: K V`，把 V 提到
 * 候选首位；我们曾经完全不看那行注释，于是 `t2jp` 在 鹽 / 鋪 / 莊 三个字上发出去的是
 * 䀋 / 舖 / 庄——其中 庄 是简体形，䀋 是多数字体里的豆腐块。
 *
 * 夹具是 `JPShinjitaiCharacters.txt` 里真实相关的行（键 = 日本新字体，值 = OpenCC
 * 标准繁体候选，制表符分隔），不是编的。
 */
import { describe, it, expect } from "vitest";
import { expandDictForReverse, parseReversePreferences, reverseEntries } from "../scripts/lib/reverse-dict.js";

const JP_SLICE = [
  "# @reverse-prefer: 鹽 塩",
  "# @reverse-prefer: 鋪 舗",
  "# @reverse-prefer: 莊 荘",
  "䀋\t䀋 鹽",
  "塩\t鹽",
  "庄\t庄 莊",
  "舖\t舖 鋪",
  "舗\t舗 鋪",
  "荘\t莊",
].join("\n");

/** 走完「展开 → 应用偏好 → 每个反查键取一个候选」，返回反查表 */
const reversed = (raw: string) => new Map(reverseEntries(expandDictForReverse(raw), parseReversePreferences(raw)));

describe("反查字典生成：@reverse-prefer", () => {
  it("按名字点名的候选胜出，而不是文件顺序或 identity", () => {
    const rev = reversed(JP_SLICE);
    expect(rev.get("鹽"), "上游偏好 塩；文件顺序的首候选是 䀋").toBe("塩");
    expect(rev.get("鋪"), "上游偏好 舗；文件顺序的首候选是 舖").toBe("舗");
    expect(rev.get("莊"), "上游偏好 荘；文件顺序的首候选是 庄（简体形）").toBe("荘");
  });

  it("没有偏好的键：identity 候选优先于文件顺序", () => {
    // 上游没有这条兜底——今天的数据里 identity 恰好码位最小、排在最前，first-wins
    // 已经选中它。那是码位表的巧合，不是上游契约，所以保险留着（见 reverse-dict.ts）。
    expect(reversed("甲\t乙\n乙\t乙").get("乙")).toBe("乙");
  });

  it("偏好指向不存在的候选就中止，不静默忽略", () => {
    // 上游同样抛（common.py 的 ValueError）。静默忽略等于照发一条没人要求的映射。
    const raw = "# @reverse-prefer: 甲 丙\n甲\t乙";
    expect(() => reverseEntries(expandDictForReverse(raw), parseReversePreferences(raw))).toThrow(/reverse-prefer/);
  });

  it("只写一个字段是 identity 偏好的显式写法", () => {
    const raw = "# @reverse-prefer: 才\n才\t才\n纔\t才";
    expect(parseReversePreferences(raw).get("才")).toBe("才");
    expect(reversed(raw).get("才")).toBe("才");
  });

  it("反查建在全部候选上，不只是每行的首个值", () => {
    // 上游 `弁 辨 辯 瓣` 这种多候选行，反查要三个都回来：只取首值会让 辯護士
    // 转不成 弁護士（官方用例 case_040 抓到过这个）。
    const rev = reversed("弁\t辨 辯 瓣");
    expect(rev.get("辯")).toBe("弁");
    expect(rev.get("瓣")).toBe("弁");
    expect(rev.get("辨")).toBe("弁");
  });
});
