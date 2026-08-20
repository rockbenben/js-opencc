/**
 * 自定义词条冗余度测量：哪些 CNTWPhrases 词条删掉之后，**所有支持方向的输出
 * 一个字都不变**——那才是真冗余，官方链条已经完全覆盖它。
 *
 * 这是 `export-pr.ts` 的另一端：那边找「该送上游的新词条」，这边找
 * 「上游已经吸收、我们这份还压着的」。同步上游词典之后跑一次。
 *
 * ## 两个必须踩过才知道的判据
 *
 * 早先一版探针把「这条词自己在 `cn→twp` / `twp→cn` 上还起不起作用」当冗余判据，
 * 据此删了 11 条，测试当场红了 3 条。两处都错在把词条当**孤立**的东西看：
 *
 * 1. **方向不止两个，而且不对称。** `variants2standard.tw` 不含 `TWPhrasesRev`，
 *    `twp` 才含。所以 `twp→cn` 官方能给 `計程車→出租车`，而 `tw→cn`
 *    （显式 `loadCustomPhrases: true`，一个有专门测试的用法）只能给 `计程车`。
 *    只测 twp 就会把这条误判成冗余。
 * 2. **词条之间通过反向词典互相影响。** `reverseDictString` 对撞值取首个键，
 *    而 `U盘` 和 `优盘` 的值同为 `隨身碟`。删掉 `U盘` 那条，`隨身碟` 的反向
 *    结果就从 `U盘` 变成 `优盘`——**受影响的是另一条词**，孤立地看两条都"冗余"。
 *
 * 所以这里的做法是消融实验：真的把词条拿掉、重建转换器，对**全部方向 × 全部
 * 词条**跑一遍，输出一个字都不能变才算冗余。慢一点，但这是唯一不骗人的判据。
 *
 * Usage: npx tsx scripts/probe-cntw-redundancy.ts
 */
import { readdirSync } from "node:fs";
import { ConverterFactoryWithSegmentation, ProtectedConverter, reverseDictString, type DictLike } from "../src/core.js";
import { getDictFiles } from "../src/converter.js";
// 直接引内部模块：这是仓库内的脚本，没理由为了它扩大公共 API
import { segmentationDictsFor, phraseDictDirection } from "../src/presets.js";
import type { LocaleCode } from "../src/presets.js";

/**
 * 词典内容一律**import 模块**拿，不要去解析 `src/dict/*.ts` 的源码文本。
 *
 * 上一版是 `readFileSync(...).replace("export default ", "")`，而词典模块后来改成了
 * `const dict: string = "…"; export default dict;`（为了不让 tsc 把整本词典推断成
 * 一个 1.9 MB 的字符串字面量类型），这个脚本当场就崩了。**按文本解析别人的源码格式，
 * 等于给那个格式加了一个没人知道的约束。**
 *
 * 先一次性全部载入到 Map，后面 `dict()` 就还能同步用。
 */
const DICT_NAMES = readdirSync("src/dict")
  .filter((f) => f.endsWith(".ts") && f !== "index.ts")
  .map((f) => f.replace(/\.ts$/, ""));

const DICTS = new Map<string, string>(
  await Promise.all(
    DICT_NAMES.map(async (n) => [n, (await import(`../src/dict/${n}.js`)).default as string] as const)
  )
);

const dict = (n: string): string => {
  const d = DICTS.get(n);
  if (d === undefined) throw new Error(`词典 ${n} 不在 src/dict/ 下`);
  return d;
};

const CNTW: string = dict("CNTWPhrases");
const entries = CNTW.split("|").map((l) => {
  const i = l.indexOf(" ");
  return [l.slice(0, i), l.slice(i + 1)] as [string, string];
});

/** CNTWPhrases 会生效的全部方向，含 `tw`/`t`/`hk` 源的显式开启用法。 */
const DIRECTIONS: Array<[LocaleCode, LocaleCode]> = [
  ["cn", "tw"], ["cn", "twp"], ["cn", "hk"], ["cn", "hkp"],
  ["t", "twp"], ["hk", "twp"], ["jp", "twp"],
  ["tw", "cn"], ["twp", "cn"], ["hk", "cn"],
];

/** 按给定的自定义词典内容造一个转换器，其余环节和 createConverter 一致。 */
const build = (from: LocaleCode, to: LocaleCode, customDict: string | null) => {
  const groups = getDictFiles(from, to).map((g) => g.map(dict));
  const seg = segmentationDictsFor(from, to).map(dict);
  let convert = ConverterFactoryWithSegmentation(seg.length ? seg : null, ...groups);
  const dir = phraseDictDirection(from, to, true);
  if (dir && customDict) {
    const d: DictLike = dir === "reverse" ? reverseDictString(customDict) : customDict;
    convert = ProtectedConverter(d, convert);
  }
  return convert;
};

/** 拿全部词条的键和值当语料，任何一条的输出变了都算「有影响」。 */
const CORPUS = [...new Set(entries.flatMap(([k, v]) => [k, v, "他说这个" + k + "很不错", "他說這個" + v + "很不錯"]))];

const baseline = new Map<string, string[]>();
for (const [from, to] of DIRECTIONS) {
  const c = build(from, to, CNTW);
  baseline.set(`${from}->${to}`, CORPUS.map((t) => c(t)));
}

const redundant: Array<[string, string]> = [];
const needed: Array<[string, string, string]> = [];
for (const [key, value] of entries) {
  const without = entries.filter(([k]) => k !== key).map(([k, v]) => `${k} ${v}`).join("|");
  let firstDiff = "";
  for (const [from, to] of DIRECTIONS) {
    const c = build(from, to, without);
    const base = baseline.get(`${from}->${to}`)!;
    for (let i = 0; i < CORPUS.length; i++) {
      const got = c(CORPUS[i]);
      if (got !== base[i]) {
        firstDiff = `${from}→${to} ${CORPUS[i]}: ${base[i]} → ${got}`;
        break;
      }
    }
    if (firstDiff) break;
  }
  if (firstDiff) needed.push([key, value, firstDiff]);
  else redundant.push([key, value]);
};

console.log(`共 ${entries.length} 条，跨 ${DIRECTIONS.length} 个方向 × ${CORPUS.length} 条语料做消融`);
console.log(`  必需: ${needed.length}`);
console.log(`  冗余（删掉后所有方向输出一字不变）: ${redundant.length}`);
if (redundant.length) {
  console.log("\n冗余词条：");
  for (const [k, v] of redundant) console.log(`  ${k}\t${v}`);
}

// ── 第二问：上游到底有没有 ────────────────────────────────────────────────
//
// 消融回答的是「删了会不会变」，回答不了「上游是不是已经收了这个词」——两者不是
// 一回事：上游可能连这个键都没有，但**字级转换拼出来碰巧和我们一样**（`物业 → 物業`
// 就是这样）。反过来上游有同一个键、值却不同，那是我们在**覆盖**它的译法，
// 风险类别和「新增一个词」完全不同：上游哪天改了主意，我们会静默保留自己那份。
//
// 所以这里分三类。跑完 `sync:opencc` 之后看一眼 A 组有没有变长。
const upstream = new Map<string, Array<[string, string]>>();
for (const dictName of DICT_NAMES) {
  if (dictName === "CNTWPhrases") continue;
  for (const line of dict(dictName).split("|")) {
    const i = line.indexOf(" ");
    if (i <= 0) continue;
    const k = line.slice(0, i);
    if (!upstream.has(k)) upstream.set(k, []);
    upstream.get(k)!.push([dictName, line.slice(i + 1)]);
  }
}

const official = build("cn", "twp", null); // 官方链条，不挂我们的词表
const overrides: string[] = [];
const equivalent: string[] = [];
const additions: string[] = [];
for (const [k, v] of entries) {
  const up = upstream.get(k);
  if (up) overrides.push(`  ${k} → 我们 ${v}   上游 ${up.map(([n, x]) => `${x} (${n})`).join("  ")}`);
  else if (official(k) === v) equivalent.push(`  ${k} → ${v}`);
  else additions.push(`  ${k} → 我们 ${v}   官方链条 ${official(k)}`);
}

console.log(`\n和上游的关系（键值完全相同的纯重复应恒为 0，出现了就该删）`);
console.log(`  A 上游有同一个键、值不同（我们在覆盖上游译法）: ${overrides.length}`);
for (const l of overrides) console.log(l);
console.log(`  B 上游无此键，但官方链条拼出来一样: ${equivalent.length}`);
for (const l of equivalent) console.log(l);
console.log(`  C 上游无此键，官方链条也给不出（纯新增）: ${additions.length}`);
for (const l of additions) console.log(l);
console.log(
  `\n  注：B 组不等于「可以删」——显式 \`loadCustomPhrases: true\` 的 \`cn→tw\` 也套词表，\n` +
    `  而 OpenCC 的词汇转换只在 \`twp\` 里做，那个方向上 B 组是唯一来源（默认 \`cn→tw\`\n` +
    `  不套，这正是官方 s2tw 用例全过的前提）。删不删以上面的消融为准。`
);
