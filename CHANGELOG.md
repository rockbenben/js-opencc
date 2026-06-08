# 更新日志

本项目所有显著变更记录于此。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)：**major 跟随 OpenCC 上游大版本**（OpenCC 1.x → js-opencc 1.x），minor / patch 由本项目自行迭代。

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
