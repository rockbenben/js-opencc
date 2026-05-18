# 更新日志

本项目所有显著变更记录于此。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循
[语义化版本](https://semver.org/lang/zh-CN/)：**major 跟随 OpenCC 上游大版本**
（OpenCC 1.x → js-opencc 1.x），minor / patch 由本项目自行迭代。

## [1.3.1] — 2026-05-18

自定义字典 API 的彻底重构。旧的 `customDict`「软覆盖」依赖 OpenCC 内置字典
**恰好不会再处理用户输出**，这一假设在不少场景下崩塌（典型如 t2s 方向字符
级简化会破坏锁定短语）。v1.3.1 用 **`protectedDict`** 替代——通过 Unicode
PUA 占位符把命中字段在内置转换运行前 mask 掉、跑完再 restore，从机制上保证
OpenCC 字典完全看不到也无法修改受保护字段。

### 破坏性变更

- **`createConverter(options, customDict)` → `createConverter(options, protectedDict)`**。
  第二参数重命名，行为从软覆盖改为硬覆盖。
  - 大多数调用方直接改名即可。如果你之前依赖「用户字典 A→B + 内置字典 B→C」
    的链式效果，请改写为直接 A→C。
- **移除 `options.applyCharFixes`**。机制整体退场；如果传该字段，运行时打
  `console.warn` 但忽略不报错。把原本写在那里的字形覆盖搬到 `protectedDict`。
- **移除 `data/custom/CharFixes.txt`**。替换为 `data/custom/ProtectedDict.txt`，
  格式完全相同。

### 新增

- `ProtectedConverter(dict, innerConvert)` —— 给任意 converter 套上硬覆盖层。
  可嵌套；相同 target 值共用一个 PUA 槽（超过 6400 个不同 target 才会
  抛 `RangeError`）。
- `parseOpenCCDict(text)` —— 把 OpenCC 格式字典文本（`key<TAB>value`、`#`
  起始为注释）解析成 `[key, value][]`。
- `Trie.findLongestMatch(input, start)` —— 暴露最长匹配原语，方便只扫描
  不替换的场景。
- **自动加载 `data/custom/ProtectedDict.txt`**：在 Node ESM `createConverter`
  没显式传 `protectedDict` 时生效。出厂模板全部注释掉，默认行为不变。传
  `[]` 可绕过。
- **所有 UMD bundle（`cn2t`、`t2cn`、`full`）的 `Converter` 接受 `protectedDict`
  第二参数**。UMD 不会自动加载 `ProtectedDict.txt`（浏览器无 fs）；要从
  远端文件加载，自己 `fetch` + `parseOpenCCDict`。UMD 同时也导出
  `ProtectedConverter` 和 `parseOpenCCDict`。

### 变更

- 跟随 OpenCC 上游 **TWPhrases 合并**：`TWPhrasesIT.txt`、`TWPhrasesName.txt`、
  `TWPhrasesOther.txt` → 单一的 `TWPhrases.txt`。`TWPhrasesRev.txt` 现在直接
  从上游下载（此前是本地合成三份文件得来）。
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
  - **通过 `.opencc-sync.json` 的 git diff 检测变更**——之前用
    `git status --porcelain`，但 `src/dict/` 和 `data/official/` 已 gitignored，
    根本看不见 sync 输出，所以触发逻辑实际上一直废着
  - **自动 bump 版本、打 tag、创建 release**——替代之前的 PR 流程
  - concurrency 限组、15 分钟超时、失败时自动开 issue
- CI `npm-publish.yml`：concurrency 限组、10 分钟超时；移除冗余的
  `sync:opencc` step（`npm run build` 内部已包含）。
- `data/custom/CNTWPhrases.txt`：移除有歧义的映射（`洋芋`、`速食面`、`主播`），
  修正 `高考 → 大學入學考試`、`物业 → 物業`，VR/AR 改为完整中文译名。

### 修复

- **`./cn2t`、`./t2cn` 子入口在所有 Node 用户下完全无法使用。**
  `package.json` 的 `exports.import` 指向 UMD bundle，但因 `type: "module"`
  Node 把 `.js` 当 ESM 解析；UMD 的 IIFE 不声明 ESM `export`，consumer 拿到
  空 namespace。修复方式：子入口 `import`/`require` 改指 `dist/bundles/*.js`
  （tsc 输出的真 ESM），UMD 文件保留在 `dist/umd/*.js` 给浏览器 CDN `<script>`。
- `git push --follow-tags` 不会推送轻量 tag。sync 工作流现在显式 push tag，
  避免 `softprops/action-gh-release` 找不到 remote 上的 tag 时退化到用
  `GITHUB_SHA`（也就是 bump 之前的旧 SHA）建 release。
- `prepublishOnly: npm run build && npm test` 给手工 `npm publish` 兜底，
  防止上传陈旧的 `dist/`。
- **CI 重复劳动** —— npm-publish 工作流先显式跑 `build && test`，然后
  `npm publish` 又触发 `prepublishOnly` 把 `build && test` 重跑一遍。修复：
  CI publish 加 `--ignore-scripts` 跳过 prepublishOnly（手工 publish 仍受
  保护）。sync-opencc 工作流先跑 `sync:opencc`，下一步 `npm run build` 又
  内含 sync；拆出 `build:dist`（只 tsc + rollup，无 sync）给已经显式 sync
  过的代码路径。

### 打包

- `engines.node: ">=22.12"` —— Node 22.12 起 `require()` ESM 默认开启，
  这是 CJS 消费者使用 ESM 子入口 bundle 的前提。
- `main` 字段从 UMD 改回 ESM `./dist/index.js`，保持一致。
- 移除已经失效的 `.npmignore`（`files: ["dist", "data"]` allowlist 优先级
  更高，原文件其实没起作用）。

### 开发体验

- 新增 ESLint 9 flat config（`eslint.config.js`）和 `npm run lint`、
  `lint:fix` 脚本。
- 新增 `npm run typecheck` + `tsconfig.check.json` —— 覆盖主 tsconfig（rootDir
  在 `src/`）漏掉的 `test/` 和 `scripts/`。
- 新增 `npm run build:dist` —— `tsc + rollup`，跳过上游 sync，给已经显式跑
  过 `sync:opencc` 的 CI 路径用。
- 新增 `CHANGELOG.md`（本文件）。

## [1.0.x] —— 初始版本

- `1.0.1` —— fix: 构建自动拉取自定义词典；新增 `.gitignore`，把生成内容
  （`src/dict/`、`data/official/`）从 git 跟踪中移除。
- `1.0.0` —— 首个发布版本。纯 JS 移植 OpenCC，附 TypeScript 类型、ESM +
  UMD bundle、以及从上游同步字典的 `sync:opencc` 脚本。
