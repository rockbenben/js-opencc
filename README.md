# js-opencc

> 纯 JavaScript 的中文简繁转换：直接追 OpenCC 官方词典，人名与术语可硬锁定不被转换。

[![npm version](https://img.shields.io/npm/v/js-opencc.svg)](https://www.npmjs.com/package/js-opencc) [![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

[简体中文](README.md) · [繁體中文](README.zh-Hant.md)

```bash
npm install js-opencc
```

```typescript
import { createConverter } from "js-opencc";

const convert = await createConverter({ from: "cn", to: "twp" });
convert("出租车司机用鼠标打开视频"); // 計程車司機用滑鼠打開影片
```

## ✨ 特性

- **纯 JavaScript** —— 无需编译，浏览器 / Node.js / Deno 通用，零运行时依赖
- **`protectedDict` 硬保护字典** —— PUA 占位符机制锁定，不依赖数据巧合
- **直接同步 OpenCC 官方字典** —— 上游漂移会中止同步，不静默产出错误结果
- **对齐 OpenCC 官方用例** —— 16 个 config、556 条期望全量比对，随词典同步刷新
- **按方向加载** —— 繁→简只拉 0.11 MB，不是整包 1.13 MB
- **TypeScript 原生支持 · UMD + ESM** —— 完整类型定义，CDN 与现代模块系统通用

## 支持的地区代码

| 代码 | 说明 |
| --- | --- |
| `cn` | 简体中文（中国大陆） |
| `tw` | 繁体中文（台湾） |
| `twp` | 繁体中文（台湾）+ 词汇转换（软件 → 軟體） |
| `hk` | 繁体中文（香港） |
| `hkp` | 繁体中文（香港）+ 词汇转换（伍迪·艾伦 → 活地·亞倫） |
| `jp` | 日本新字体 |
| `t` | OpenCC 标准繁体 |

七个代码任意组合，`from` 和 `to` 各取其一。

**运行环境**：Node.js ≥ 22.12（需要 `require()` ESM 的支持，更低版本 CJS `require("js-opencc")` 会失败）；浏览器 / Deno 不受限。

## 用法

### ES Module（Node.js / 现代浏览器）

```typescript
import { createConverter } from "js-opencc";

const cn2tw = await createConverter({ from: "cn", to: "tw" });
cn2tw("软件"); // 軟件

// to: "twp" 在 tw 基础上加大陆↔台湾词汇映射
const cn2twp = await createConverter({ from: "cn", to: "twp" });
cn2twp("软件"); // 軟體

const hk2cn = await createConverter({ from: "hk", to: "cn" });
hk2cn("軟件"); // 软件
```

### CDN（浏览器）

三个 bundle 都注册全局 `OpenCC`，**同一页面只引入其中一个**；每个 bundle 只接受自己支持的方向，传别的方向会直接抛错。

```html
<!-- 完整版：任意方向 -->
<script src="https://cdn.jsdelivr.net/npm/js-opencc/dist/umd/full.min.js"></script>
<script>
  OpenCC.Converter({ from: "cn", to: "tw" })("软件"); // 軟件
</script>

<!-- 仅简体→繁体：只传 to -->
<script src="https://cdn.jsdelivr.net/npm/js-opencc/dist/umd/cn2t.min.js"></script>
<script>
  OpenCC.Converter({ to: "tw" })("软件"); // 軟件
</script>

<!-- 仅繁体→简体（最小）：只传 from -->
<script src="https://cdn.jsdelivr.net/npm/js-opencc/dist/umd/t2cn.min.js"></script>
<script>
  OpenCC.Converter({ from: "tw" })("軟件"); // 软件
</script>
```

## 自定义字典

### `protectedDict`：硬保护字典

`createConverter` 第二参数是 js-opencc 唯一的自定义字典入口，**优先级高于所有 OpenCC 内置字典**。命中字段在转换前被 PUA 占位符替换，OpenCC 引擎完全看不到原字段，转换完成后再还原。

```typescript
const protectedDict = [
  ["自行車", "自行車"], // 锁定不变：t2s 时强制保持繁体
  ["周杰伦", "周杰倫"], // 自定义译名：s2t 时按你的方式转（键须为简体才会命中）
  ["公司术语", "Company Term"],
];

const convert = await createConverter({ from: "tw", to: "cn" }, protectedDict);
convert("自行車"); // 自行車 —— 不会被转成「自行车」

// 键和值相同 = 锁定：这个词在任何方向上都原样保留
const keep = await createConverter({ from: "cn", to: "tw" }, [["头发", "头发"]]);
keep("头发和发现"); // 头发和發現 —— 只有「发现」被转了
```

**典型用例**：锁定人名 / 品牌 / 术语（`from === to`）、覆盖 OpenCC 的默认译法、把领域术语批量映射到统一规范。

**匹配规则**：

- 多条规则的键重叠时应用**最长匹配**（「中国人民」优先于「中国」）
- 同一个键有多条规则：后写覆盖前写
- 规则里的 **PUA 字符** U+E000..U+F8FF（内部占位符段）会被静默剥掉，剥完为空的条目整条跳过。规则来自最终用户（粘贴 / 导入 / localStorage 里的历史数据）时不必自己先洗

### 从文件加载（自动）

包内自带模板 [`data/custom/ProtectedDict.txt`](./data/custom/ProtectedDict.txt)，在不传第二参数时**自动加载并应用**——直接编辑该文件即可。格式与 OpenCC 上游字典一致：每行 `key<TAB>value`，`#` 开头为注释。出厂状态下所有规则都被注释掉。

> 仅 ESM/Node `createConverter` 入口生效（浏览器 / Deno 无 fs 时静默跳过）。显式传第二参数（包括 `[]` 和 `""`）会绕过自动加载。要从别的路径加载，自己 `parseOpenCCDict(fs.readFileSync(path, "utf8"))` 后传入。

### UMD / CDN 中使用

UMD bundle 的 `Converter` 接受同样的第二参数，但**不会**自动加载 `ProtectedDict.txt`（浏览器无 fs）：

```javascript
OpenCC.Converter({ from: "cn", to: "tw" }, [["北京", "東京"]])("我去北京"); // 我去東京

// 从远端文件加载规则
const text = await fetch("/my-protected.txt").then((r) => r.text());
OpenCC.Converter({ from: "cn", to: "tw" }, OpenCC.parseOpenCCDict(text));
```

### `CNTWPhrases`：`twp` 模式内置词汇层

[`data/custom/CNTWPhrases.txt`](./data/custom/CNTWPhrases.txt) 在 OpenCC `s2twp` / `tw2sp` 之上补 41 条大陆↔台湾惯用语（「视频」↔「影片」、「鼠标」↔「滑鼠」）—— OpenCC 官方只做 TW 内部短语规范化，不收生活词汇。走和 `protectedDict` 同一套硬覆盖机制，优先级排在用户词典之下、内置转换链之上。

- **默认开启**：`from: "twp"` 或 `to: "twp"`；`loadCustomPhrases: false` 关闭
- **应用方向**：目标是台湾词汇（`to: "tw" / "twp"`）且来源不是 → 正向；来源是台湾词汇且 `to: "cn"` → 反向；**其余方向不应用**，包括显式打开开关（往香港输出里塞台湾词汇并非本意）
- 台湾侧互转（`twp → tw`）不套：「土豆」这类简繁同形词会被按大陆语义改写成「馬鈴薯」，而台湾语境下它是花生

这 41 条和上游的重合情况、以及「一条都删不得」的消融验证，见 [`docs/comparison.md`](./docs/comparison.md)。

## API 一览

主入口（`import from "js-opencc"`）与 UMD bundle 的公开 API：

| 名称 | 用途 |
| --- | --- |
| `createConverter` | 推荐入口，按 `{ from, to }` 动态构造转换函数（ESM / Node） |
| `Converter` | UMD 同步版本；参数同上，`cn2t` / `t2cn` 只接受各自方向 |
| `ProtectedConverter` | 把硬保护字典套在任意 inner converter 外面 |
| `parseOpenCCDict` | 解析 OpenCC 格式字典文本为 `[key, value][]` |
| `CustomConverter` | 单字典快速构造转换函数（不含 OpenCC 内置字典） |
| `ConverterFactory` | 多字典分组链式转换的底层 factory |
| `Trie` | 底层 Trie（`addWord` / `loadDict` / `convert` / `findLongestMatch`） |
| `HTMLConverter` | DOM 内文本节点批量转换 + 还原 |

完整类型定义随包发布。`./core` 与 `./cn2t` / `./t2cn` 子入口提供更小的 surface。

## Bundle 大小

| 包 | 大小（minified） | 说明 |
| --- | --- | --- |
| `full.min.js` | ~1.13 MB | 完整版，支持所有转换方向 |
| `cn2t.min.js` | ~1.04 MB | 仅简体 → 繁体 |
| `t2cn.min.js` | ~100 KB | 仅繁体 → 简体（绝大多数字典是简→繁向，反向数据小） |

npm 安装后占 **6.1 MB**（tarball 2.5 MB）。每个 bundle 同时发未压缩和 `.min.js` 两份；这些 bundle 有 97% 是词典字符串，压缩前后只差 3%。

## 和其他方案的关系

纯 JS 这条路上还有 [`opencc-js`](https://github.com/nk2028/opencc-js)，**这个包的架构来自它**——`Trie` / `ConverterFactory` / `HTMLConverter` 这些名字、`{ from, to }` 的地区代码体系、子入口划分，都沿用它的设计，词组切段和兼容汉字归一化也是先在它那里看到才知道该做。谨此致谢。同一套 OpenCC 词典、同样的转换语义，**绝大多数输入两者结果一致**。

选这个包的理由只有三条：需要**硬覆盖**某些词条（锁定语义是链式自定义转换器表达不了的）、需要**内置的大陆↔台湾生活词**（41 条里 29 条官方链条给不出）、或者要**紧跟上游 `master` 词典**（实测两边差 2286 条 / 3.62%）。三条都用不上就不必换。

逐项实测——引擎消融、词典差异、加载粒度、内存、吞吐——都在 [`docs/comparison.md`](./docs/comparison.md)，含可重跑的方法。

官方 `opencc` 包是另一个选择：Node.js native binding，能用 Jieba 等扩展分词，但依赖原生编译（`node-gyp` + `node-addon-api`），纯前端项目里跑不起来。

## 同步与贡献字典

```bash
npm run sync:opencc   # 从 OpenCC 官方拉取最新字典
npm run build         # 完整构建（含 sync + tsc + rollup）
npm run build:dist    # 跳过 sync，只跑 tsc + rollup
```

`sync:opencc` 不只是下载，它同时做四道**会中止**的对账——上游变了而我们没跟上时，宁可让同步失败，也不要静默产出错误结果：

1. **词典文件清单** —— 上游新增或删除 `.txt` 且不在白名单里，报错要人裁决
2. **转换链** —— 11 条链逐个比对上游 config 的 `conversion_chain`
3. **切段声明** —— 16 个 config 的 `segmentation` 字段**两个方向都查**：我们切的上游不切了，以及上游新增了我们没切的。后者尤其容易漏——什么都不会报错，只是从此少切一刀，地区词汇又开始越界替换
4. **官方 testcases** —— fixture 与词典同一次快照刷新，避免拿新词典去对旧用例

`STPhrases_GeneratedFromRegionalPhrases`（OpenCC 构建期生成的切段词典）由同步脚本按上游 `generate_st_phrases_from_regional_phrases.py` 的规则本地生成，不需要 OpenCC 的构建环境。

**反哺 OpenCC**：在 `data/custom/CNTWPhrases.txt` 追加词条 → `npm run export:pr` 自动 fetch 上游 `TWPhrases.txt` 做 diff → 把清单提交给 [BYVoid/OpenCC](https://github.com/BYVoid/OpenCC)。

## 开发

```bash
npm test              # vitest run
npm run typecheck     # tsc --noEmit，覆盖 src/、test/、scripts/
npm run lint          # ESLint 9 flat config
```

CI 在每次 release 时跑 build + test 后再 publish；`prepublishOnly` 钩子给手工 `npm publish` 兜底。OpenCC 上游字典每两周同步一次，只在内容真的有变化时才发布新版（`.opencc-sync.json` 内容哈希检测）。

## 从 v1.0.x 升级

自定义字典 API 在 v1.3 做过一次彻底重构，**完整变更见 [CHANGELOG.md](./CHANGELOG.md)**：

- 第二参数 `customDict` → `protectedDict`，行为从**软覆盖变成硬覆盖**（命中规则后 OpenCC 内置字典不再处理这些字段，机制保证）
- 移除 `applyCharFixes` 选项与 `data/custom/CharFixes.txt`，旧的字形保护诉求全部迁移到 `protectedDict`
- 若你依赖软覆盖的链式转换（A→B 由用户字典提供、B→C 由内置字典完成），改写为直接 A→C

版本号策略：major 跟随 OpenCC 上游大版本（OpenCC 1.x → js-opencc 1.x），minor / patch 由本项目自行迭代。

## License

Apache-2.0。随包发布的词典数据来自 [OpenCC](https://github.com/BYVoid/OpenCC)，以同一协议再分发。
