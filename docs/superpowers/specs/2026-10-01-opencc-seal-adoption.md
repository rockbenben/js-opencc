# 收养 OpenCC 小篆（Seal）对照 — 规格

日期：2026-10-01　驱动：[issue #2](https://github.com/rockbenben/js-opencc/issues/2)（biweekly sync 失败）
决策人：rockbenben（本轮选择「收养：实现 t2seal/seal2t/s2seal」+「@reverse-prefer 偏差一起修」）

## 问题

`.github/workflows` 的 biweekly sync 在 2026-10-01 的 run（36812526348）挂在 `npm run sync:opencc`：

```text
Error: Upstream has dict file(s) we neither ship nor ignore: SealCharacters, SealVariants
```

这是脚本按设计的刹车：上游任何既不在 `OFFICIAL_DICT_FILES`、也不在 `IGNORED_DICT_FILES` 的
`.txt` 都中止同步，把「要不要改转换输出」交给人。

来源是 OpenCC 上游提交 `ef9748b6`（2026-09-20，PR #1494）：把 Unicode 18.0 小篆区块
（U+3D000..U+3FC3F，11,328 字）经 UCD `SealSources.txt` 的 `kSEAL_MCJK` 属性做成与现代汉字的
双向对照，并新增三个 config。上游 NEWS.md 把它列在 **1.4.3（尚未发布）** 下，小节标题写明
「小篆對照（**實驗性**）」，末句为「僅供探索性研究，顯示需搭配支援 Unicode 18.0 篆書區塊的字型」。

## 上游事实（逐条核对过，非推断）

- 字典：`SealCharacters.txt`（小篆 → 现代汉字，11,328 条，键全为补充平面）、
  `SealVariants.txt`（现代标准字 → 《說文》隸定字，1,080 条，如 年→秊、前→歬）。
  两表的键与值**都恰好是 1 个码位**，且无一行给多候选。
- `SealCharactersRev` / `SealVariantsRev` 由上游 `data/scripts/reverse.py` 在构建时生成
  （与 `TWVariantsRev` 同类），因此 `data/dictionary/` 里查不到，必须由我们的 sync 生成。
- 反查规模：`SealCharacters` 有 93 个反查键存在多候选（最多 3 个），`SealVariants` 有 77 个。
  上游用 `# @reverse-prefer: K [V]` 注释钉住选哪个（`SealCharacters` 4 条、`SealVariants` 77 条，
  后者绝大多数是 `K K` 形式即「identity 优先」）。
- config 链（照抄 `data/config/*.json`）：
  - `t2seal` = `SealVariants` → `SealCharactersRev`
  - `seal2t` = `SealCharacters` → `SealVariantsRev`
  - `s2seal` = （`s2t` 的第一段：`STPhrases ∪ STPhrases_GeneratedFromRegionalPhrases` 短路与
    `STCharacters` 兜底）→ `SealVariants` → `SealCharactersRev`
  - 三者都只声明 `normalization: CJK_Compatibility_Ideographs`，**都不声明 `segmentation`**。
- 官方 `test/testcases/testcases.json` 现在覆盖 19 个 config（262 例，其中小篆 15 例：
  t2seal 8 / seal2t 6 / s2seal 1）。

## 为什么必须改链形状（实测，不是审美判断）

我们的 presets 把「一个方向的整个侧」表示为**一个合并 trie**（`Record<string, string[]>`），
靠 trie 的 last-write-wins 表达上游的优先级。小篆两侧都是**两个顺序步骤**，
合并成一个 trie 不等价：以生成后的两份字典实测遍历

| 链 | 合并成一个 trie 后与「顺序执行」结果不同的键 |
| --- | --- |
| `t2seal`（SealVariants 后接 SealCharactersRev） | 1080 个键里 **1007** 个不同 |
| `seal2t`（SealCharacters 后接 SealVariantsRev） | 11328 个键里 **933** 个不同 |

所以把 `variants2standard` / `standard2variants` 的值从「一步的字典名单」推广成
「**步骤列表**，每步仍是合并 trie」是本功能的前置。`s2seal` 因此自然成为 3 步
（cn→standard 一步 + seal 两步），与上游逐字对齐。

## 决策

1. **收养**：`seal` 成为第 8 个 `LocaleCode`；三个 config 全部实现并进官方 testcases 对账。
2. **链形状**：presets 的两个导出记录改为 `Record<string, string[][]>`。这是导出 API 的类型形状
   变化（README 的自定义链用法、`Locale` 对象跟着变），按项目「major 跟随 OpenCC 上游大版本」
   的既有约定，本轮记为 minor，并在 CHANGELOG 的「行为变化」表里显式写明。
3. **UMD full bundle 带上小篆**（约 +226 KB raw / +129 KB gzip，full.min.js 体积 +26% 左右）。
   理由：本包已两次因「UMD 与 npm 主入口行为不一致」修 bug，不给可选项留分歧。
   ESM 主入口是按需动态 import，不用小篆的消费者零成本。
4. **cn2t / t2cn 单向 bundle 不带小篆**：它们的定位是「简↔繁的轻包」，且这两个包的
   `TargetLocale` / `SourceLocale` 是手写窄化联合类型；传 `seal` 时给出明确的
   「本 bundle 不含此 locale，请用 full」错误，而不是「缺字典」这种指向不存在的打包 bug 的消息。
5. **`@reverse-prefer` 一起修**：反查生成器改为遵守上游 `data/scripts/common.py` 的
   `Dict.swap()` 语义（偏好项提到候选首位；偏好指向不存在的候选就报错中止）。
   现网已发布的数据里有 3 条选错，实测自当前 `src/dict/JPShinjitaiCharactersRev.ts`：

   | `t2jp` 输入 | 现在输出 | OpenCC 应输出 |
   | --- | --- | --- |
   | 鹽 U+9E7D | 䀋 U+400B（豆腐字） | 塩 U+5869 |
   | 鋪 U+92EA | 舖 U+8216 | 舗 U+8217 |
   | 莊 U+838A | 庄 U+5E84（简体形） | 荘 U+8358 |

   官方 testcases 没有这三个字，所以 556 条比对一直是绿的。
6. **不做**：不引入 seal→cn 的新 config（上游没有，我们的组合链天然覆盖）；不把
   `CJK_Compatibility_Ideographs` 从 `IGNORED_DICT_FILES` 里挪出来（它仍不在任何
   `conversion_chain` 里，归一化继续走 `String.normalize("NFC")`）；不碰 `ProtectedDict` /
   `CNTWPhrases` 与 html 转换。

## 验收

- `npm run sync:opencc` 绿：字典名单对账、config 链对账（19 个 config 全走）、segmentation
  双向对账（含 `t2seal/seal2t/s2seal` 的「不许有 segmentation」）。
- `npm test` 绿：官方 testcases 从 16 config / 556 期望扩到 19 config（含 15 条小篆），
  `t2jp` 三条偏差转正，反向不变量测试（`KNOWN_DIVERGENCES` 键必须真实存在、
  full bundle 覆盖每个 preset 字典、dictLoaders 覆盖 `allDictFiles`）继续咬住。
- 故意破坏一次：把 `@reverse-prefer` 处理摘掉、或把 seal 的某一步并进另一步，测试必须变红
  （证人测试要能为「理由」而红）。
- `npm run typecheck`、`npm run lint`、`npm run build:dist` 全绿；README / README.zh-Hant /
  docs/comparison.md / CHANGELOG 的 config 数与期望数按同步后的真实数字更新。
