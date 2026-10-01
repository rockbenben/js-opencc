/**
 * 契约名单自身的完整性 —— 离线可查的那一半。
 *
 * 同步脚本里的链比对/切段比对只按名单点名的 config 去取文件：名单少一条，运行照样绿，
 * 只是那条链从此没人看。上一轮小篆收养把这件事做成了实测——从 CONFIG_CHAINS 删掉
 * s2seal，套件毫无反应。所以「名单盖全了吗」必须有自己的判据：
 * 这里拿官方 testcases 夹具当上游覆盖面（它随 sync 与字典同快照刷新），双向对齐。
 * 联网那一半（上游 data/config 里有、但用例没覆盖的 config）在 sync 脚本里查。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { variants2standard, standard2variants } from "../src/presets.js";
import { CONFIG_CHAINS, CONFIG_NO_SEGMENTATION, CONFIG_SEGMENTATION, NOT_CHAIN_CHECKED } from "../scripts/lib/upstream-contracts.js";

const fixturePath = fileURLToPath(new URL("./fixtures/opencc-testcases.json", import.meta.url));
// 上游文件带尾逗号（JSON5 风味），宽松解析 —— 与 upstream-parity.test.ts 同一套
const CASES = JSON.parse(readFileSync(fixturePath, "utf8").replace(/,\s*([}\]])/g, "$1")).cases as Array<{ expected: Record<string, string> }>;

const fixtureConfigs = new Set<string>();
for (const c of CASES) for (const config of Object.keys(c.expected)) fixtureConfigs.add(config);

describe("上游 config 的契约名单完整（离线那一半）", () => {
  it("链比对覆盖 = 用例覆盖：不多查也不少查", () => {
    const chainCovered = new Set([...CONFIG_CHAINS.map((c) => c.config), ...Object.keys(NOT_CHAIN_CHECKED)]);
    const missing = [...fixtureConfigs].filter((c) => !chainCovered.has(c));
    const stale = [...chainCovered].filter((c) => !fixtureConfigs.has(c));
    expect(missing, `上游用例覆盖的 config 没进链名单：${missing.join(", ")} — 补进 CONFIG_CHAINS 或 NOT_CHAIN_CHECKED`).toEqual([]);
    expect(stale, `链名单里的 config 在用例里不存在：${stale.join(", ")} — 上游撤了就把名单一起撤，别留永远绿的空条目`).toEqual([]);
  });

  it("切段声明覆盖 = 用例覆盖：每个 config 要么声明切、要么声明不切", () => {
    const segCovered = new Set([...CONFIG_SEGMENTATION.map((c) => c.config), ...CONFIG_NO_SEGMENTATION]);
    const missing = [...fixtureConfigs].filter((c) => !segCovered.has(c));
    const stale = [...segCovered].filter((c) => !fixtureConfigs.has(c));
    expect(missing, `没声明切段行为的 config：${missing.join(", ")}`).toEqual([]);
    expect(stale, `切段名单里的 config 在用例里不存在：${stale.join(", ")}`).toEqual([]);
    // 两份名单必须互斥：一个 config 既「该切」又「不许切」等于谁都没说清
    const overlap = CONFIG_SEGMENTATION.map((c) => c.config).filter((c) => CONFIG_NO_SEGMENTATION.includes(c));
    expect(overlap, `同时出现在切/不切两份名单：${overlap.join(", ")}`).toEqual([]);
  });

  it("NOT_CHAIN_CHECKED 的每条都写得出理由", () => {
    // 这张名单是「为什么可以不比」的余数。空理由等于把漏查伪装成已豁免。
    for (const [config, reason] of Object.entries(NOT_CHAIN_CHECKED)) {
      expect(reason.trim(), `${config} 的豁免理由没写`).not.toBe("");
      expect(CONFIG_CHAINS.some((c) => c.config === config), `${config} 同时在比对名单和豁免名单里`).toBe(false);
    }
  });

  it("链名单点名的 locale 在 presets 里真实存在", () => {
    // 比对代码写的是 `presets[side][locale] ?? []`：拼错一个 locale 就变成
    // 「和空名单比」，而空名单恰好等于上游被过滤后的结果，谁都看不出。
    // （`step` 是**上游** conversion_chain 的起始下标，不是我们步骤数组的下标，
    // 越界与否只有拿到上游链才知道 —— 那一半在 sync 的按步比对里。）
    for (const { side, locale } of CONFIG_CHAINS) {
      const steps = (side === "to" ? standard2variants : variants2standard)[locale];
      expect(steps, `CONFIG_CHAINS 点了 presets 里没有的 ${side}.${locale}`).toBeDefined();
      expect(steps.length, `${side}.${locale} 没有步骤可比`).toBeGreaterThan(0);
    }
  });
});
