# 和 opencc-js 的对比

测量于 2026-08-20，js-opencc 1.4.1 对 opencc-js 1.4.1，Node 24。

结论会随两边发版过期，方法不会。每一节都给了复现方式，重跑一遍比引用这里的数字可靠。

## 缘起与致谢

js-opencc 的第一版写于 2026 年 1 月，当时 opencc-js 已经 1259 天没有发布（2022-11-17 的 1.0.5 之后停摆），而 OpenCC 上游词典一直在动。这个包最初就是为了填那段空窗。

空窗在 2026-04-29 结束。opencc-js 此后 74 天内发布 9 个版本（5 个正式版，最新 1.4.1 / 2026-07-12），补上了 mmseg 风格词组切段和对上游 testcases 的比对。下面每一项都是对着 1.4.1 量的。

这个包的架构来自它：`Trie` / `ConverterFactory` / `ConverterBuilder` / `CustomConverter` / `HTMLConverter` 这些名字、`Converter({ from, to })` 的地区代码体系、`DictLike` / `DictGroup` / `LocalePreset` 这组类型、`./core` `./cn2t` `./t2cn` 的子入口划分，都沿用它的设计。词组切段和兼容汉字归一化也是先在它那里看到才知道该做，后来虽然分别改成了「按上游 config 声明同步」和 `String.normalize("NFC")`，但问题是它提出的。谨此致谢 [nk2028/opencc-js](https://github.com/nk2028/opencc-js)。

## 结论速览

| 项目 | js-opencc | opencc-js 1.4.1 |
| --- | --- | --- |
| 官方 testcases | 553 / 556 | 505 / 556 |
| 转换引擎 | 行为一致（消融验证） | 行为一致 |
| 词典 | 追 OpenCC `master` | `opencc-data` release 快照 |
| 两边词典差异 | 2286 条 / 63127（3.62%） | |
| 硬覆盖 | `protectedDict`，PUA 掩码 | 无对应机制 |
| 内置大陆↔台湾生活词 | 41 条 | 无 |
| 兼容汉字 | `normalize("NFC")` | 1002 条映射表（结果相同） |
| 繁→简加载（主入口） | 0.11 MB | 1.13 MB |
| 繁→简常驻内存 | 1.8 MB | 4.1 MB |
| 安装体积 | 6.1 MB | 5.75 MB |

## 复现方法

两个包要装进同一个项目，不能各测各的。opencc-js 不进本仓库的 `package.json`，台子搭在仓库外：

```bash
mkdir cmp && cd cmp
npm init -y && npm pkg set type=module
npm pack /path/to/js-opencc
npm i ./js-opencc-x.y.z.tgz opencc-js@latest
```

两边 API 形状几乎一样，同一段驱动代码换个 import 就能跑两遍：

```js
import { createConverter } from "js-opencc";   // 异步
import * as OpenCCJS from "opencc-js";         // 同步
const ours   = await createConverter({ from: "cn", to: "tw" });
const theirs = OpenCCJS.Converter({ from: "cn", to: "tw" });
```

## 转换正确性

题目和标准答案都出自 OpenCC 自己（`test/fixtures/opencc-testcases.json`，16 个 config、556 条期望）。

| 实现 | 通过 |
| --- | --- |
| js-opencc | 553（99.5%） |
| opencc-js | 505（90.8%） |

js-opencc 未通过的 3 条登记在 `test/upstream-parity.test.ts` 的 `KNOWN_DIVERGENCES`，成因单一：刻意不收 `TSCharactersExt`，它的输出在多数字体里是豆腐块。

### 差距来自词典，不是引擎

只看上面那张表容易得出「引擎更准」的结论，那是错的。把 js-opencc 的引擎接上 opencc-js 的词典，构成第三格：

```js
import { ConverterFactoryWithSegmentation, segmentationDictsFor, getDictFiles } from "js-opencc";
const dictOf = (name) => readTheirDict(name);   // 从 opencc-js 的 dist 里读
const groups = getDictFiles(from, to).map((g) => g.map(dictOf));
const seg    = segmentationDictsFor(from, to).map(dictOf);
const convert = ConverterFactoryWithSegmentation(seg.length ? seg : null, ...groups);
```

| 用哪个引擎 | 配 js-opencc 词典 | 配 opencc-js 词典 |
| --- | --- | --- |
| js-opencc 引擎 | 553 / 556 | 505 / 556 |
| opencc-js 引擎 | —— | 505 / 556 |

505 不只是总分相同，逐 config 也完全相同（s2t 93/105、t2s 50/55、s2tw 61/65……）。两个引擎在官方全套上行为一致，48 条差距全部来自词典版本。

## 词典差异

| 类别 | 条数 |
| --- | --- |
| js-opencc 有、opencc-js 没有 | 1232 |
| opencc-js 有、js-opencc 没有 | 2（`高梁米` / `高梁酒`）+ 1002（兼容汉字表，改用 NFC） |
| 键相同、值不同 | 50 |
| 合计 | 2286 / 63127（3.62%） |

那 50 条改值正是官方用例失分最集中的地方，而只比键集合看不见它们：

| 键 | js-opencc（追 master） | opencc-js（release 快照） |
| --- | --- | --- |
| `小丑丫鬟` | `小丑丫鬟` | `小醜丫鬟` |
| `跳梁小丑` | `跳樑小丑` | `跳樑小醜` |
| `幺麽小丑` | `幺麼小丑` | `幺麼小醜` |

上游把这批「小丑」（马戏团的丑角）从 `小醜` 更正回 `小丑`。

## 硬覆盖

opencc-js 的 `CustomConverter` 是独立转换器，只能串在内置转换器前或后。每个场景两种接法都试，取更好的结果：

| 场景 | `protectedDict` | custom → builtin | builtin → custom |
| --- | --- | --- | --- |
| 锁定 `自行車` 不被 tw→cn 转换 | ✔ | ✘ | ✘ |
| 自定义译名 `路由器→數據分流器`（值含 `數據`，内置有 `數據→資料`） | ✔ | ✘ `資料分流器` | ✔ |
| 词条键跨切段边界 `人脸识别→人臉辨識` | ✔ | ✔ | ✘ |
| 锁 `头发` 不转、但 `发现` 照转 | ✔ | ✘ | ✘ |

要点在第 1、4 行两种接法都做不到。「锁定」的语义是不让内置碰它，而独立转换器前置时输出仍会被内置吃掉，后置时简体键已经匹配不上。第 2 行 `builtin → custom` 能过，只因为 `路由器` 简繁同形，换成 `自行車` 就不成立。

优先级：用户传入的 `protectedDict` 压过内置的 `CNTWPhrases`（`地铁` 默认给 `捷運`，传 `[["地铁","地下鐵"]]` 后得 `地下鐵`）。

## 内置地区词汇

`CNTWPhrases` 的 41 个词分别过两边的 `cn→twp`：12 条结果相同，29 条不同。例：`地铁` 给 `捷運` / `地鐵`，`盒饭` 给 `便當` / `盒飯`，`土豆` 给 `馬鈴薯` / `土豆`。OpenCC 官方的 `TWPhrases` 偏 IT 术语，不收生活词汇。

### 和上游 OpenCC 的关系

`scripts/probe-cntw-redundancy.ts` 逐条去 20 本上游词典里查这个键：

| 类别 | 条数 |
| --- | --- |
| 键值完全相同（纯复制） | 0 |
| 键相同、值不同（覆盖上游译法） | 9 |
| 上游无此键，但官方链条拼得出同样结果 | 8 |
| 上游无此键，链条也给不出 | 24 |

那 9 条覆盖的风险类别和「新增一个词」不同：上游改了译法，我们会静默保留自己那份。

| 词 | js-opencc | 上游 |
| --- | --- | --- |
| `出租车` | `計程車` | `出租車` |
| `简历` | `履歷` | `簡歷` |
| `合同` | `合約` | `合同` |
| `摩托车` | `機車` | `摩托車` |
| `云计算` | `雲端運算` | `雲計算` |

另四条：`打印机→印表機`、`调制解调器→數據機`、`卷心菜→高麗菜`、`方便面→泡麵`。

「官方链条拼得出来」不等于可以删。那 8 条单独消融后全部仍然必需：消融覆盖显式 `loadCustomPhrases: true` 的 `cn→tw`，而 OpenCC 的词汇转换只在 `twp` 里做，开了词表的 `cn→tw` 上我们是唯一来源——拿掉 `视频` 那条，它就从 `影片` 退回 `視頻`。默认的 `cn→tw` 不套词表，`视频` 给 `視頻`，与 OpenCC s2tw 一致，官方用例 65/65 正是靠这个成立。

全量消融结论：41 条删掉任何一条都会改变某个方向的输出，0 条冗余。

## 兼容汉字

js-opencc 用 `String.normalize("NFC")`，opencc-js 打包 1002 条映射表。遍历 U+F900–FAFF 与 U+2F800–2FA1F 里有规范分解的全部字符，走 t→cn：

| 实现 | 会被处理的字符数 |
| --- | --- |
| js-opencc | 1002 |
| opencc-js | 1002 |
| 只有一边处理 | 0 |

结果完全一致，不构成选择理由。差别只在 js-opencc 不打包这份数据、跟着引擎的 ICU 走；opencc-js 多约 8.7 KB 但不依赖宿主 ICU 版本。

## 体积与加载

用 `node:module` 的 `register()` 挂 load 钩子，数建一个转换器实际加载了哪些模块、多少字节。

| 繁→简（中文站最常见的方向） | 加载模块 | 字节 |
| --- | --- | --- |
| js-opencc 主入口 | 10 | 0.11 MB |
| opencc-js 主入口 | 1 | 1.13 MB |
| opencc-js `./t2cn` 子入口 | 1 | 0.10 MB |

| 简→繁 | 加载模块 | 字节 |
| --- | --- | --- |
| js-opencc 主入口 | 12 | 1.07 MB |
| opencc-js 主入口 | 1 | 1.13 MB |

不是 opencc-js 做不到小，它的 `./t2cn` 子入口和 js-opencc 一样小。差别在默认路径：`import "opencc-js"` 无论哪个方向都加载 1.13 MB，要小就得在写代码时挑一个方向锁定的子入口；js-opencc 从主入口按 `{ from, to }` 在运行时只拉需要的词典。繁→简这个最常见的方向上，默认路径差 10 倍。

这也解释了下一节的常驻内存差距：不是 Trie 更省，是根本没加载那些词典。

npm 安装体积 6.1 MB 对 5.75 MB。

## 性能与内存

语料 4.28 万字，5 轮取中位数。内存每个方向单开一个进程用 `--expose-gc` 量。

下表是 2026-08-20 热循环优化（charCodeAt 手动配对、NFC 预扫描、掩码 run 切片，见 CHANGELOG）之后的成对复测。同一进程、同一语料、同轮对测才可比，跨会话的绝对值会漂。

| 指标 | js-opencc | opencc-js |
| --- | --- | --- |
| cn→tw 吞吐 | 5.1 ms | 8.5 ms |
| cn→twp 吞吐 | 4.1 ms | 4.1 ms |
| tw→cn 吞吐 | 1.3 ms | 2.6 ms |
| cn→tw 冷构造 + 首转 | 65 ms | 66 ms |
| tw→cn 冷构造 + 首转 | 15 ms | 14 ms |
| cn→tw 常驻内存 | 28.8 MB | 41.9 MB |
| tw→cn 常驻内存 | 1.8 MB | 4.1 MB |

优化前吞吐是互有胜负的同一量级，变化全部来自那轮热循环改造，语义零变化（官方 556 复测 553/556 不变）。内存行是优化前测的，Trie 结构未变，仍然有效。

## 重跑时的五个陷阱

都是实际踩过的，每条都会给出一个看起来正常的错误结果：

1. **词典 diff 只比键集合**会漏掉「键相同、值不同」的 50 条，而那恰好是唯一能解释官方用例失分的一类。要连值一起比。
2. **同进程连续测构造耗时**会命中转换器缓存，量出 0 ms。每个方向单开一个进程。
3. **数加载模块时按路径里有没有 `/dict/` 过滤**，opencc-js 会得到 0 个，看起来像它不加载任何词典；实际它走预打包的 `dist/esm/full.js`，词典都在里面。要数全部模块。
4. **`src/dict/` 被 gitignore**（构建期由 `sync:opencc` 生成），所以
   `git status src/dict` 永远是空的——拿它判断「词典有没有变」是无效检查，
   而空输出看起来和「没问题」一模一样。要比词典就直接读两边的产物。
5. **对比表断言的是别人的状态，而别人会变。** 这份文档曾经写着 opencc-js「没有切段」「用自有用例」，而 1.4.1 两样都有。写之前先装一份当前版本核对。
