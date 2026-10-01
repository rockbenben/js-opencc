# 收养 OpenCC 小篆 + 修 `@reverse-prefer` 反查偏差 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 biweekly OpenCC sync 重新跑绿（issue #2），办法是照上游 `ef9748b6` 收养小篆字典与 `t2seal`/`seal2t`/`s2seal` 三个 config，并顺手让反查字典生成器遵守上游 `@reverse-prefer`。

**Architecture:** 两处结构性改动加一次数据收养。(1) `src/presets.ts` 的 `variants2standard` / `standard2variants` 从「一侧 = 一个合并 trie」推广为「一侧 = **步骤列表**，每步仍是一个合并 trie」——小篆两侧都是两步顺序链，实测合并成一个 trie 与顺序执行在 1080 个键里差 1007 条。(2) 同步脚本的转换链对账改成按步切片比对，于是 `s2seal` 的三步链逐字对齐上游 JSON。(3) 反查生成抽出 `scripts/lib/reverse-dict.ts`，实现上游 `common.py` 的 `Dict.swap()`（偏好项提到候选首位，指向不存在的候选就中止）。

**Tech Stack:** TypeScript 5（`moduleResolution: bundler`，源内一律写 `.js` 后缀导入）、tsx、vitest 1、rollup 4（UMD 三份 × min/未min）、ESLint 9 flat config。词典原始文本从 `BYVoid/OpenCC@master` 拉。

**Spec:** `docs/superpowers/specs/2026-10-01-opencc-seal-adoption.md`（上游事实、实测数字、六条决策都在那里；本计划按它论证）

## Global Constraints

- 行尾：仓库 `* text=auto` + 本机 `core.autocrlf=true`，blob 是 LF、工作树是 CRLF。写完新文件不要手工改行尾，`git diff --stat` 只该出现真实内容行。**不要**在本机跑 `npm run sync:opencc` 之后提交 `test/fixtures/opencc-testcases.json` 的整文件重排（上游是 LF，工作树会变 LF）。
- `src/dict/`、`data/official/`、`dist/` 都在 `.gitignore` 里：字典模块由 `npm run sync:opencc` 生成，**不提交**。`.opencc-sync.json` 与 `test/fixtures/opencc-testcases.json` **要提交**（CI 靠前者的 diff 决定要不要发版）。
- 词典/字典里需要出现的裸码位一律写转义：`no-bare-chars.test.ts` 扫 `src` `test` `scripts` `docs` 与根目录 `.md`/`.json`，禁 C0 控制字符、PUA（U+E000–U+F8FF）、CJK 兼容汉字（U+F900–U+FAFF）。小篆字符本身合法，但测试里更该用 `String.fromCodePoint(0x3d003)` 或直接从 fixture 取期望值。
- 本机（Git Bash + Windows）命令陷阱：`node --test <目录>` 报 `MODULE_NOT_FOUND`，一律走 `npm test` / `npx vitest run <文件>`；stdout 含 CJK 的行可能被吞，判定内容要落盘用 Read 看，或只打印数字。
- 注释纪律：不写会漂移的数字（「本轮测试数」「556 条」这类不进代码注释，只进 README 的对账句），替换措辞要自然。
- 提交纪律：一个功能域一个 commit，`type:` 用英文、描述用该仓历史语言（本仓是中文），禁止署名，不 push。
- 不碰：`data/custom/ProtectedDict.txt`、`CNTWPhrases`、`html-converter.ts`、`IGNORED_DICT_FILES` 里的 `CJK_Compatibility_Ideographs`（它仍不在任何 `conversion_chain` 里，归一化继续走 `String.normalize("NFC")`）。

## 文件布局（谁负责什么）

| 文件 | 本计划里的职责 |
| --- | --- |
| `scripts/lib/reverse-dict.ts`（新建） | 反查字典生成的唯一实现：展开候选、读 `# @reverse-prefer:`、按上游语义选候选 |
| `scripts/sync-opencc.ts` | 名单对账 / 链对账 / 切段对账 / 生成与写盘；小篆在这里被收养 |
| `src/presets.ts` | locale 链的**唯一**真相：`LocaleCode`、两侧步骤表、`segmentationDictsFor`、`phraseDictDirection` |
| `src/converter.ts` | `getDictFiles`（按步展开成 groups）、`LocalePreset`、`ConverterBuilder`、懒加载 `dictLoaders` |
| `src/bundles/full.ts` | UMD 全量包：直接 import 每本字典，链走同一份 presets |
| `src/bundles/cn2t.ts` `src/bundles/t2cn.ts` | 单向轻包：各自窄化 locale 联合 + 「本包不含此 locale」守卫 |
| `test/reverse-dict.test.ts`（新建） | 生成器语义单测（真实 JP 行做夹具） |
| `test/upstream-parity.test.ts` | 官方 testcases 全量对账；小篆 3 个 config 接进来；`t2jp` 三条偏差的行为证人 |
| `test/bundles.test.ts` `test/converter.test.ts` | bundle 与 presets 的一致性不变量、locale 组合冒烟、幂等 |
| `README.md` `README.zh-Hant.md` `docs/comparison.md` `CHANGELOG.md` `.opencc-sync.json` `test/fixtures/opencc-testcases.json` | 声明与数据的对账 |

---

## Task 1: 反查生成器遵守 `@reverse-prefer`

现网 `t2jp` 有三条选错候选（`鹽→䀋`、`鋪→舖`、`莊→庄`，OpenCC 给 `塩`/`舗`/`荘`），成因是
`scripts/sync-opencc.ts` 的 `reverseEntries` 只做「首候选 + identity 优先」，不读上游的
`# @reverse-prefer:` 注释。本任务把反查逻辑抽成模块并实现上游语义；**不重生成字典**（那是
Task 3 跑 `npm run sync:opencc` 时顺带完成的，此刻跑它会刷新 testcases 并让 parity 套件红）。

**Files:**
- Create: `scripts/lib/reverse-dict.ts`
- Create: `test/reverse-dict.test.ts`
- Modify: `scripts/sync-opencc.ts:346-373`（删掉本地 `reverseEntries`）、`scripts/sync-opencc.ts:459-493`（生成循环改用新模块）

**Interfaces:**
- Consumes: 无（本任务是第一个）
- Produces:
  - `parseReversePreferences(raw: string): Map<string, string>`
  - `expandDictForReverse(raw: string): Array<[string, string]>`
  - `reverseEntries(entries: Array<[string, string]>, preferences?: Map<string, string>): Array<[string, string]>` —— 抛 `Error` 当偏好指向不存在的候选
  - 位置约定：`scripts/sync-opencc.ts` 里以 `"./lib/reverse-dict.js"` 导入

- [ ] **Step 1: 写失败的单测**

新建 `test/reverse-dict.test.ts`。夹具是 `JPShinjitaiCharacters.txt` 里真实相关的 7 行（键在左、
候选以空格分隔在右，制表符分隔）加 3 条偏好注释：

```ts
import { describe, it, expect } from "vitest";
import { expandDictForReverse, parseReversePreferences, reverseEntries } from "../scripts/lib/reverse-dict.js";

// JPShinjitaiCharacters.txt 的真实切片（键=日本新字体，值=OpenCC 标准繁体候选）。
// 反查之后 莊/鋪/鹽 各有多个候选，上游用 @reverse-prefer 钉住要哪个。
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

const pick = (raw: string) => new Map(reverseEntries(expandDictForReverse(raw), parseReversePreferences(raw)));

describe("反查字典生成：@reverse-prefer", () => {
  it("按名字偏好的候选胜出，而不是文件顺序或 identity", () => {
    const rev = pick(JP_SLICE);
    expect(rev.get("鹽")).toBe("塩");
    expect(rev.get("鋪")).toBe("舗");
    expect(rev.get("莊")).toBe("荘");
  });

  it("没有偏好的键：identity 候选优先于文件顺序", () => {
    // 上游只按文件顺序（今天恰好是码位序）取首个；我们的 identity 兜底是给
    // 「identity 排在后面」的未来数据留的保险，不该盖过显式偏好。
    const rev = pick("甲\t乙\n乙\t乙");
    expect(rev.get("乙")).toBe("乙");
  });

  it("偏好指向不存在的候选就中止，不静默忽略", () => {
    const raw = "# @reverse-prefer: 甲 丙\n甲\t乙";
    expect(() => reverseEntries(expandDictForReverse(raw), parseReversePreferences(raw))).toThrow(/reverse-prefer/);
  });

  it("单字段写法是 identity 偏好（上游 1-field form）", () => {
    const prefs = parseReversePreferences("# @reverse-prefer: 才\n才\t才\n纔\t才");
    expect(prefs.get("才")).toBe("才");
    expect(pick("# @reverse-prefer: 才\n才\t才\n纔\t才").get("才")).toBe("才");
  });
});
```

- [ ] **Step 2: 跑到失败**

Run: `npx vitest run test/reverse-dict.test.ts`
Expected: FAIL —— `Cannot find module .../scripts/lib/reverse-dict.js`（模块还不存在）

- [ ] **Step 3: 写实现**

新建 `scripts/lib/reverse-dict.ts`：

```ts
/**
 * 反查字典（`*Rev`）的生成逻辑，逐条对齐 OpenCC 的
 * `data/scripts/common.py` 里 `Dict.swap()`。同步脚本是本模块唯一的运行时用户，
 * 单独放一个文件只为能被测试直接调用——字典要重新生成才能验证生成器，
 * 而重新生成会同时刷新官方 testcases，那一步属于收养小篆的那次提交。
 */

const REVERSE_PREFER_PREFIX = "# @reverse-prefer:";

/**
 * `# @reverse-prefer: K [V]` —— 反查表里键 `K` 必须取候选 `V`。
 * 只给一个字段时 `V` 就是 `K` 本身，即「identity 优先」的显式写法。
 */
export function parseReversePreferences(raw: string): Map<string, string> {
  const preferences = new Map<string, string>();
  for (const line of raw.split(/\r?\n/)) {
    const text = line.trim();
    if (!text.startsWith(REVERSE_PREFER_PREFIX)) continue;
    const fields = text.slice(REVERSE_PREFER_PREFIX.length).trim().split(/\s+/).filter(Boolean);
    if (fields.length !== 1 && fields.length !== 2) {
      throw new Error(`Invalid reverse preference line: ${text}`);
    }
    preferences.set(fields[0], fields[fields.length - 1]);
  }
  return preferences;
}

/**
 * 正向文本 → `[key, value]` 的**全部**候选展开。
 *
 * 反查必须建在全部候选上：`JPShinjitaiCharacters` 有 `弁→辨 辯 瓣`，只取首候选
 * 会把 `辯→弁`、`瓣→弁` 丢掉，`t2jp` 于是把 `辯護士` 留在原地（官方用例 case_040 抓到过）。
 */
export function expandDictForReverse(raw: string): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  for (const line of raw.split(/\r?\n/)) {
    const text = line.trim();
    if (!text || text.startsWith("#")) continue;
    const tab = text.indexOf("\t");
    if (tab < 0) continue;
    const key = text.slice(0, tab);
    for (const value of text.slice(tab + 1).trim().split(/\s+/).filter(Boolean)) {
      entries.push([key, value]);
    }
  }
  return entries;
}

/**
 * `value → key` 反查，每个反查键只留一个候选（打包格式一本 trie 一个值）。
 *
 * 选哪个的优先级，和上游一致：
 * 1. `@reverse-prefer` 点名的候选——它把该候选提到首位；
 * 2. 没有偏好时，identity 候选（`才 → 才`）压过文件顺序。上游没有这一条兜底，
 *    今天的 `HKVariants` / `TWVariants` / `JPShinjitaiCharacters` 里 identity 恰好
 *    码位最小、排在最前，first-wins 已经选中它。那个顺序是今天码位表的巧合，
 *    不是上游契约：将来某组候选把 identity 排在后面，没有这条兜底就会发错映射。
 *    别以「从没命中过」为理由删掉它。
 * 3. 都没有时取文件顺序的第一个（多字典列了同名的首选词）。
 */
export function reverseEntries(entries: Array<[string, string]>, preferences: Map<string, string> = new Map()): Array<[string, string]> {
  const candidates = new Map<string, string[]>();
  for (const [key, value] of entries) {
    const list = candidates.get(value);
    if (list) list.push(key);
    else candidates.set(value, [key]);
  }

  for (const [key, preferred] of preferences) {
    const list = candidates.get(key);
    if (!list || !list.includes(preferred)) {
      // 上游同样抛错（common.py 的 ValueError）。静默忽略等于发一条没人要求的映射。
      throw new Error(`@reverse-prefer: ${key} -> ${preferred} has no matching mapping`);
    }
    list.unshift(list.splice(list.indexOf(preferred), 1)[0]);
  }

  const out: Array<[string, string]> = [];
  for (const [value, keys] of candidates) {
    if (preferences.has(value)) {
      out.push([value, keys[0]]);
      continue;
    }
    const identity = keys.find((k) => k === value);
    out.push([value, identity ?? keys[0]]);
  }
  return out;
}
```

- [ ] **Step 4: 跑到通过**

Run: `npx vitest run test/reverse-dict.test.ts`
Expected: PASS（4 条）

- [ ] **Step 5: 把同步脚本接到模块上，删掉本地副本**

`scripts/sync-opencc.ts`：删掉 `reverseEntries` 整个函数（`346-373` 行，连同上面那段
「identity 必须胜出」的注释——它已经搬进 `scripts/lib/reverse-dict.ts`），加导入：

```ts
import { expandDictForReverse, parseReversePreferences, reverseEntries } from "./lib/reverse-dict.js";
```

把生成循环里手写的展开段（`459-493` 行中构造 `expanded` 的 12 行 `for` 循环）换成：

```ts
    const entries = reverseEntries(expandDictForReverse(srcRaw), parseReversePreferences(srcRaw));
```

（原本写在这段上面的「反查必须用全部候选」注释跟着搬进模块，脚本里只留一行指路。）

- [ ] **Step 6: 类型检查与全量测试仍然绿**

Run: `npm run typecheck && npx vitest run`
Expected: PASS —— 此刻磁盘上的字典模块还是旧的，`t2jp` 三条错仍存在于数据里，但没有测试钉它（Task 3 才钉），所以套件全绿是预期的。

- [ ] **Step 7: 故意破坏一次，确认证人会咬**

把 `reverseEntries` 里 `list.unshift(...)` 那行临时注释掉，跑 `npx vitest run test/reverse-dict.test.ts`，
Expected: 第一条用例变红（`鹽` 回到 `䀋`）。恢复该行，再跑一次确认回到 PASS。

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/reverse-dict.ts test/reverse-dict.test.ts scripts/sync-opencc.ts
git commit -m "fix(sync): 反查字典遵守上游 @reverse-prefer

上游 data/scripts/common.py 的 Dict.swap() 会按 `# @reverse-prefer: K V` 把 V 提到
候选首位，我们只做「首候选 + identity 优先」。现网 JPShinjitaiCharactersRev 因此
有三条选错：t2jp(鹽)=䀋 / t2jp(鋪)=舖 / t2jp(莊)=庄，OpenCC 给 塩 / 舗 / 荘。官方
testcases 没有这三个字，556 条比对一直是绿的。

生成逻辑抽到 scripts/lib/reverse-dict.ts，好让它能被单测直接调用：重生成字典会
顺带刷新官方 testcases，那步属于收养小篆的提交。"
```

---

## Task 2: `presets` 的链形状推广到「一步一 trie 的步骤列表」

纯重构，**不接小篆、不改任何输出**。做完之后 `s2seal` 那种三步链才表达得出来；
判据是「套件全绿且 README/官方用例数字一字未动」。

实测依据（见 spec）：小篆两侧各两步，合并成一个 trie 与顺序执行不等价
（`t2seal` 1080 键里 1007 条不同、`seal2t` 11328 键里 933 条不同）。

**Files:**
- Modify: `src/presets.ts:16`（`LocaleCode` 不动）、`:26-39`（`variants2standard` 文档+值）、`:41-56`（`standard2variants`）、`:61`（`allDictFiles`）
- Modify: `src/converter.ts:37-45`（`LocalePreset`）、`:52-75`（`ConverterBuilder`）、`:98-116`（`getDictFiles`）
- Modify: `src/bundles/full.ts:101-107`（`Converter`）、`:140-141`（`Locale`）
- Modify: `src/bundles/cn2t.ts:80-95`
- Modify: `src/bundles/t2cn.ts:70-85`（同一形状）
- Modify: `scripts/sync-opencc.ts:51-74`（`CONFIG_CHAINS` 文档）、`:155-197`（按步比对）
- Modify: `test/bundles.test.ts:94-99`（不变量走进嵌套层）

**Interfaces:**
- Consumes: Task 1 无（本任务不碰反查）
- Produces:
  - `variants2standard: Record<string, string[][]>` / `standard2variants: Record<string, string[][]>` —— 值 = 步骤列表，**步骤顺序 = 上游 `conversion_chain` 顺序**，每步内部仍是「优先级最高的字典排最后」
  - `getDictFiles(from, to): string[][]` —— 语义不变（每个内层数组是一个合并 trie 的字典名单），只是现在可能多于 2 个
  - `LocalePreset.from/to: Record<string, DictGroup[]>`

- [ ] **Step 1: 先写会红的不变量测试**

`test/bundles.test.ts` 里把「full bundle carries every preset dict」换成逐层展开，并新增一条
「presets 每一步都是非空名单、且 step 数与侧对得上」的结构测试：

```ts
  // 链形状从「一侧一个合并 trie」变成「一侧若干步」。两侧都跑遍每一步，
  // 才能守住「full bundle 带齐 presets 要的每本字典」这条不变量——
  // 少一步就多一处 `dict[name] === undefined`，而 undefined 进 trie 是静默少转。
  it("full bundle carries every preset dict, step by step", () => {
    for (const [side, all] of [
      ["from", Locale.from],
      ["to", Locale.to],
    ] as const) {
      for (const [locale, steps] of Object.entries(all)) {
        expect(Array.isArray(steps[0]), `${side}.${locale} 第一步不是字典名单`).toBe(true);
        for (const [i, group] of steps.entries()) {
          expect(group.length, `${side}.${locale}[${i}] 空步骤`).toBeGreaterThan(0);
          for (const d of group) expect(typeof d, `${side}.${locale}[${i}]`).toBe("string");
        }
      }
    }
  });
```

- [ ] **Step 2: 跑到失败**

Run: `npx vitest run test/bundles.test.ts`
Expected: FAIL —— 现在的 `Locale.from[locale]` 是 `DictLike[]`（字符串数组），`steps[0]` 是字符串，
`Array.isArray(undefined)` → `false`，报 `from.cn 第一步不是字典名单`。

- [ ] **Step 3: 改 `src/presets.ts`**

两个记录的值套一层数组，文档注释同步改写（保留原有「REVERSE of OpenCC's order」那条优先级说明，
再补一步的顺序说明）：

```ts
/**
 * Dictionary file names for converting from variants to OpenCC standard.
 *
 * 值 = **转换步骤列表**，按 OpenCC `conversion_chain` 的顺序执行；每一步是一个字典名单，
 * 整个名单合进一个 trie。名单内部顺序是 OpenCC 顺序的**反**：上游首匹配即停，我们的
 * trie 后写覆盖，所以优先级最高的（词组字典）要排在**最后**。
 *
 * 一步合并多个字典是 OpenCC 的 `group / union`，跨步合并则不是——两侧都是两步的
 * 小篆链若并进一个 trie，1080 个键里有 1007 个结果和上游不同（年→秊 之后还要再查一次
 * 汉字→小篆，合并 trie 只会走一遍）。所以链要按步走，别为了省一次遍历把它拍平。
 *
 * 镜像的链：`tw2t` / `hk2t` / `tw2sp` / `hk2sp`。
 */
export const variants2standard: Record<string, string[][]> = {
  cn: [["STCharacters", "STPhrases_GeneratedFromRegionalPhrases", "STPhrases"]],
  hk: [["HKVariantsRev", "HKVariantsRevPhrases"]],
  hkp: [["HKVariantsRev", "HKVariantsRevPhrases", "HKPhrasesRev"]],
  tw: [["TWVariantsRev", "TWVariantsRevPhrases"]],
  twp: [["TWVariantsRev", "TWVariantsRevPhrases", "TWPhrasesRev"]],
  jp: [["JPShinjitaiCharacters", "JPShinjitaiPhrases"]],
};

export const standard2variants: Record<string, string[][]> = {
  cn: [["TSCharacters", "TSPhrases"]],
  hk: [["HKVariants", "HKVariantsPhrases"]],
  hkp: [["HKVariants", "HKVariantsPhrases", "HKPhrases"]],
  tw: [["TWVariants", "TWVariantsPhrases"]],
  twp: [["TWVariants", "TWVariantsPhrases", "TWPhrases"]],
  jp: [["JPShinjitaiCharactersRev"]],
};

export const allDictFiles = [...new Set([...Object.values(variants2standard).flat(2), ...Object.values(standard2variants).flat(2)])];
```

`variants2standard.cn` 上面那段讲「generated dict 夹在中间」的注释保持原位（内容仍然成立）。

- [ ] **Step 4: 改 `src/converter.ts`**

```ts
export interface LocalePreset {
  from: Record<string, DictGroup[]>;
  to: Record<string, DictGroup[]>;
  segmentation?: Record<string, DictLike>;
}
```

`ConverterBuilder` 里两处 `dictGroups.push(...)` 改为逐步 push：

```ts
    if (options.from !== "t") {
      for (const step of localePreset.from[options.from] ?? []) dictGroups.push(step);
    }
    if (options.to !== "t") {
      for (const step of localePreset.to[options.to] ?? []) dictGroups.push(step);
    }
```

`getDictFiles` 同样按步展开（其余逻辑、报错文案不动）：

```ts
  if (from !== "t") {
    const steps = variants2standard[from];
    if (!steps) throw new Error(`Unknown 'from' locale: ${from}`);
    for (const step of steps) if (step.length) groups.push(step);
  }
  if (to !== "t") {
    const steps = standard2variants[to];
    if (!steps) throw new Error(`Unknown 'to' locale: ${to}`);
    for (const step of steps) if (step.length) groups.push(step);
  }
```

`getDictFiles` 的 JSDoc 里「inner array is one conversion step」的解释仍然准确，
只在结尾补一句：步数由 presets 决定，`s2seal` 这类链会多于两组。

- [ ] **Step 5: 改三个 bundle**

`src/bundles/full.ts`：

```ts
  if (options.from !== "t") {
    for (const step of variants2standard[options.from]) {
      dictGroups.push(step.map((name) => dict[name]));
    }
  }
  if (options.to !== "t") {
    for (const step of standard2variants[options.to]) {
      dictGroups.push(step.map((name) => dict[name]));
    }
  }
```

```ts
const Locale = {
  from: Object.fromEntries(Object.entries(variants2standard).map(([locale, steps]) => [locale, steps.map((step) => step.map((name) => dict[name]))])),
  to: Object.fromEntries(Object.entries(standard2variants).map(([locale, steps]) => [locale, steps.map((step) => step.map((name) => dict[name]))])),
};
```

`src/bundles/cn2t.ts`：`Array.isArray(dictFiles)` 的保护要落到**第一步**（值现在是二维的，
`standard2variants["constructor"]` 对 `Array.isArray` 仍为 false，但空步骤会溜过去）：

```ts
  if (options.to !== "t") {
    const steps = standard2variants[options.to];
    if (!Array.isArray(steps) || !Array.isArray(steps[0])) throw new Error(`Unknown 'to' locale: ${options.to}`);
    for (const step of steps) {
      dictGroups.push(
        step.map((name) => {
          const d = dictMap[name];
          if (typeof d !== "string") throw new Error(`Dictionary ${name} missing from cn2t bundle`);
          return d;
        })
      );
    }
  }
```

`src/bundles/t2cn.ts` 对 `variants2standard[options.from]` 做完全一样的改动（错误文案是
`Unknown 'from' locale` / `missing from t2cn bundle`）。

- [ ] **Step 6: 改同步脚本的链比对（按步切片）**

`scripts/sync-opencc.ts` 的 `verifyChainsAgainstUpstream`：现在取的是
`conversion_chain[step].dict` 一步，改为取整条链、按我们的步数切片，逐步比对。
`CONFIG_CHAINS` 的 `step` 字段含义写成「我们这一侧在 `conversion_chain` 里的**起始**下标」。

```ts
    let chain: Array<{ dict?: unknown }>;
    try {
      const res = await fetch(`${OPENCC_CONFIG_URL}/${config}.json`);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      chain = ((await res.json()) as { conversion_chain?: Array<{ dict?: unknown }> }).conversion_chain ?? [];
    } catch (e) {
      console.warn(`  Chain check skipped: could not fetch ${config}.json (${(e as Error).message})`);
      return false;
    }

    const ours = (side === "to" ? standard2variants : variants2standard)[locale] ?? [];
    if (step + ours.length > chain.length) {
      drift.push(`  ${config}: our ${side}.${locale} needs ${ours.length} step(s) from index ${step}, upstream chain has only ${chain.length}`);
      continue;
    }
    ours.forEach((ourStep, i) => {
      const upstream = collectDicts(chain[step + i]?.dict).filter((d) => !UNAVAILABLE_UPSTREAM_DICTS.includes(d));
      // presets 优先级最高的排最后，上游排最前：比之前反转我们这一侧
      const oursReversed = [...ourStep].reverse();
      if (JSON.stringify(oursReversed) !== JSON.stringify(upstream)) {
        drift.push(`  ${config} step ${step + i}: upstream [${upstream.join(" + ")}]  vs  presets.${side === "to" ? "standard2variants" : "variants2standard"}.${locale}[${i}] [${oursReversed.join(" + ")}]`);
      }
    });
```

- [ ] **Step 7: 全绿**

Run: `npm run typecheck && npm test`
Expected: PASS —— 与 Task 1 结束时的用例数一致（`test/reverse-dict.test.ts` 的 4 条 + 原有各条），
且 `upstream-parity` 仍是 16 个 config。若 `npx vitest run` 里有链对账相关测试引用了旧形状，按新形状改测试，不要改判据。

- [ ] **Step 8: 故意破坏一次**

把 `standard2variants.twp` 的两本词组字典拆成两步（`[["TWVariants","TWVariantsPhrases"],["TWPhrases"]]`），
跑 `npm test`。Expected: `t2s`/`s2twp` 或 `tw2sp` 方向的 parity / converter 用例变红——证明「按步 vs 合并」
这件事在套件里看得见，不是纸面论证。恢复。

- [ ] **Step 9: Commit**

```bash
git add src/presets.ts src/converter.ts src/bundles/full.ts src/bundles/cn2t.ts src/bundles/t2cn.ts scripts/sync-opencc.ts test/bundles.test.ts
git commit -m "refactor(presets): 一侧的链改成「步骤列表」，每步仍是一个合并 trie

小篆两侧都是两步顺序链（t2seal = SealVariants 再 SealCharactersRev），而 presets 目前
一侧只能表达一个合并 trie。实测合并 ≠ 顺序：t2seal 1080 键里 1007 条不同，seal2t
11328 键里 933 条不同。同步脚本的链对账跟着改成按步切 upstream conversion_chain。

纯重构，输出不变：所有现有 locale 仍是单步。"
```

---

## Task 3: 收养小篆（同步 + presets + bundle + 官方对账，一次提交）

这一步会跑 `npm run sync:opencc`：下载 `SealCharacters`/`SealVariants`、生成两本 `*Rev`
（此刻带上 Task 1 的修复，`t2jp` 三条偏差随旧字典一起被重写）、刷新 `.opencc-sync.json` 与
官方 testcases（19 个 config / 571 条期望）。所以 presets、bundle、parity 必须和它在**同一个提交**里，
否则中间的提交点是红的。

**Files:**
- Modify: `scripts/sync-opencc.ts:24-41`（`OFFICIAL_DICT_FILES`）、`:62-74`（`CONFIG_CHAINS`）、`:97-98`（`CONFIG_NO_SEGMENTATION`）、`:112-120`（`REVERSE_DICT_MAPPINGS`）
- Modify: `src/presets.ts:16`（`LocaleCode`）、两个记录各加 `seal`、`segmentationDictsFor` 文档注释、`:16` 上方的 locale 说明
- Modify: `src/bundles/full.ts:11-31`（4 本 import）、`:33-54`（`dict` map）
- Modify: `src/bundles/cn2t.ts`、`src/bundles/t2cn.ts`（「本 bundle 不含此 locale」守卫）
- Modify: `test/upstream-parity.test.ts:36-53`（`CONFIG_LOCALES` + 注释）、新增 `t2jp` 偏差行为证人
- Modify: `test/bundles.test.ts`（单向包拒绝 `seal` 的守卫消息）
- Modify: `test/converter.test.ts:347`（`LOCALES` 加 `seal`）、`:328`（幂等对加 `cn↔seal`）
- Regenerated（要提交）: `.opencc-sync.json`、`test/fixtures/opencc-testcases.json`

**Interfaces:**
- Consumes: Task 2 的 `Record<string, string[][]>`；Task 1 的 `reverseEntries(entries, preferences)`
- Produces: `LocaleCode` 含 `"seal"`；`variants2standard.seal = [["SealCharacters"], ["SealVariantsRev"]]`；`standard2variants.seal = [["SealVariants"], ["SealCharactersRev"]]`；`dictLoaders` 多出 4 个键

- [ ] **Step 1: 写会红的行为证人（在接数据之前）**

`test/upstream-parity.test.ts` 末尾「本包自己的行为」那组里加一节。期望值从 `src/dict` 的
正确数据反推，但**不写裸码位**（`no-bare-chars` 只禁 PUA/兼容汉字，小篆合法；这里用
`String.fromCodePoint` 是为了让源码在任意编辑器里可读）：

```ts
describe("反查表选词遵守 @reverse-prefer（现网曾选错三条）", () => {
  // 上游 JPShinjitaiCharacters 给 鹽 的候选是 䀋 / 塩，注释点名要 塩；
  // 早期实现只按文件顺序取首个，于是 t2jp(鹽) 输出一个豆腐字。
  it("t2jp 取被偏好的候选，而不是文件顺序的首个", async () => {
    const t2jp = await createConverter({ from: "t", to: "jp", loadCustomPhrases: false }, []);
    expect(t2jp("鹽")).toBe("塩"); // 曾给 䀋
    expect(t2jp("鋪")).toBe("舗"); // 曾给 舖
    expect(t2jp("莊")).toBe("荘"); // 曾给 庄（简体形）
  });

  it("小篆链两步顺序：年先经 SealVariants 成 秊，再查汉字→小篆", async () => {
    const t2seal = await createConverter({ from: "t", to: "seal", loadCustomPhrases: false }, []);
    expect(t2seal(String.fromCodePoint(0x5e74))).toBe(String.fromCodePoint(0x3e421));
  });
});
```

- [ ] **Step 2: 跑到失败**

Run: `npx vitest run test/upstream-parity.test.ts`
Expected: FAIL —— 前两条报 `鹽` 仍是 `䀋`（字典还没重生成），第三条报 `Unknown 'to' locale: seal`。

- [ ] **Step 3: 同步脚本收养字典与 config**

`scripts/sync-opencc.ts`：

- `OFFICIAL_DICT_FILES` 按上游列目录的顺序（大小写不敏感）插在 `STPhrases` 与 `TSCharacters` 之间：

```ts
  "STCharacters",
  "STPhrases",
  // Unicode 18.0 小篆区块（上游 ef9748b6 / PR #1494）。键全在补充平面，
  // 显示要字型支持，上游把它标成实验性 config——我们照单收养，链对账覆盖得到。
  "SealCharacters",
  "SealVariants",
  "TSCharacters",
```

- `REVERSE_DICT_MAPPINGS` 加两行（上游同名的 `*Rev` 也是构建时 `reverse.py` 生成）：

```ts
  SealCharactersRev: "SealCharacters",
  SealVariantsRev: "SealVariants",
```

- `CONFIG_CHAINS` 加三条（`step` = 我们这一侧在 `conversion_chain` 的起始下标）：

```ts
  { config: "t2seal", side: "to", locale: "seal", step: 0 },
  { config: "seal2t", side: "from", locale: "seal", step: 0 },
  { config: "s2seal", side: "to", locale: "seal", step: 1 },
```

- `CONFIG_NO_SEGMENTATION` 加 `"t2seal", "seal2t", "s2seal"`，并在那段注释里补一句为什么
  多步链也可以不切段（原注释的理由是「只有存在第二步才需要切」，小篆是反例）：

```ts
/** Configs that must NOT declare a segmentation — a new one appearing is drift too. */
const CONFIG_NO_SEGMENTATION = ["s2t", "t2s", "t2tw", "tw2t", "t2hk", "hk2t", "t2jp", "jp2t", "t2seal", "seal2t", "s2seal"];
```

注释补充（接在原有那段后面，别改动原句）：

```
 * 小篆三个 config 是多步链却不切段：它的后续步骤只映射单字（`SealVariants` /
 * `SealCharactersRev` 的键都恰好一个码位），没有会在跨词边界上乱咬的词组表，
 * 少一刀不多、多一刀不少。所以「有第二步就该切」这条经验不能反过来用。
```

- [ ] **Step 4: presets 接上 `seal`**

`src/presets.ts`：

```ts
 * - jp: Japanese Shinjitai
 * - seal: 小篆（Unicode 18.0 篆書區塊，實驗性：輸出需要支援該區塊的字型）
 * - t: OpenCC standard Traditional Chinese
 */
export type LocaleCode = "cn" | "tw" | "twp" | "hk" | "hkp" | "jp" | "seal" | "t";
```

```ts
  jp: [["JPShinjitaiCharacters", "JPShinjitaiPhrases"]],
  // 两步都是单字映射，顺序就是上游 seal2t.json 的顺序，不能并进一个 trie。
  seal: [["SealCharacters"], ["SealVariantsRev"]],
```

```ts
  jp: [["JPShinjitaiCharactersRev"]],
  // t2seal.json：先 现代标准字 → 《說文》隸定字，再 汉字 → 小篆。
  seal: [["SealVariants"], ["SealCharactersRev"]],
```

`segmentationDictsFor` 的文档里那句「`jp` is excluded deliberately」之后补一行 `seal` 同理
（它没有源文字符表 keyed 的单字表可言）；函数体不动（`REGIONAL_VARIANTS` 不含 `seal`，
`cn ↔ seal` 天然返回 `[]`，与上游一致，Step 3 的 `CONFIG_NO_SEGMENTATION` 会替你咬住）。

- [ ] **Step 5: bundle 接上**

`src/bundles/full.ts`：import 4 本并塞进 `dict`（`// Invariant: dict carries every name in allDictFiles`
那条注释就是这条改动的判据）：

```ts
import SealCharacters from "../dict/SealCharacters.js";
import SealCharactersRev from "../dict/SealCharactersRev.js";
import SealVariants from "../dict/SealVariants.js";
import SealVariantsRev from "../dict/SealVariantsRev.js";
```

```ts
  JPShinjitaiPhrases,
  SealCharacters,
  SealCharactersRev,
  SealVariants,
  SealVariantsRev,
```

`src/bundles/cn2t.ts` / `t2cn.ts`：单向包不带小篆（spec 决策 4）。在 `Unknown 'to' locale` 检查
之后、取字典之前加一条守卫，消息要指出该用 full：

```ts
const BUNDLE_TARGETS: readonly string[] = ["t", "tw", "twp", "hk", "hkp", "jp"];
```

```ts
    if (!BUNDLE_TARGETS.includes(options.to)) {
      throw new Error(`cn2t bundle does not carry 'to: ${options.to}' — seal needs the full bundle`);
    }
```

`t2cn.ts` 用 `BUNDLE_SOURCES` 与 `from`，文案 `t2cn bundle does not carry 'from: ...'`。

同一步把守卫钉进 `test/bundles.test.ts` 的「throw on a direction the bundle cannot serve」那组
（消息必须**不是** `Dictionary ... missing from ... bundle`——那条消息指控的是一个不存在的打包 bug，
这是本仓既有测试注释里写明的教训）：

```ts
    // 单向包按设计不带小篆（spec 决策 4）。消息要指向 full bundle，而不是「缺字典」。
    expect(() => Cn2t({ to: "seal" as never })).toThrow(/cn2t bundle does not carry 'to: seal'/);
    expect(() => T2cn({ from: "seal" as never })).toThrow(/t2cn bundle does not carry 'from: seal'/);
    expect(() => Cn2t({ to: "seal" as never })).not.toThrow(/missing from/);
```

- [ ] **Step 6: parity 与冒烟测试接上 19 个 config**

`test/upstream-parity.test.ts` 的 `CONFIG_LOCALES` 加三条，并把上方注释里的「16 种全部有映射」
改成不带数字的说法（数字会漂）：

```ts
  t2seal: { from: "t", to: "seal" },
  seal2t: { from: "seal", to: "t" },
  s2seal: { from: "cn", to: "seal" },
```

```ts
/** OpenCC config 名 → 我们的 locale 对。上游 testcases 出现的每个 config 都要在这里，
 *  否则下面的映射检查会抛——那正是「上游加了新 config 而我们静默没跟上」的闸门。 */
```

`test/converter.test.ts`：`LOCALES` 加 `"seal"`（组合冒烟自动扩到 8 个代码），幂等那组的
`[["cn","t"],["t","cn"],["cn","twp"],["twp","cn"]]` 后面加 `["cn","seal"]` 与 `["seal","cn"]`。

- [ ] **Step 7: 跑同步**

Run: `npm run sync:opencc`
Expected（逐项核对日志）：
- `✓ OFFICIAL_DICT_FILES is in sync with upstream.`
- `✓ All 14 conversion chains match upstream config.`
- `✓ All 19 segmentation declarations match upstream config.`
- 下载清单里出现 `SealCharacters (11328 entries)` / `SealVariants (1080 entries)`
- 生成清单里出现 `SealCharactersRev (11231 entries, from SealCharacters)` / `SealVariantsRev (1002 entries, from SealVariants)`
- 退出码 0

- [ ] **Step 8: 全量测试**

Run: `npm run typecheck && npm test`
Expected: PASS —— parity 套件多出 3 个 config 的用例（t2seal 8 / seal2t 6 / s2seal 1 全过），
`@reverse-prefer` 两条行为证人转绿，`KNOWN_DIVERGENCES` 仍是 3 条（TSCharactersExt 那组）。

- [ ] **Step 9: 故意破坏一次，证明小篆不是「装了但没接线」**

任选一处破坏并确认对应测试变红，然后恢复：
1. 把 `standard2variants.seal` 并进一个 trie（`[["SealVariants","SealCharactersRev"]]`）→ t2seal 官方用例应大面积红；
2. 删掉 `full.ts` 的 `SealCharactersRev` import → 「full bundle carries every preset dict」变红；
3. 从 `CONFIG_CHAINS` 删掉 `s2seal` 那条 → 什么都不红（**预期**：这条说明判据只在同步脚本里活着，
   报告时如实写出，别当成已经覆盖）。

- [ ] **Step 10: 确认 diff 面**

Run: `git status --short && git diff --stat`
Expected: 改动落在 `scripts/ src/ test/` + `.opencc-sync.json` + `test/fixtures/opencc-testcases.json`；
`src/dict/`、`data/official/`、`dist/` 不出现在 `git status`（gitignored）。
`git diff -- .opencc-sync.json` 应只多出 `SealCharacters` / `SealVariants` 两行 hash（CI 靠这个 diff 决定发版）。

- [ ] **Step 11: Commit**

```bash
git add -A scripts src test .opencc-sync.json
git commit -m "feat: 收养 OpenCC 小篆对照，sync 重新跑绿（issue #2）

上游 ef9748b6 加了 SealCharacters / SealVariants 和 t2seal/seal2t/s2seal 三个 config，
同步脚本的名单闸门按设计停下来要人拍板。这里选择全部收养：

- presets 多出一个 locale：seal 两侧都是两步链，链形状已由上一个提交准备好。
- 同步脚本把两本字典纳入 OFFICIAL_DICT_FILES，两本 *Rev 走构建时反查生成
  （这次生成顺带带上 @reverse-prefer 的修复，t2jp 的 鹽/鋪/莊 三条随之转正）。
- UMD full bundle 带上小篆；cn2t/t2cn 不带，给出指向 full 的明确错误。
- 官方 testcases 从 16 config 扩到 19，小篆 15 例全过。

上游把这三个 config 标为实验性（输出是 Unicode 18.0 篆書區塊，字型不支持时是豆腐）。
我们照单实现，README 里如实写明这一点。"
```

---

## Task 4: 文档与声明对账 + 端到端验证

README 里那些数字是**给读者的承诺**，必须和同步后的真实数据一致；`docs/comparison.md` 的
测量表同理。这一任务不改行为。

**Files:**
- Modify: `README.md:25`、`:28-41`（地区代码表）、`:192-193`（四道对账的描述）
- Modify: `README.zh-Hant.md` 同三处（`:25`、`:28-41`、`:192-193`）
- Modify: `docs/comparison.md`（`官方 testcases` 那行 + 若需要，词典覆盖一行提小篆）
- Modify: `CHANGELOG.md`（在 `## [1.4.2]` 之上插入新条目）

**Interfaces:**
- Consumes: Task 3 之后仓库里的 `test/fixtures/opencc-testcases.json` 与 `.opencc-sync.json`
- Produces: 无代码接口

- [ ] **Step 1: 先把要写进文档的数字全部量出来（文档里的数字是承诺，不能照抄本计划）**

先构建再量，因为 CHANGELOG 要引用 bundle 增量：

```bash
npm run build:dist
node -e "const fs=require('fs'),z=require('zlib');const rows=[];const f=require('./test/fixtures/opencc-testcases.json');const c=new Set();let n=0;for(const x of f.cases)for(const k of Object.keys(x.expected)){c.add(k);n++}rows.push('configs='+c.size+' expectations='+n+' cases='+f.cases.length);for(const p of ['full.min.js','cn2t.min.js','t2cn.min.js']){const b=fs.readFileSync('dist/umd/'+p);rows.push(p+' raw='+b.length+' gzip='+z.gzipSync(b).length)}fs.writeFileSync('doc-nums.txt',rows.join('\n')+'\n')"
```

Read `doc-nums.txt` 拿到五个数字（config 数、期望总数、例数，以及三个 bundle 的 raw/gzip）。
本机 stdout 有可能吞掉含 CJK 的行，所以判定内容一律落盘再读。bundle 增量拿 `full.min.js`
与 2026-08-21 那次 v1.4.1 产物比：`1,188,816 raw / 493,041 gzip`。
用完删除 `doc-nums.txt`——它是证据不是产物。

同步脚本自己打的 `✓ All N conversion chains` / `✓ All M segmentation declarations` 两行是
README「转换链」「切段声明」那两个数的权威来源（Task 3 Step 7 那次 `npm run sync:opencc` 的输出）。

- [ ] **Step 2: 改 `README.md`**

- 首屏那条：`16 个 config、556 条期望全量比对` → 用 Step 1 的两个数字替换（config 数、期望数）。
- 地区代码表加一行 `| \`seal\` | 小篆（Unicode 18.0 篆書區塊，實驗性：輸出需字型支持） |`（简体版写简体字），
  并把 `七个代码任意组合` 改成对应的新数量词（八个）。
- `:192-193` 那两条：`11 条链` → 链对账条数；`16 个 config 的 segmentation` → config 数。

- [ ] **Step 3: 改 `README.zh-Hant.md`**

同样三处，繁体文案。注意全角标点与简体版一致（本仓惯例：译文保留中文标点）。

- [ ] **Step 4: 给小篆加一句「该不该用」的实话**

README 的用法/说明区（紧跟地区代码表那节之后）加一小段，两版各一份，要点三条，不要写成营销：

- 上游标 `t2seal`/`seal2t`/`s2seal` 为实验性，仅供探索性研究；
- 输出落在 Unicode 18.0 篆書區塊（U+3D000–U+3FC3F），**没有对应字型就是豆腐**；
- 想要印章字形的视觉效果，这条路大概率不是你要的；想要和 OpenCC 行为逐 config 对齐，它就是。

- [ ] **Step 5: 改 `docs/comparison.md` 的对比行**

`| 官方 testcases | 553 / 556 | 505 / 556 |` 一栏**只改我们那一列**：分母 = Step 1 量到的期望总数，
分子 = 分母 − 3（`KNOWN_DIVERGENCES` 里那三条 `TSCharactersExt`）。opencc-js 那一列不动——它不是本仓
依赖，量不了刷新后的 fixture；那个数字属于 2026-08-20 那次测量，表格上方的日期说明就是为它写的。

在该行下面补一句脚注，两个事实分开写：期望总数因小篆 15 例而上涨；opencc-js 没有 `t2seal`/`seal2t`/`s2seal`。
「两边词典差异」那行下面加一句：本包多出 4 本小篆字典（`SealCharacters`、`SealVariants`，
以及构建时反查生成的 `SealCharactersRev`、`SealVariantsRev`）。

- [ ] **Step 6: `CHANGELOG.md` 加条目**

在 `## [1.4.2] — 2026-08-21` 之上插入 `## [Unreleased]`（版本号留到发版那一步由 maintainer 填），
内容三块：

```markdown
## [Unreleased]

### 新增

- **小篆对照**：`seal` 成为第 8 个地区代码，对齐上游新增的 `t2seal` / `seal2t` / `s2seal`
  （OpenCC `ef9748b6`，Unicode 18.0 篆書區塊 U+3D000..U+3FC3F）。上游标为实验性：
  输出需要支持该区块的字型，否则是豆腐。UMD `full` bundle 带上这 4 本字典
  （约 +226 KB raw / +129 KB gzip），`cn2t` / `t2cn` 不带。

### 行为变化

| 场景 | 此前 | 现在 |
| --- | --- | --- |
| `t2jp` 遇到 鹽 / 鋪 / 莊 | 䀋 / 舖 / 庄（简体形混进日文输出） | 塩 / 舗 / 荘，与 OpenCC 一致 |

### 破坏性（类型形状，不影响默认用法）

- `variants2standard` / `standard2variants` 的值从 `string[]` 变成 `string[][]`
  （一侧现在是一串步骤，每步仍是一个合并 trie）。小篆两侧各两步，合并成一个 trie
  实测与顺序执行不等价。直接读这两个导出拼链的人需要同步改一层 `.map`。
```

（CHANGELOG 里那两条 KB 数字必须换成 Step 1 实测的 `full.min.js` raw / gzip 增量，别引用本计划里的估计值。）

- [ ] **Step 7: 验证套件（`build:dist` 已在 Step 1 跑过）**

```bash
npm test
npm run typecheck
npm run lint
```

Expected: 全绿。

- [ ] **Step 8: 手工跑一次小篆双向，肉眼确认输出真是篆書字符**

```bash
node --input-type=module -e "
import { createConverter } from './dist/index.js';
import { writeFileSync } from 'node:fs';
const cp = s => [...s].map(c => 'U+' + c.codePointAt(0).toString(16).toUpperCase()).join(' ');
const a = await createConverter({ from: 'cn', to: 'seal', loadCustomPhrases: false }, []);
const b = await createConverter({ from: 'seal', to: 'cn', loadCustomPhrases: false }, []);
const out = [];
for (const t of ['天地玄黄', '头发发展', '年前有']) {
  const s = a(t);
  out.push(t + ' -> ' + s + ' [' + cp(s) + '] -> ' + b(s) + ' [' + cp(b(s)) + ']');
}
writeFileSync('seal-smoke.txt', out.join('\n') + '\n', 'utf8');
"
```

Expected: 每个码位都落在 `U+3D000..U+3FC3F`；`b(a(x))` 对 `头发发展` 这类有歧义的字**不保证**回到
原输入（`s2seal` 已经把 头/髮 合并到同一个现代字形，反向是无损不了的一对多）——把观察到的
实际回写内容如实记在报告里，不要为了「roundtrip 好看」改判据。看完删除 `seal-smoke.txt`。

- [ ] **Step 9: Commit**

```bash
git add README.md README.zh-Hant.md docs/comparison.md CHANGELOG.md docs/superpowers
git commit -m "docs: README/对比/CHANGELOG 对小篆与上游 19 个 config 的声明做账

README 里「16 个 config、556 条期望」这类数字是承诺；同步跑完后必须重新量一遍再写回去。
小篆那一段如实写明上游标实验性、输出需要 Unicode 18.0 篆書字型。"
```

---

## 收尾（不在本计划内自动执行，需要逐步批准）

计划做完就是本地四个提交 + 全绿。下面这些是**共享状态**动作，按仓库惯例逐条请批：

1. `git push -u origin feat/opencc-seal-sync`
2. 开 PR（标题 `feat: adopt OpenCC seal dictionaries; honor @reverse-prefer (fixes #2)`），
   正文里放：失败 run 链接、四道对账的实测数字、bundle 体积增量、Task 3 Step 9 那三条破坏实验的结论。
3. `gh workflow run` 手动触发一次 `Sync OpenCC Dictionaries` 验证 CI 绿（schedule 下一次是 2026-10-15）。
4. 关闭 issue #2 并附一条说明（根因 → 决策 → 提交/PR 链接）。
5. 发版：`.opencc-sync.json` 变了，CI 的自动 bump 逻辑会走 **patch**；本轮含新增 locale 与
   导出类型形状变化，是否手动定成 minor/major 由 maintainer 决定。
