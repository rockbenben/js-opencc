# js-opencc

[![npm version](https://img.shields.io/npm/v/js-opencc.svg)](https://www.npmjs.com/package/js-opencc)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

[简体中文](README.md) | [繁体中文](README_TW.md)

纯 JavaScript 实现的中文简繁转换库，直接同步 [OpenCC](https://github.com/BYVoid/OpenCC) 官方字典；额外提供 `protectedDict` **硬保护字典**——机制保证某些字段绝不被 OpenCC 触碰（人名、术语、品牌、自定义译名）。

## ✨ 特性

- **纯 JavaScript** —— 无需编译，浏览器 / Node.js / Deno 通用
- **直接同步 OpenCC 官方字典** —— 一键脚本拉取最新版本
- **TypeScript 原生支持** —— 完整类型定义
- **UMD + ESM** —— CDN 与现代模块系统通用
- **`protectedDict` 硬保护字典** —— PUA 占位符机制锁定，不依赖数据巧合
- **可一键导出 PR 给 OpenCC 上游** —— 双向贡献

> 为什么不直接用现有方案？官方 `opencc` 包依赖 C++ 编译（node-gyp 在纯前端项目跑不起来）；`opencc-js` 4 年未更新。js-opencc 解决了这两个问题。

## 安装

```bash
npm install js-opencc
```

> Node.js ≥ 22.12（需要 `require()` ESM 的支持，<22.12 的版本 CJS `require("js-opencc")` 会失败）。浏览器 / Deno 不受限。

或 CDN：

```html
<script src="https://cdn.jsdelivr.net/npm/js-opencc/dist/umd/full.min.js"></script>
```

## 基本用法

### ES Module（Node.js / 现代浏览器）

```typescript
import { createConverter } from "js-opencc";

const cn2tw = await createConverter({ from: "cn", to: "tw" });
console.log(cn2tw("软件")); // 軟件

// to: "twp" 在 tw 基础上加大陆↔台湾词汇映射（軟件 → 軟體）
const cn2twp = await createConverter({ from: "cn", to: "twp" });
console.log(cn2twp("软件")); // 軟體

const hk2cn = await createConverter({ from: "hk", to: "cn" });
console.log(hk2cn("軟件")); // 软件
```

### CDN（浏览器）

```html
<!-- 完整版 -->
<script src="https://cdn.jsdelivr.net/npm/js-opencc/dist/umd/full.min.js"></script>

<!-- 仅简体→繁体 -->
<script src="https://cdn.jsdelivr.net/npm/js-opencc/dist/umd/cn2t.min.js"></script>

<!-- 仅繁体→简体（最小，~68KB） -->
<script src="https://cdn.jsdelivr.net/npm/js-opencc/dist/umd/t2cn.min.js"></script>

<script>
  const converter = OpenCC.Converter({ from: "cn", to: "tw" });
  console.log(converter("软件")); // 軟件
</script>
```

## 自定义字典

### `protectedDict`：硬保护字典

`createConverter` 第二参数 `protectedDict` 是 js-opencc 唯一的自定义字典入口，**优先级高于所有 OpenCC 内置字典**。命中字段在转换前被 PUA 占位符替换，OpenCC 引擎完全看不到原字段，转换完成后再还原。

```typescript
const protectedDict = [
  ["自行車", "自行車"],      // 锁定不变：t2s 时强制保持繁体
  ["周杰伦", "周杰倫"],       // 自定义译名：s2t 时按你的方式转
  ["公司术语", "Company Term"],
];

const convert = await createConverter({ from: "tw", to: "cn" }, protectedDict);
// "自行車" 不会被 opencc 转成 "自行车"
```

**典型用例**：

- **锁定字段** —— 人名 / 品牌 / 术语原样保留（`from === to`）
- **自定义译名** —— 覆盖 OpenCC 默认转换
- **领域术语** —— 批量映射到统一规范

**匹配规则**：

- 多条规则 `from` 有重叠时应用**最长匹配**（「中国人民」优先于「中国」）
- 同名 `from` 多条规则：后写覆盖前写
- 规则中**禁止使用 PUA 字符** U+E000..U+F8FF（内部占位符段）

### 从文件加载（自动）

包内自带模板 [`data/custom/ProtectedDict.txt`](./data/custom/ProtectedDict.txt) 在 `createConverter` 不传第二参数时**自动加载并应用**——直接编辑该文件即可：

```typescript
import { createConverter } from "js-opencc";

// 如果 data/custom/ProtectedDict.txt 含非注释规则，自动作为 protectedDict 应用
const convert = await createConverter({ from: "cn", to: "tw" });
```

文件格式与 OpenCC 上游字典完全一致：每行 `key<TAB>value`，`#` 开头为注释，空行忽略。出厂状态下所有规则都被注释掉（即自动加载结果为零条目，等同未提供）。

> 仅 ESM/Node `createConverter` 入口生效（浏览器 / Deno 无 fs 时静默跳过）。显式传第二参数（包括 `[]`）会绕过自动加载。如需从其他路径加载，自己 `parseOpenCCDict(fs.readFileSync(path, "utf8"))` 后传入即可。

### UMD / CDN 中使用 protectedDict

UMD bundle（`cn2t`、`t2cn`、`full`）的 `Converter` 也接受同样的第二参数，但**不会**自动加载 `ProtectedDict.txt`（浏览器无 fs 访问）。需要显式传入：

```html
<script src="https://cdn.jsdelivr.net/npm/js-opencc/dist/umd/full.min.js"></script>
<script>
  const convert = OpenCC.Converter({ from: "cn", to: "tw" }, [["北京", "東京"]]);
  console.log(convert("我去北京")); // 我去東京
</script>
```

从远端文件加载规则：

```javascript
const text = await fetch("/my-protected.txt").then((r) => r.text());
const dict = OpenCC.parseOpenCCDict(text);
const convert = OpenCC.Converter({ from: "cn", to: "tw" }, dict);
```

### `CNTWPhrases`：`twp` 模式内置词汇层

[`data/custom/CNTWPhrases.txt`](./data/custom/CNTWPhrases.txt) 在 OpenCC `s2twp` / `tw2sp` 配置之上补充大陆 ↔ 台湾惯用语差异（如「视频」↔「影片」、「鼠标」↔「滑鼠」）—— OpenCC 官方仅做 TW 内部短语规范化。

- **生效时机**：`from: "twp"` 或 `to: "twp"`
- **禁用**：传 `loadCustomPhrases: false`

## 地区代码

| 代码  | 说明                                            |
| ----- | ----------------------------------------------- |
| `cn`  | 简体中文（中国大陆）                            |
| `tw`  | 繁体中文（台湾）                                |
| `twp` | 繁体中文（台湾）+ 词汇转换（如：软件 → 软体）   |
| `hk`  | 繁体中文（香港）                                |
| `jp`  | 日本新字体                                      |
| `t`   | OpenCC 标准繁体                                 |

## Bundle 大小

| 包            | 大小（minified） | 说明                       |
| ------------- | ---------------- | -------------------------- |
| `full.min.js` | ~1.1 MB          | 完整版，支持所有转换方向   |
| `cn2t.min.js` | ~1.1 MB          | 仅简体 → 繁体              |
| `t2cn.min.js` | ~68 KB           | 仅繁体 → 简体（绝大多数字典是简→繁向，反向数据小） |

## API 一览

主入口（`import from "js-opencc"`）和 UMD bundle 都暴露这些：

| 名称                      | 用途                                                          |
| ------------------------- | ------------------------------------------------------------- |
| `createConverter`         | 推荐入口，按 `{ from, to }` 动态构造转换函数（ESM/Node only） |
| `Converter`               | UMD bundle 同步版本，签名与 `createConverter` 一致            |
| `ProtectedConverter`      | 把硬保护字典套在任意 inner converter 外面                     |
| `parseOpenCCDict`         | 解析 OpenCC 格式字典文本为 `[key, value][]`                   |
| `CustomConverter`         | 单字典快速构造转换函数（不含 OpenCC 内置字典）                |
| `ConverterFactory`        | 多字典分组链式转换的底层 factory                              |
| `Trie`                    | 底层 Trie（含 `addWord` / `loadDict` / `convert` / `findLongestMatch`）|
| `HTMLConverter`           | DOM 内文本节点批量转换 + 还原                                 |

完整类型定义随包发布。`./core` 和 `./cn2t` / `./t2cn` 子入口提供按需载入的更小 surface。

## 同步与贡献字典

### 同步上游

```bash
npm run sync:opencc   # 从 OpenCC 官方拉取最新字典
npm run build         # 完整构建（含 sync + tsc + rollup）
npm run build:dist    # 跳过 sync，只跑 tsc + rollup
```

### 反哺 OpenCC

发现 OpenCC 缺词或错误？

1. 在 `data/custom/CNTWPhrases.txt` 追加候选词条
2. 运行 `npm run export:pr` —— 自动 fetch 上游 `TWPhrases.txt` 做 diff，输出 PR-ready 的新词条清单
3. 把清单提交给 [BYVoid/OpenCC](https://github.com/BYVoid/OpenCC)

## 开发

```bash
npm test              # vitest run
npm run typecheck     # tsc --noEmit，覆盖 src/、test/、scripts/
npm run lint          # ESLint 9 flat config
npm run lint:fix      # 自动修复可修复项
```

CI 会在每次 release 时自动跑 build + test 后再 publish；`prepublishOnly` 钩子额外给手工 `npm publish` 兜底。OpenCC 上游字典每两周同步一次，只在内容真的有变化时才发布新版（通过 `.opencc-sync.json` 内容哈希检测）。

## v1.3.x 升级说明（自 v1.0.x）

这一版是自定义字典 API 的彻底重构。**完整变更见 [CHANGELOG.md](./CHANGELOG.md)。** 核心要点：

- 第二参数 **`customDict` → `protectedDict`**（重命名）
- 行为：**软覆盖 → 硬覆盖**。命中规则后，OpenCC 内置字典不再处理这些字段（机制保证，不再依赖数据巧合）
- 移除 `applyCharFixes` 选项 + `data/custom/CharFixes.txt` 文件。旧的字形保护诉求全部迁移到 `protectedDict`
- 版本号策略：major 跟随 OpenCC 上游大版本（OpenCC 1.x → js-opencc 1.x）；minor/patch 由 js-opencc 自家迭代

**迁移**：

- 90% 场景下 `createConverter(opts, customDict)` 改名为 `createConverter(opts, protectedDict)` 即可
- 若你依赖软覆盖的链式转换（A→B 由用户字典提供、B→C 由内置字典完成），请改写为直接 A→C
- 若你曾修改 `data/custom/CharFixes.txt`，把那些条目移入 `protectedDict`

## License

Apache-2.0（与 OpenCC 相同）
