# js-opencc

[![npm version](https://img.shields.io/npm/v/js-opencc.svg)](https://www.npmjs.com/package/js-opencc)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

[简体中文](README.md) | [繁體中文](README_TW.md)

純 JavaScript 實現的中文簡繁轉換庫，直接同步 [OpenCC](https://github.com/BYVoid/OpenCC) 官方字典；額外提供 `protectedDict` **硬保護字典**——機制保證某些欄位絕不被 OpenCC 觸碰（人名、術語、品牌、自訂譯名）。

## ✨ 特性

- **純 JavaScript** —— 無需編譯，瀏覽器 / Node.js / Deno 通用
- **直接同步 OpenCC 官方字典** —— 一鍵腳本拉取最新版本
- **TypeScript 原生支援** —— 完整型別定義
- **UMD + ESM** —— CDN 與現代模組系統通用
- **`protectedDict` 硬保護字典** —— PUA 佔位符機制鎖定，不依賴資料巧合
- **可一鍵匯出 PR 給 OpenCC 上游** —— 雙向貢獻

> 為什麼不直接用現有方案？官方 `opencc` 包依賴 C++ 編譯（node-gyp 在純前端專案跑不起來）；`opencc-js` 4 年未更新。js-opencc 解決了這兩個問題。

## 安裝

```bash
npm install js-opencc
```

> Node.js ≥ 22.12（需要 `require()` ESM 的支援，<22.12 的版本 CJS `require("js-opencc")` 會失敗）。瀏覽器 / Deno 不受限。

或 CDN：

```html
<script src="https://cdn.jsdelivr.net/npm/js-opencc/dist/umd/full.min.js"></script>
```

## 基本用法

### ES Module（Node.js / 現代瀏覽器）

```typescript
import { createConverter } from "js-opencc";

const cn2tw = await createConverter({ from: "cn", to: "tw" });
console.log(cn2tw("软件")); // 軟件

// to: "twp" 在 tw 基礎上加大陸↔台灣詞彙映射（軟件 → 軟體）
const cn2twp = await createConverter({ from: "cn", to: "twp" });
console.log(cn2twp("软件")); // 軟體

const hk2cn = await createConverter({ from: "hk", to: "cn" });
console.log(hk2cn("軟件")); // 软件
```

### CDN（瀏覽器）

```html
<!-- 完整版 -->
<script src="https://cdn.jsdelivr.net/npm/js-opencc/dist/umd/full.min.js"></script>

<!-- 僅簡體→繁體 -->
<script src="https://cdn.jsdelivr.net/npm/js-opencc/dist/umd/cn2t.min.js"></script>

<!-- 僅繁體→簡體（最小，~68KB） -->
<script src="https://cdn.jsdelivr.net/npm/js-opencc/dist/umd/t2cn.min.js"></script>

<script>
  const converter = OpenCC.Converter({ from: "cn", to: "tw" });
  console.log(converter("软件")); // 軟件
</script>
```

## 自訂字典

### `protectedDict`：硬保護字典

`createConverter` 第二參數 `protectedDict` 是 js-opencc 唯一的自訂字典入口，**優先級高於所有 OpenCC 內建字典**。命中欄位在轉換前被 PUA 佔位符取代，OpenCC 引擎完全看不到原欄位，轉換完成後再還原。

```typescript
const protectedDict = [
  ["自行車", "自行車"],      // 鎖定不變：t2s 時強制保持繁體
  ["周杰倫", "周杰倫"],       // 自訂譯名：s2t 時按你的方式轉
  ["公司術語", "Company Term"],
];

const convert = await createConverter({ from: "tw", to: "cn" }, protectedDict);
// "自行車" 不會被 opencc 轉成 "自行车"
```

**典型用例**：

- **鎖定欄位** —— 人名 / 品牌 / 術語原樣保留（`from === to`）
- **自訂譯名** —— 覆寫 OpenCC 預設轉換
- **領域術語** —— 批次映射到統一規範

**匹配規則**：

- 多條規則 `from` 有重疊時套用**最長匹配**（「中國人民」優先於「中國」）
- 同名 `from` 多條規則：後寫覆寫前寫
- 規則中**禁止使用 PUA 字元** U+E000..U+F8FF（內部佔位符段）

### 從檔案載入（自動）

套件內自帶範本 [`data/custom/ProtectedDict.txt`](./data/custom/ProtectedDict.txt) 在 `createConverter` 不傳第二參數時**自動載入並套用**——直接編輯該檔案即可：

```typescript
import { createConverter } from "js-opencc";

// 如果 data/custom/ProtectedDict.txt 含非註解規則，自動作為 protectedDict 套用
const convert = await createConverter({ from: "cn", to: "tw" });
```

檔案格式與 OpenCC 上游字典完全一致：每行 `key<TAB>value`，`#` 開頭為註解，空行忽略。出廠狀態下所有規則都被註解掉（即自動載入結果為零條目，等同未提供）。

> 僅 ESM/Node `createConverter` 入口生效（瀏覽器 / Deno 無 fs 時靜默跳過）。顯式傳第二參數（包括 `[]`）會繞過自動載入。如需從其他路徑載入，自行 `parseOpenCCDict(fs.readFileSync(path, "utf8"))` 後傳入即可。

### UMD / CDN 中使用 protectedDict

UMD bundle（`cn2t`、`t2cn`、`full`）的 `Converter` 也接受同樣的第二參數，但**不會**自動載入 `ProtectedDict.txt`（瀏覽器無 fs 存取）。需要顯式傳入：

```html
<script src="https://cdn.jsdelivr.net/npm/js-opencc/dist/umd/full.min.js"></script>
<script>
  const convert = OpenCC.Converter({ from: "cn", to: "tw" }, [["北京", "東京"]]);
  console.log(convert("我去北京")); // 我去東京
</script>
```

從遠端檔案載入規則：

```javascript
const text = await fetch("/my-protected.txt").then((r) => r.text());
const dict = OpenCC.parseOpenCCDict(text);
const convert = OpenCC.Converter({ from: "cn", to: "tw" }, dict);
```

### `CNTWPhrases`：`twp` 模式內建詞彙層

[`data/custom/CNTWPhrases.txt`](./data/custom/CNTWPhrases.txt) 在 OpenCC `s2twp` / `tw2sp` 配置之上補充大陸 ↔ 台灣慣用語差異（如「視頻」↔「影片」、「滑鼠」↔「鼠標」）—— OpenCC 官方僅做 TW 內部短語規範化。

- **生效時機**：`from: "twp"` 或 `to: "twp"`
- **停用**：傳 `loadCustomPhrases: false`

## 地區代碼

| 代碼  | 說明                                            |
| ----- | ----------------------------------------------- |
| `cn`  | 簡體中文（中國大陸）                            |
| `tw`  | 繁體中文（台灣）                                |
| `twp` | 繁體中文（台灣）+ 詞彙轉換（如：软件 → 軟體）   |
| `hk`  | 繁體中文（香港）                                |
| `jp`  | 日本新字體                                      |
| `t`   | OpenCC 標準繁體                                 |

## Bundle 大小

| 套件          | 大小（minified） | 說明                       |
| ------------- | ---------------- | -------------------------- |
| `full.min.js` | ~1.1 MB          | 完整版，支援所有轉換方向   |
| `cn2t.min.js` | ~1.1 MB          | 僅簡體 → 繁體              |
| `t2cn.min.js` | ~68 KB           | 僅繁體 → 簡體（絕大多數字典是簡→繁向，反向資料小） |

## API 一覽

主入口（`import from "js-opencc"`）和 UMD bundle 都暴露這些：

| 名稱                      | 用途                                                          |
| ------------------------- | ------------------------------------------------------------- |
| `createConverter`         | 推薦入口，按 `{ from, to }` 動態建構轉換函數（ESM/Node only） |
| `Converter`               | UMD bundle 同步版本，簽名與 `createConverter` 一致            |
| `ProtectedConverter`      | 把硬保護字典套在任意 inner converter 外面                     |
| `parseOpenCCDict`         | 解析 OpenCC 格式字典文字為 `[key, value][]`                   |
| `CustomConverter`         | 單字典快速建構轉換函數（不含 OpenCC 內建字典）                |
| `ConverterFactory`        | 多字典分組鏈式轉換的底層 factory                              |
| `Trie`                    | 底層 Trie（含 `addWord` / `loadDict` / `convert` / `findLongestMatch`）|
| `HTMLConverter`           | DOM 內文字節點批次轉換 + 還原                                 |

完整型別定義隨套件發佈。`./core` 和 `./cn2t` / `./t2cn` 子入口提供按需載入的更小 surface。

## 同步與貢獻字典

### 同步上游

```bash
npm run sync:opencc   # 從 OpenCC 官方拉取最新字典
npm run build         # 完整建置（含 sync + tsc + rollup）
npm run build:dist    # 跳過 sync，只跑 tsc + rollup
```

### 反哺 OpenCC

發現 OpenCC 缺詞或錯誤？

1. 在 `data/custom/CNTWPhrases.txt` 追加候選詞條
2. 執行 `npm run export:pr` —— 自動 fetch 上游 `TWPhrases.txt` 做 diff，輸出 PR-ready 的新詞條清單
3. 把清單提交給 [BYVoid/OpenCC](https://github.com/BYVoid/OpenCC)

## 開發

```bash
npm test              # vitest run
npm run typecheck     # tsc --noEmit，涵蓋 src/、test/、scripts/
npm run lint          # ESLint 9 flat config
npm run lint:fix      # 自動修復可修復項
```

CI 會在每次 release 時自動跑 build + test 後再 publish；`prepublishOnly` 鉤子額外為手動 `npm publish` 兜底。OpenCC 上游字典每兩週同步一次，只在內容真的有變化時才發佈新版（透過 `.opencc-sync.json` 內容雜湊偵測）。

## v1.3.x 升級說明（自 v1.0.x）

這一版是自訂字典 API 的徹底重構。**完整變更見 [CHANGELOG.md](./CHANGELOG.md)。** 核心要點：

- 第二參數 **`customDict` → `protectedDict`**（重新命名）
- 行為：**軟覆寫 → 硬覆寫**。命中規則後，OpenCC 內建字典不再處理這些欄位（機制保證，不再依賴資料巧合）
- 移除 `applyCharFixes` 選項 + `data/custom/CharFixes.txt` 檔案。舊的字形保護需求全部遷移到 `protectedDict`
- 版本號策略：major 跟隨 OpenCC 上游大版本（OpenCC 1.x → js-opencc 1.x）；minor/patch 由 js-opencc 自家疊代

**遷移**：

- 90% 場景下 `createConverter(opts, customDict)` 改名為 `createConverter(opts, protectedDict)` 即可
- 若你依賴軟覆寫的鏈式轉換（A→B 由使用者字典提供、B→C 由內建字典完成），請改寫為直接 A→C
- 若你曾修改 `data/custom/CharFixes.txt`，把那些條目移入 `protectedDict`

## License

Apache-2.0（與 OpenCC 相同）
