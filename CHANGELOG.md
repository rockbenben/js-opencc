# 更新日志

本项目所有显著变更记录于此。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)：**major 跟随 OpenCC 上游大版本**（OpenCC 1.x → js-opencc 1.x），minor / patch 由本项目自行迭代。

## [1.4.2] — 2026-08-21

### 行为变化（三条，都是修正而非破坏）

| 场景 | 此前 | 现在 |
| --- | --- | --- |
| `protectedDict` 规则里含 PUA 字符（U+E000..U+F8FF） | 静默接受，可能和占位符撞车导致串词 | 静默剥掉那些字符，规则照常生效 |
| `createConverter(opts, "")` | 触发 `ProtectedDict.txt` 自动加载 | 与 `[]` 一致，绕过自动加载 |
| 输入含孤立高代理（畸形 UTF-16） | 吞掉它后面那个字符，少转一处 | 正确转换 |

PUA 那条**不抛错**是刻意的：这些字符肉眼不可见，用户看到的规则本来就是剥掉之后
那个样子；而规则常常来自最终用户（粘贴 / 导入 / localStorage 里的历史数据），
抛错等于把库的内部不变式变成每个调用方都要先洗一遍的负担。

**这一版没有破坏性变化**：公开 API、导出面、`dist/umd/` 的六个文件路径都不变，
转换结果只在上面那三种情况下与此前不同，而三种都是修正。

**词典也会变，而且和代码无关。** `src/dict/` 是构建期由 `sync:opencc` 从 OpenCC
`master` 现拉现生成的，不入库——所以同一份源码在不同日子打出的包，词典可能不同。
对着 npm 上的 1.4.1 做升级差分实测：STPhrases 从 49174 增到 49238（新增 64 条、
改值 1 条 `谷神 穀神→谷神`），`征南錄` / `咸淳臨安志` 这类此前会被误转的书名跟着修好。
这是「追 master」的兑现，不是回归。

### 两处边界修正（均先复现、修后破坏验证）

- **显式传 `""` 当第二参数曾触发自动加载。** 文档契约是「显式传第二参数（包括 `[]`）
  绕过自动加载」，但 `if (!protectedDict)` 的 falsy 判断让 `""`（DictLike 收字符串，
  这是合法显式实参）走了自动加载。出厂 `ProtectedDict.txt` 全被注释、自动加载结果为空，
  所以两者行为恰好一样——**bug 因此不可见**；往文件里临时写入一条规则后当场复现。
  改为 `=== undefined`。回归测试单独一个文件（`test/protected-dict-autoload.test.ts`），
  mock `node:fs/promises` 造出「文件有规则」的世界——不真编辑磁盘上那个共享文件，
  因为 vitest 多文件并行，别处无参调用 `createConverter` 的用例会在编辑窗口期偶发变红。
- **`protectedDict` 规则含 PUA 字符从「文档禁止、代码不管」改为「构造时静默剥掉」。**
  危害不是假设的：规则**值**里的 PUA 可能撞上分配出去的占位符，还原时被换成另一条
  规则的值——要两条规则加特定分配顺序才触发，表现为罕见且无法复现的串词。剥完为空的
  条目整条跳过，与 `Trie.loadDict` 对畸形条目的宽容度一致。用户**输入文本**里的 PUA
  不受影响（是数据，掩码分配器绕开它们走）。

- **繁体 README 改名 `README_TW.md` → `README.zh-Hant.md`**（`_TW` 是国家码不是语言码，
  BCP-47 用点号分隔）。它从没随包发布过，现在改零成本。
- **不再随包发布指向不存在源码的 sourcemap。** `tsc` 生成的 `dist/**/*.js.map` 和
  `*.d.ts.map` 共 60 个文件，`sources` 指向 `../src/*.ts`，而 `src/` 不在 `files` 里——
  调试器跟过去只会 404。指向不存在源码的 map 比没有 map 更糟。要让它们有用就得连
  `src/` 一起发，那会多出 1 MB 的词典 `.ts` 副本（`dist/dict` 已经有一份），不划算。
  `dist/umd/*.js.map` 保留——它们指向的 `../core.js` 就在包里，是能用的。

### 文档

- **README 的对比表拿过期认知写成了「踩一捧一」，已重写为「缘起 + 致谢 + 现存差异」。**
  那张 8 行表里有三行是错的——直接下载 `opencc-js` 1.4.1 的 tarball 逐项核过：
  它**已有** mmseg 风格词组切段（表里写「无」）、**已对齐** upstream OpenCC testcases
  和 golden outputs（表里写「自有用例」）、`HTMLConverter` **已覆盖** `placeholder`
  和 `aria-label`（本轮我加这两个属性时以为是补空缺，其实是追平；`title` 才是新的）。
  它的 `./cn2t` / `./t2cn` / `./core` 子入口也早就有，「整包预设」一说不成立。

  更要紧的是那张表回避了立项背景：js-opencc 首版提交于 2026-01-06，正落在
  `opencc-js` **1259 天（3.4 年）的发布空窗**里（2022-11-17 的 1.0.5 之后停摆），
  而它已于 2026-04-29 恢复维护。**这个包的公开 API 形状本来就来自 `opencc-js`**
  ——`Trie` / `ConverterFactory` / `ConverterBuilder` / `CustomConverter` /
  `HTMLConverter`、`Converter({ from, to })` 的地区代码、`DictLike` / `DictGroup` /
  `LocalePreset` 这组类型、`./core` `./cn2t` `./t2cn` 的子入口划分，全是沿用它的设计；
  词组切段和兼容汉字归一化也是先在它那里看到才知道该做。README 现在把这段写明并致谢，
  差异表只保留核实过仍然成立的六条（硬覆盖、内置地区词汇、词典来源、漂移中止、
  兼容汉字实现、反哺上游），并写清各自的取舍。README_TW 同步（此前它还停在更早的
  单段版本，与简体版已经脱节）。

  教训：**对比表是最容易腐坏的一类文档**——它断言的是别人的状态，而别人会变。
  写之前先去装一份当前版本核对，别凭上一次调研时的印象。
- **对比改成实测，结论落进 `docs/comparison.md`。** 把两个包装进同一个项目跑（opencc-js
  不进本仓库 `package.json`，台子搭在仓库外），七组测量。两条结论推翻了上一条刚写完的表述：

  - **引擎两边没有差别。** 官方 testcases 我们 553/556、它 505/556，看起来是引擎更准。
    但把**我们的引擎接上它的词典**再跑，得到 505/556，**逐 config 与它自己的成绩完全相同**。
    那 48 条差距 100% 是词典版本，引擎零差异。没有这一步消融，就会得出「我们引擎更准」
    这个错误结论——这是整份对比里最要紧的一步。
  - **兼容汉字两种实现结果一样。** 遍历两个兼容区里有规范分解的全部字符，NFC 和它那 1002 条
    表各处理 1002 个，**没有一个字符只有一边处理**。这不是优势项，README 已改为如实陈述。

  站得住的差异：硬覆盖（锁定语义两种链式接法都表达不了）、内置地区词汇（41 条里 29 条
  结果不同）、词典新鲜度（**2286 条不同，占 3.62%**）、常驻内存（cn→tw 28.8 vs 41.9 MB，
  tw→cn 1.8 vs 4.1 MB，三轮完全一致）。吞吐同一量级互有胜负（4.3 vs 4.1 ms），不作为卖点。

  三个测量自己先出过错，都记在 `docs/comparison.md` 里：词典 diff 只比键集合会漏掉
  **50 条「键相同值不同」**——而那恰好是唯一能解释失分的一类（上游把「小丑」从 `小醜`
  更正回 `小丑`）；构造耗时同进程连测会被转换器缓存污染，量出 0 ms；`小丑` 一度被判成
  引擎差异，是消融纠正的。

### README 重构：首屏 59 行在讲竞品

读者要滚过两屏才看得到 `npm install`——「缘起与致谢」+「现在还有什么不同」两节占了
正文开头 59 行，全是作者视角和竞品对比。重排成读者的决策链：
**一句话 → 装 → 一段能跑的代码 → 支持哪些地区代码 → 怎么用 → 和别的方案的关系**。

- 「缘起」整段移进 `docs/comparison.md`（那里本来就是深度对比的家），README 只留
  两句致谢 + 三条「什么时候该用这个包」+ 一个链接
- CNTWPhrases 那两条长 bullet（和上游的重合、消融验证）**是 `docs/comparison.md`
  的重复**——两处写同一件事时 README 那份必然又旧又浅，删掉留链接
- 首屏补一句话描述（此前只有一段 90 字的长句）和一段可运行代码。库品类的「首屏图」
  就是调用长什么样，读者要看的正是这个
- License 一节此前只复述徽章，改为说明随包发布的词典数据来自 OpenCC、以同一协议再分发

### 穷举实测抓出的两个静默缺陷

热循环优化里的两个「正确性推理」只做过抽样，穷举之后两个都塌了。

- **孤立高代理会吞掉后面那个字符（热循环优化引入的回归）。** 从 `codePointAt` 换成
  `charCodeAt` 之后，三处「不匹配时步进」只判高代理就跳 2；`codePointAt` 对孤立代理
  返回 ≤0xFFFF、天然只跳 1 的保证没了。于是 `"\uD800好"` 里的「好」被吞进未匹配段、
  永远参与不了匹配——**少转一处，不报错、不崩**。真实词典和 556 官方用例里没有孤立
  代理，整段语料对拍也造不出来，只有专门造畸形 UTF-16 才暴露（3000 条随机串模糊
  测试里 393 条不符）。抽出 `isSurrogatePair()` 供三处共用。
- **兼容汉字正则的范围一直是错的（历史遗留）。** 端点写的是**字面字符**「豈」，本意
  U+F900（兼容汉字），而它和 U+8C48（普通汉字）**字形完全一样**——某次 NFC 归一化把
  它悄悄换成了后者，范围从 `[F900,FAFF]` 变成 `[8C48,FAFF]`，覆盖了大半常用汉字和
  整个 PUA。**输出始终正确**（`normalize` 对普通字是恒等），所以任何输出对拍都发现
  不了，只有把端点打成码位才现形；代价是每段中文都白跑一遍 replace。端点改为转义写法。

验证：预扫描 ⊇ 正则的超集声明**穷举全部 1114112 个码位**，零漏；两个兼容区逐字符
端到端折叠正确。新增 `test/malformed-utf16.test.ts`。

其中「正则起点是 F900」这条**必须查源码文本**：快路径预扫描只认 [F900,FAFF]，端点
就算退回 U+8C48 也永远走不到正则，行为测试全绿——第一版正是这么写的，破坏验证时
没咬住才发现。`no-bare-chars` 扫描器同时扩到禁止字面兼容汉字（U+F900–FAFF），
它当场抓到了我自己刚写进注释的一个。

### 热循环优化：先分阶段剖析，赢了赛马才进源码

分阶段计时（42.8k 字语料）找到四个热点，每项先与现实现赛马、带正确性对照，赢了
才移植。**语义零变化**：官方 556 用例复测 553/556 不变、消融 41/0 不变。

| 热点 | 手段 | 提速 |
| --- | --- | --- |
| 五个走 trie 的循环 | `for..of`+`codePointAt` → `charCodeAt` 手动代理对配对 | 构建 1.72×，convert 1.30× |
| `normalizeCompatibilityIdeographs` | 正则 `.test` 前加手写 charCodeAt 预扫描 | 无命中路径 5× |
| `maskWithTrie`（掩码） | 每位置一次 `findLongestMatch`（每字符一个 `{end,value}` 分配）→ 新增 `Trie.matchLongestInto`（写进复用的 out 对象）；逐字符 push → run 切片。顺带删掉主循环里的 existingPUA 逐字符检查——构造期守卫已保证规则无 PUA | **一层掩码开销 +2.73 → +0.19 ms（14×）** |
| `restorePlaceholders` | 逐字符 push → charCodeAt 找 PUA + run 切片 | 并入上行 |

合计（成对复测 vs opencc-js 1.4.1）：cn→tw 吞吐 5.1 vs 8.5 ms、tw→cn 1.3 vs 2.6 ms
（优化前两边互有胜负）；冷构造持平。`matchLongestInto` 是 `findLongestMatch` 的免分配
变体，语义一致，注释互相指认——改其一必同步另一个。

### 发布包从 12.96 MB 瘦到 6.1 MB

上面那轮对比顺手量出来的：装完 12.96 MB，而 opencc-js 只有 5.75 MB。多出来的
**没有一个字节是运行时要用的**。

- **`.d.ts` 2.3 MB → 66 KB。** `src/dict/*.ts` 原来是 `export default "…"`，tsc 于是把
  整本词典推断成一个字符串**字面量类型**——`STPhrases.d.ts` 单个文件 **1.9 MB**。
  那个类型对谁都没用（没人会去 narrow 一本词典），却要让每个消费者的 tsc 去解析它。
  改成 `const dict: string = "…"; export default dict;` 后该文件 **1912457 → 88 字节**。
  生成侧抽成 `dictModuleSource()`，四个写词典的地方共用——原来是四份重复的字面量拼接，
  漏改一处就会悄悄退回去。跑完 `sync:opencc` 与手工转换的产出**逐字节一致**，
  下次同步不会 churn。
- **`.map` 5.0 MB → 120 KB。** UMD 的 sourcemap 把整本词典的源码又内联了一份，
  **单个 map 1.2 MB，比它描述的 bundle 还大**。加 `sourcemapExcludeSources` 后降到
  13–27 KB，mappings 仍在，调 `core.ts` 那部分逻辑照样对得上行号。**不删任何文件**——
  未压缩 UMD 一度被拿掉过，但发布过的文件路径就是契约，直接引 `dist/umd/full.js` 的
  CDN 用户会 404，而这种坏法只在别人的页面上现形。省几 MB 不值当。


  验过：packed tarball 装进干净项目，`strict` + `skipLibCheck: false` 下全部值导出
  与类型导出编译通过；ESM 运行时、`protectedDict` 锁定、NFC 兼容汉字、
  UMD 全局注入四项冒烟均正常。
- 文档校对：Bundle 大小表按实际产物更新（`t2cn.min.js` ~68 KB → ~98 KB、`cn2t.min.js` ~1.1 MB → ~1.05 MB）；地区代码表里 `twp` 的示例「软件 → 软体」值被误写成简体，实际输出是 `軟體`；README_TW 的 `protectedDict` 自定义译名示例键被过度转换成繁体（`周杰倫`），永远命中不了简体输入，已改回 `周杰伦` 并注明键须为简体。

## [1.4.1] — 2026-08-18

CNTWPhrases 的方向规则收拢到一处，反转词典的冲突策略修正，以及同步 / 导出脚本的一批解析修复。

### ⚠️ 行为变化

同样的输入，以下几种情况输出会变或改为抛错，升级前请对照：

| 场景 | 此前 | 现在 |
| --- | --- | --- |
| `{ from: "twp", to: "t" }("土豆")` | `馬鈴薯` | `土豆`（台湾语境下是花生） |
| `Cn2t({ to: "twp" })("幼儿园")` | `幼兒園` | `幼稚園`（与主入口一致） |
| `{ from: "twp", to: "cn" }("隨身碟")` | `优盘` | `U盘`（取首选词） |
| `{ from: "hk", to: "t" }("人才")` | `人纔` | `人才` |
| `{ from: "cn", to: "twp" }("扫二维码")` | `掃QR` | `掃QR Code` |
| `{ from: "t", to: "tw" }("張棟樑")` | `張棟梁` | `張棟樑`（专名不再被拆） |
| `{ from: "t", to: "hk" }("仙姑峯")` | `仙姑峯` | `仙姑峰` |
| `T2cn({ from: "twp", to: "tw" })` | 静默返回简体 | 抛 `t2cn bundle only converts to 'cn'` |
| `Cn2t({ to: "xx" })` | 静默返回半转换文本 | 抛 `Unknown 'to' locale` |

`loadCustomPhrases: true` 现在只在规则支持的方向生效（`cn → hk` 等方向不再套用台湾词汇）；`false` 的语义不变。

### 新增

- **补齐 OpenCC 官方转换链缺失的两本短语词典。** 官方 `t2tw` 用的是 `TWVariantsPhrases + TWVariants`、`t2hk` 用 `HKVariantsPhrases + HKVariants`，而我们只用了后者。这两本的作用是**防止专名被过度转换**——拿上游词典逐条实测，`t→tw` 12 条全错（`張棟樑` 被改成 `張棟梁`、`純喫茶` 变 `純吃茶`，人名和商号都被拆）、`t→hk` 272 条错 264 条（`仙姑峯` 应为 `仙姑峰`、`一粥麪` 应为 `一粥麵`）。补齐后三本词典与 OpenCC 的差异均为 **0 条**。`HKVariantsPhrases` 上游 2014 年就有，是我们一直缺；`TWVariantsPhrases` 是上游 2026-05-27 新增，同步脚本连续警告了三个月未被处理。
- **新增 `hkp` 地区代码**（港式词汇模式，与 `twp` 对称），对应 OpenCC 2026-06 新增的 `s2hkp` / `hk2sp` 配置，链条为 `HKPhrases + HKVariantsPhrases + HKVariants`（反向 `HKPhrasesRev + HKVariantsRevPhrases + HKVariantsRev`）。例：`{ from: "cn", to: "hkp" }("伍迪·艾伦")` → `活地·亞倫`，而 `to: "hk"` 只做字形转换得 `伍迪·艾倫`。三个 UMD bundle 同步支持。
- **UMD bundle（cn2t / t2cn / full）现在与 npm 主入口一样加载 CNTWPhrases**：twp 方向默认加载，`loadCustomPhrases: false` 可关。此前 bundle 完全不带这本词典，同样输入 `幼儿园`，主入口出 `幼稚園` 而 UMD 只做字符转换出 `幼兒園`。反转逻辑提取为 `core.ts` 的 `reverseDictString`，方向规则提取为 `presets.ts` 的 `phraseDictDirection`（converter 与三个 bundle 共用一份）。每个 bundle 体积 +0.9KB。

### 修复 · 转换结果

- **自定义词典多 token 值被截断。** `sync-opencc` 处理 `data/custom/` 时误用官方词典的解析规则（只取首个空格分隔候选），`二维码 → QR Code` 被截成 `二维码 → QR`（cn→twp 输出 `掃QR支付`）。v1.3.2 修过下游 `Trie.loadDict` 的同型截断，但生成器里的这份漏掉了。`parseToEntries` 的 `isCustom` 参数此前是死代码。
- **反转词典键冲突时丢正确映射、留错误映射。** `reverseEntries` 对多键撞同值是后者覆盖前者（注释声称 "keep all"，trie 里不成立）：`HKVariants` 的 `才→才` 与 `纔→才` 反转后都成键 `才`，错误的 `才→纔` 胜出——而 `entriesToOptimized` 又把正确的单字恒等对滤掉，只剩错的。实际影响：hk→t `人才→人纔`、`煙→菸`、`核心→覈心`，tw→t `梁先生→樑先生`。现在键冲突时恒等对优先（字级反转回退恒等，歧义由 `*RevPhrases` 短语词典按上下文消解：`橋梁→橋樑` 不受影响）。目标为 cn 的方向被 TSCharacters 掩盖，未受影响。
- **cn2t / t2cn bundle 对未知 locale 静默跳步。** `standard2variants[to] || []` 会返回只做了一半转换的文本。v1.3.2 的 loud-error 政策覆盖了 `full` bundle 与 `createConverter`，漏掉这两个手写 bundle；dictMap 缺字典（与 presets 漂移）同样改为抛错。locale 校验改用 `Array.isArray`、字典查表改用 `typeof === "string"`，原先的真值判断与 `in` 会让 `constructor` / `toString` 这类原型链成员绕过守卫、最终死在 `.map` 的 TypeError 上。
- **cn2t / t2cn 静默忽略反方向参数。** 两个单向 bundle 只读自己那一侧的 locale：`t2cn` 丢掉 `to`、`cn2t` 丢掉 `from`，于是 `T2cn({ from: "twp", to: "tw" })("計程車")` 返回 `出租车`——调用方要的是繁体台湾输出，拿到的却是简体大陆用词；`Cn2t({ from: "tw", to: "tw" })` 则把 cn→tw 词典套在已是繁体的输入上（正是本次修掉的「土豆」那类问题）。两处现在都校验并抛错，指向 full bundle。反向调用（`Cn2t({ to: "cn" })` / `T2cn({ from: "cn" })`）此前抛的是 `Dictionary TSCharacters missing from cn2t bundle`，把「不支持该方向」说成了一个并不存在的打包问题，现在给出指向另一个 bundle 的明确提示。
- **台湾侧文本被按大陆语义改写。** CNTWPhrases 的方向判断此前只把 `twp → cn` 排除在正向之外，于是 `from: "twp"` 配上任何繁体目标（`t` / `tw` / `hk` / `jp`）都会套用**正向**的 cn→tw 词典。词典里「土豆」「芝士」「高考」「雪糕」「薯片」等简繁同形词因此命中：`{ from: "twp", to: "t" }("土豆")` 输出 `馬鈴薯`——而台湾语境下「土豆」是花生。方向规则收拢为 `presets.ts` 的 `phraseDictDirection` 一处：仅「从台湾词汇之外进入 `tw`/`twp`」走正向、「从 `tw`/`twp` 出到 `cn`」走反向，其余方向不套用（反向词典的值是简体，套到繁体目标上会混入简体字）。
- **`loadCustomPhrases: true` 在主入口与 bundle 方向相反。** 同样的 `{ from: "tw", to: "cn", loadCustomPhrases: true }`，t2cn bundle 走反向（`計程車 → 出租车`），而主入口与 full bundle 走正向，在一个转简体的方向上输出台湾用词（`芝士 → 起司`）。三处现在共用同一条方向规则。
- **反转词典同义词冲突取到次选词。** `reverseDictString` 没有冲突策略，trie 后写覆盖先写，多个键指向同一个值时**最后**一个胜出：`U盘`/`优盘 → 隨身碟` 反转成 `隨身碟 → 优盘`、`卷心菜`/`包菜 → 高麗菜` 反转成 `高麗菜 → 包菜`，结果静默依赖词典文件行序。改为首个键胜出（词典把首选词写在前面）、恒等对优先，与 `sync-opencc` 的 `reverseEntries` policy 一致。同时补上缺失的分隔符守卫——无空格的条目此前会伪造出 `幼稚園 → 幼稚`（吞掉末字）而不是被跳过。
- **`full` bundle 仍在静默丢弃缺失字典。** `.filter(Boolean)` 让 dictMap 与 presets 漂移时静默跳步，正是 v1.3.2 loud-error 政策要防的场景（cn2t / t2cn 已改为抛错）。四处防御性过滤全部删除。由于 `dict` 与 `allDictFiles` 都是静态的，完整性改由测试「full bundle carries every preset dict」保证，不占 bundle 体积；cn2t / t2cn 的字典缺失判断则从真值改为 `typeof === "string"`，合法的空字典（全为单字恒等对时 `entriesToOptimized` 返回 `""`）不再被误判为缺失。

### 修复 · 同步与导出脚本

以下只影响 `npm run sync:opencc` / `npm run export:pr`，不改变已发布包的转换结果。

- **`export:pr` 导出被截断的多 token 值。** `parseCustomDict` 读的是与 `sync-opencc` 同一个 `data/custom/CNTWPhrases.txt`，却仍按官方词典规则 `.split(/\s+/)[0]` 截断，`二维码 → QR Code` 被导出成 `二维码 → QR`，上游 PR 内容与冲突检测都基于错数据。
- **同步脚本处理自定义词典的失败被吞掉。** `data/custom/` 那段包在 try/catch 里，格式守卫抛出的错只打印一行 `✗` 就继续，`allDictNames` 不再包含 CNTWPhrases、`src/dict/CNTWPhrases.ts` 也不重写，脚本仍打印「✓ Sync complete!」并以 0 退出；主入口随后按缺失字典处理（只 `console.warn`）而三个 bundle 静态导入磁盘上的旧文件，npm 与 UMD 再次分叉。文件缺失此前也只是警告，但 bundle 现在静态依赖它（`tsc` 会报 TS2307）。两种情况都改为直接中止同步。
- **缩进的注释行被当成词条。** 注释判断跑在未 trim 的原始行上，而新增的无 tab 回退是按 trim 后的行匹配的，于是 `  # ===== 交通 =====`（行首有空格）会解析成词条 `# → ===== 交通 =====`，打包守卫也拦不住（key `#` 既无空白也无 `|`），最终把用户文本里所有 `#` 都改写。现在先 trim 再判断注释，与 `parseOpenCCDict` 一致。
- **官方词典的值可能吞掉制表符。** 解析改用 `slice(tabIdx + 1)` 后丢掉了原先 `split("\t")` 在第二个制表符处的隐含边界，上游若出现 `key\tv1\tv2`，值会变成含制表符的 `v1\tv2` 并被写进词典（格式守卫只检查 key 的空白与两侧的 `|`）。今日上游 12 个文件均无此形，属潜在问题；现在两种词典都在第二个制表符处截断。
- **`export:pr` 与同步脚本对同一个文件解析规则不一致。** `parseCustomDict` 仍只认制表符，空格分隔的词条同步后能生效却不会出现在 PR 候选里；现在自定义侧同样支持空白串回退。（上游侧仍按 OpenCC 惯例只取首个候选：818 行里有 44 行是多候选，放宽成「命中任一候选即算已同步」会把真实分歧误判为已同步。）
- **`sync-opencc` 静默丢弃空格分隔的自定义词条。** `parseToEntries` 只认 tab，而运行时的 `parseOpenCCDict` 支持空格串回退；贡献者往 `data/custom/` 里写 `酸奶 優格`（空格无 tab），同步照常打印条目数，那条却不会生效。现按首个空白串回退切分，与运行时解析器一致。

### 性能

- **`createConverter` 每次调用都重读 `data/custom/ProtectedDict.txt`。** 自动加载落在转换器缓存外面，批量按文件调用时每次都付一次 `fs.readFile` + `parseOpenCCDict`：200 次命中缓存的调用实测 82ms，把读盘提出去后只剩 0.1ms。改为与内层转换器同样的 promise memo（该文件随包发布，运行时不会变）。

### 开发 / CI

- `entriesToOptimized` 新增打包格式守卫：key 含空格或任一侧含 `|` 时同步脚本直接报错，不再静默产出错位词典。
- **同步脚本现在会因上游漂移而中止,不再只警告。** 两道检查:
  - **文件级**——上游任何 `.txt` 既不在 `OFFICIAL_DICT_FILES` 也不在新增的 `IGNORED_DICT_FILES`（目前只有 `CJK_Compatibility_Ideographs`，不属于任何转换链）里就报错。此前只 `console.warn`，而绿色构建上的警告没人看：`TWVariantsPhrases` 就这样被公示了三个月，期间每次相关转换都是错的。
  - **链条级**——拉取上游 `data/config` 的 10 个配置，与 `presets.ts` 的链条逐条比对，不一致即报错并打印两侧内容。这是文件级检查看不到的信号：上游把一本**已存在**的词典加进某条链、或调整链内顺序时，文件列表毫无变化。（OpenCC 构建期生成的 `STPhrases_GeneratedFromRegionalPhrases` / `TSCharactersExt` 不在 `data/dictionary` 里，无法同步，已排除在比对之外。）

  两道都在下载词典之前执行，失败即 `exit 1`，由 workflow 已有的逻辑自动开 issue；issue 正文写明了两种漂移各自该怎么处理。代价是上游新增一个无关文件也会挡住当次字典更新，直到有人往 `IGNORED_DICT_FILES` 加一行。
- 新增 `test/bundles.test.ts`；回归测试覆盖多 token 值往返、反转恒等回退、bundle 未知 locale 抛错、bundle 不支持的方向抛错、原型链成员当 locale 传入被拒、单向 bundle 对其全部可接受 locale 都带齐字典、full bundle 字典完整性、CNTWPhrases 方向规则（含主入口与 bundle 一致性）、反转词典的冲突与分隔符处理。
- 单向 bundle 的方向在编译期已确定（`cn2t` 只可能正向、`t2cn` 只可能反向），移除各自那条永不执行的分支——`cn2t` 因此不再引入 `reverseDictString`。
- README / README_TW 的 CDN 示例此前把三个 bundle 的 `<script>` 并排列出后调用 `OpenCC.Converter({ from: "cn", to: "tw" })`：最后加载的 t2cn 覆盖全局 `OpenCC`，而 t2cn 根本不支持 `from: "cn"`——照抄此前会静默返回未转换的原文，现在会抛 `t2cn bundle only converts to 'cn', got 'tw'`。改为每个 bundle 各自独立示例并说明只能引入一个；同时补充 CNTWPhrases 的方向说明。
- **README 首屏对 `opencc-js` 的描述已过期。** 原文写「`opencc-js` 4 年未更新」——该项目 2026-04 已恢复维护，四个月内发布了 8 个版本（最新 1.4.1，2026-07-12）。改为陈述真实且不会过期的差异：`opencc-js` 的 `CustomConverter` 是独立转换器，无法在 OpenCC 内置字典之上锁定字段，而 `protectedDict` 用 PUA 占位符从机制上保证。官方 `opencc` 包依赖原生编译一句同时补上了具体依赖（`node-gyp` + `node-addon-api`）。
- 文档校对：Bundle 大小表按实际产物更新（`t2cn.min.js` ~68 KB → ~98 KB、`cn2t.min.js` ~1.1 MB → ~1.05 MB）；地区代码表里 `twp` 的示例「软件 → 软体」值被误写成简体，实际输出是 `軟體`；README_TW 的 `protectedDict` 自定义译名示例键被过度转换成繁体（`周杰倫`），永远命中不了简体输入，已改回 `周杰伦` 并注明键须为简体。

## [1.4.0] — 2026-08-18

字典按需加载与转换器缓存，npm 包瘦身。

### 新增

- **字典按需加载。** `src/dict/index.ts` 从急切 re-export 改为 `dictLoaders` 懒加载 map（每个字典一个独立的动态 `import()`）。打包器（webpack / Turbopack 等）会把每个字典拆成独立 chunk，浏览器端只按当前转换方向拉取所需字典：**t→cn 从全量 ~1.1MB 降到 ~40KB**——STPhrases 一个文件就占 1MB，而它只有 cn→\* 方向用得到。UMD bundle 不受影响（改为逐文件静态导入，保持单文件）。
  - 内部破坏性变更：`dict/index.js` 不再急切导出各字典字符串。该模块不在包的公共 `exports` 里，正常消费方无感。
- **`createConverter` 内建转换器缓存。** 内层转换链（trie 构建，热建约 26ms）按 `(from, to, loadPhrases)` 缓存**构建 promise**——并发调用（如批量转换 N 个文件的 `Promise.all`）共享同一次构建，而不是 N 份 trie 并行重建、同时驻留内存。`protectedDict` 逐次在缓存外现包，互不污染；构建失败（如发版后旧会话拉字典 chunk 404）会被逐出缓存，后续调用可重试。
  - 行为变化：传空保护（`[]` / `""`）现在直接返回缓存的内层转换函数——同方向多次调用返回**同一个**函数实例（此前每次都是新实例，且空数组也会套一层空的 ProtectedConverter）。

### 变更

- **npm 包瘦身 ~1.3MB。** `files` 从 `["dist", "data"]` 收窄为 `["dist", "data/custom"]`：`data/official/*.txt` 是 sync 脚本的输入原料，运行时无任何代码引用，不再随包发布；运行时会自动加载的 `data/custom/ProtectedDict.txt` 保留。

## [1.3.2] — 2026-06-08

修复内置短语词典此前完全失效的问题、一批 `HTMLConverter` 与边界健壮性缺陷，并随上游 OpenCC 双周同步更新字典数据。含一处公共 API 破坏性变更（`getDictFiles` 返回类型）。

### 修复

- **内置短语词典此前完全失效（dead code）。** `createConverter` 把每个字典文件当作独立分组顺序执行，而 `variants2standard` / `standard2variants` 里字符词典排在短语词典之前——于是字符词典先逐字转换，等短语词典运行时其简体源 key 已不存在，所有 `STPhrases` / `TSPhrases` / `*RevPhrases` 从未生效。修复方式：按**转换步骤**分组（variant→standard、standard→variant 各自合并成单一 trie），让 trie 的最长匹配使短语词典压过单字词典。这与 `ConverterBuilder` 和 `cn2t` / `t2cn` bundle 早已采用的按步分组保持一致。
  - 这会改变大量 cn↔t 方向的输出（均为修正）：`头发 → 頭髮`（旧 `頭發`）、`理发店 → 理髮店`、`干燥 → 乾燥`（旧 `幹燥`）、`复杂 → 複雜`；t2s 方向 `乾隆 → 乾隆` 不再被字符级简化误转成 `干隆`。
- **`HTMLConverter`：`<input type="button|submit|reset">` 的标签从不被转换。** INPUT 整类被并入跳过列表，导致其按钮标签处理逻辑成为死代码。现按 `type` 精细处理——转换按钮类标签，可编辑输入框（text/password 等）保持不动。
- **`HTMLConverter`：`lang` 匹配改为大小写不敏感**（`zh-CN` == `zh-cn`，符合 HTML 规范）；`lang=""` 现在正确中断从祖先继承的匹配，不再误转声明为「未知语言」的文本。
- **`HTMLConverter`：重复调用 `convert()` 不再叠加转换**；原始值只记录一次，`restore()` 始终还原到真正的原文（此前二次 convert 会污染待还原的原始值）。
- **`sync:opencc` 生成字典模块改用 JSON 转义。** 此前用手工拼接的字符串字面量，上游一旦出现含 `"` / `\` / 控制字符的词条就会产出语法错误的 `.ts`，中断构建并静默卡住自动发布流水线。
- **`Trie.loadDict`（字符串形式）不再截断含空格的多 token 值**——此前只取第一个 token。仅影响直接传字符串字典的 `CustomConverter` / `ConverterFactory` / `protectedDict`。
- **未知 locale 现在抛出明确错误。** `createConverter` / `getDictFiles` / `full` bundle 此前对未知 `from`/`to` 静默跳过该步、返回半转换结果；现直接报错。
- `export:pr` 失败时对非 `Error` 抛出物不再打印 `undefined`。

### 破坏性变更

- **`getDictFiles(from, to)` 返回类型 `string[]` → `string[][]`。** 现在按转换步骤分组返回（每个内层数组是一个步骤的字典文件，必须一起加载进同一个 trie）。这个分组类型正是为了防止「扁平列表 → 每文件一组」的误用——而那恰恰是上面那个短语词典失效 bug 的根因。
  - 迁移：若你只需要旧的扁平文件清单（例如用于决定打包哪些字典文件），改调用 `getDictFiles(from, to).flat()`。

### 开发 / CI

- 新增 `test/html-converter.test.ts`（以 `happy-dom` 为环境），覆盖 `HTMLConverter` 的文本节点、`ignore-opencc`、跳过标签、`lang` 大小写/继承、button input、img/meta、重复 convert 等分支。新增 `happy-dom` devDependency（仅测试用）。
- 修复发布链路：`sync-opencc` 工作流改用 PAT 创建 release——默认 `GITHUB_TOKEN` 发出的 release 事件不会触发其他工作流，导致 `npm-publish` 从未运行、包未上 npm。
- `npm-publish` 工作流新增 `workflow_dispatch` 手动补发入口（可指定 tag），并在自动发布失败时开 issue 告警。

## [1.3.1] — 2026-05-18

自定义字典 API 的彻底重构。旧的 `customDict`「软覆盖」依赖 OpenCC 内置字典**恰好不会再处理用户输出**，这一假设在不少场景下崩塌（典型如 t2s 方向字符级简化会破坏锁定短语）。v1.3.1 用 **`protectedDict`** 替代——通过 Unicode PUA 占位符把命中字段在内置转换运行前 mask 掉、跑完再 restore，从机制上保证 OpenCC 字典完全看不到也无法修改受保护字段。

### 破坏性变更

- **`createConverter(options, customDict)` → `createConverter(options, protectedDict)`**。第二参数重命名，行为从软覆盖改为硬覆盖。
  - 大多数调用方直接改名即可。如果你之前依赖「用户字典 A→B + 内置字典 B→C」的链式效果，请改写为直接 A→C。
- **移除 `options.applyCharFixes`**。机制整体退场；如果传该字段，运行时打 `console.warn` 但忽略不报错。把原本写在那里的字形覆盖搬到 `protectedDict`。
- **移除 `data/custom/CharFixes.txt`**。替换为 `data/custom/ProtectedDict.txt`，格式完全相同。

### 新增

- `ProtectedConverter(dict, innerConvert)` —— 给任意 converter 套上硬覆盖层。可嵌套；相同 target 值共用一个 PUA 槽（超过 6400 个不同 target 才会抛 `RangeError`）。
- `parseOpenCCDict(text)` —— 把 OpenCC 格式字典文本（`key<TAB>value`、`#` 起始为注释）解析成 `[key, value][]`。
- `Trie.findLongestMatch(input, start)` —— 暴露最长匹配原语，方便只扫描不替换的场景。
- **自动加载 `data/custom/ProtectedDict.txt`**：在 Node ESM `createConverter` 没显式传 `protectedDict` 时生效。出厂模板全部注释掉，默认行为不变。传 `[]` 可绕过。
- **所有 UMD bundle（`cn2t`、`t2cn`、`full`）的 `Converter` 接受 `protectedDict` 第二参数**。UMD 不会自动加载 `ProtectedDict.txt`（浏览器无 fs）；要从远端文件加载，自己 `fetch` + `parseOpenCCDict`。UMD 同时也导出 `ProtectedConverter` 和 `parseOpenCCDict`。

### 变更

- 跟随 OpenCC 上游 **TWPhrases 合并**：`TWPhrasesIT.txt`、`TWPhrasesName.txt`、`TWPhrasesOther.txt` → 单一的 `TWPhrases.txt`。`TWPhrasesRev.txt` 现在直接从上游下载（此前是本地合成三份文件得来）。
- `sync:opencc` 脚本：
  - 通过 GitHub API 检测上游字典文件清单的增删漂移
  - 拒绝 CDN 错误页返回的 HTML / JSON 内容
  - 解析零词条、下载失败一律 fail fast（之前是静默跳过）
  - 在仓库根目录写 `.opencc-sync.json` 内容哈希清单
- `export:pr` 脚本：
  - 改为实时 fetch 上游 `TWPhrases.txt` 做 diff，不再读 `data/official/`
  - 输出更干净：新增条目（PR-ready） vs 冲突条目（需要人审）
- CI `sync-opencc.yml`：
  - **双周节奏**（每月 1 号和 15 号），之前是每周
  - **通过 `.opencc-sync.json` 的 git diff 检测变更**——之前用 `git status --porcelain`，但 `src/dict/` 和 `data/official/` 已 gitignored，根本看不见 sync 输出，所以触发逻辑实际上一直废着
  - **自动 bump 版本、打 tag、创建 release**——替代之前的 PR 流程
  - concurrency 限组、15 分钟超时、失败时自动开 issue
- CI `npm-publish.yml`：concurrency 限组、10 分钟超时；移除冗余的 `sync:opencc` step（`npm run build` 内部已包含）。
- `data/custom/CNTWPhrases.txt`：移除有歧义的映射（`洋芋`、`速食面`、`主播`），修正 `高考 → 大學入學考試`、`物业 → 物業`，VR/AR 改为完整中文译名。

### 修复

- **`./cn2t`、`./t2cn` 子入口在所有 Node 用户下完全无法使用。** `package.json` 的 `exports.import` 指向 UMD bundle，但因 `type: "module"` Node 把 `.js` 当 ESM 解析；UMD 的 IIFE 不声明 ESM `export`，consumer 拿到空 namespace。修复方式：子入口 `import`/`require` 改指 `dist/bundles/*.js`（tsc 输出的真 ESM），UMD 文件保留在 `dist/umd/*.js` 给浏览器 CDN `<script>`。
- `git push --follow-tags` 不会推送轻量 tag。sync 工作流现在显式 push tag，避免 `softprops/action-gh-release` 找不到 remote 上的 tag 时退化到用 `GITHUB_SHA`（也就是 bump 之前的旧 SHA）建 release。
- `prepublishOnly: npm run build && npm test` 给手工 `npm publish` 兜底，防止上传陈旧的 `dist/`。
- **CI 重复劳动** —— npm-publish 工作流先显式跑 `build && test`，然后 `npm publish` 又触发 `prepublishOnly` 把 `build && test` 重跑一遍。修复：CI publish 加 `--ignore-scripts` 跳过 prepublishOnly（手工 publish 仍受保护）。sync-opencc 工作流先跑 `sync:opencc`，下一步 `npm run build` 又内含 sync；拆出 `build:dist`（只 tsc + rollup，无 sync）给已经显式 sync 过的代码路径。

### 打包

- `engines.node: ">=22.12"` —— Node 22.12 起 `require()` ESM 默认开启，这是 CJS 消费者使用 ESM 子入口 bundle 的前提。
- `main` 字段从 UMD 改回 ESM `./dist/index.js`，保持一致。
- 移除已经失效的 `.npmignore`（`files: ["dist", "data"]` allowlist 优先级更高，原文件其实没起作用）。

### 开发体验

- 新增 ESLint 9 flat config（`eslint.config.js`）和 `npm run lint`、`lint:fix` 脚本。
- 新增 `npm run typecheck` + `tsconfig.check.json` —— 覆盖主 tsconfig（rootDir 在 `src/`）漏掉的 `test/` 和 `scripts/`。
- 新增 `npm run build:dist` —— `tsc + rollup`，跳过上游 sync，给已经显式跑过 `sync:opencc` 的 CI 路径用。
- 新增 `CHANGELOG.md`（本文件）。

## [1.0.x] —— 初始版本

- `1.0.1` —— fix: 构建自动拉取自定义词典；新增 `.gitignore`，把生成内容（`src/dict/`、`data/official/`）从 git 跟踪中移除。
- `1.0.0` —— 首个发布版本。纯 JS 移植 OpenCC，附 TypeScript 类型、ESM + UMD bundle、以及从上游同步字典的 `sync:opencc` 脚本。
