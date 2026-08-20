# js-opencc

> 純 JavaScript 的中文簡繁轉換：直接追 OpenCC 官方詞典，人名與術語可硬鎖定不被轉換。

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

- **純 JavaScript** —— 無需編譯，瀏覽器 / Node.js / Deno 通用，零執行時相依
- **`protectedDict` 硬保護字典** —— PUA 佔位符機制鎖定，不依賴資料巧合
- **直接同步 OpenCC 官方字典** —— 上游漂移會中止同步，不靜默產出錯誤結果
- **對齊 OpenCC 官方用例** —— 16 個 config、556 條期望全量比對，隨字典同步重新整理
- **按方向載入** —— 繁→簡只拉 0.11 MB，不是整包 1.13 MB
- **TypeScript 原生支援 · UMD + ESM** —— 完整型別定義，CDN 與現代模組系統通用

## 支援的地區代碼

| 代碼 | 說明 |
| --- | --- |
| `cn` | 簡體中文（中國大陸） |
| `tw` | 繁體中文（台灣） |
| `twp` | 繁體中文（台灣）+ 詞彙轉換（软件 → 軟體） |
| `hk` | 繁體中文（香港） |
| `hkp` | 繁體中文（香港）+ 詞彙轉換（伍迪·艾伦 → 活地·亞倫） |
| `jp` | 日本新字體 |
| `t` | OpenCC 標準繁體 |

七個代碼任意組合，`from` 和 `to` 各取其一。

**執行環境**：Node.js ≥ 22.12（需要 `require()` ESM 的支援，更低版本 CJS `require("js-opencc")` 會失敗）；瀏覽器 / Deno 不受限。

## 用法

### ES Module（Node.js / 現代瀏覽器）

```typescript
import { createConverter } from "js-opencc";

const cn2tw = await createConverter({ from: "cn", to: "tw" });
cn2tw("软件"); // 軟件

// to: "twp" 在 tw 基礎上加大陸↔台灣詞彙映射
const cn2twp = await createConverter({ from: "cn", to: "twp" });
cn2twp("软件"); // 軟體

const hk2cn = await createConverter({ from: "hk", to: "cn" });
hk2cn("軟件"); // 软件
```

### CDN（瀏覽器）

三個 bundle 都註冊全域 `OpenCC`，**同一頁面只引入其中一個**；每個 bundle 只接受自己支援的方向，傳別的方向會直接拋錯。

```html
<!-- 完整版：任意方向 -->
<script src="https://cdn.jsdelivr.net/npm/js-opencc/dist/umd/full.min.js"></script>
<script>
  OpenCC.Converter({ from: "cn", to: "tw" })("软件"); // 軟件
</script>

<!-- 僅簡體→繁體：只傳 to -->
<script src="https://cdn.jsdelivr.net/npm/js-opencc/dist/umd/cn2t.min.js"></script>
<script>
  OpenCC.Converter({ to: "tw" })("软件"); // 軟件
</script>

<!-- 僅繁體→簡體（最小）：只傳 from -->
<script src="https://cdn.jsdelivr.net/npm/js-opencc/dist/umd/t2cn.min.js"></script>
<script>
  OpenCC.Converter({ from: "tw" })("軟件"); // 软件
</script>
```

## 自訂字典

### `protectedDict`：硬保護字典

`createConverter` 第二參數是 js-opencc 唯一的自訂字典入口，**優先級高於所有 OpenCC 內建字典**。命中欄位在轉換前被 PUA 佔位符替換，OpenCC 引擎完全看不到原欄位，轉換完成後再還原。

```typescript
const protectedDict = [
  ["自行車", "自行車"], // 鎖定不變：t2s 時強制保持繁體
  ["周杰伦", "周杰倫"], // 自訂譯名：s2t 時按你的方式轉（鍵須為簡體才會命中）
  ["公司术语", "Company Term"],
];

const convert = await createConverter({ from: "tw", to: "cn" }, protectedDict);
convert("自行車"); // 自行車 —— 不會被轉成「自行车」

// 鍵和值相同 = 鎖定：這個詞在任何方向上都原樣保留
const keep = await createConverter({ from: "cn", to: "tw" }, [["头发", "头发"]]);
keep("头发和发现"); // 头发和發現 —— 只有「发现」被轉了
```

**典型用例**：鎖定人名 / 品牌 / 術語（`from === to`）、覆蓋 OpenCC 的預設譯法、把領域術語批次映射到統一規範。

**匹配規則**：

- 多條規則的鍵重疊時套用**最長匹配**（「中国人民」優先於「中国」）
- 同一個鍵有多條規則：後寫覆蓋前寫
- 規則裡的 **PUA 字元** U+E000..U+F8FF（內部佔位符段）會被靜默剝掉，剝完為空的條目整條跳過。規則來自終端使用者（貼上 / 匯入 / localStorage 裡的歷史資料）時不必自己先洗

### 從檔案載入（自動）

套件內自帶範本 [`data/custom/ProtectedDict.txt`](./data/custom/ProtectedDict.txt)，在不傳第二參數時**自動載入並套用**——直接編輯該檔案即可。格式與 OpenCC 上游字典一致：每行 `key<TAB>value`，`#` 開頭為註解。出廠狀態下所有規則都被註解掉。

> 僅 ESM/Node `createConverter` 入口生效（瀏覽器 / Deno 無 fs 時靜默跳過）。顯式傳第二參數（包括 `[]` 和 `""`）會繞過自動載入。要從別的路徑載入，自己 `parseOpenCCDict(fs.readFileSync(path, "utf8"))` 後傳入。

### UMD / CDN 中使用

UMD bundle 的 `Converter` 接受同樣的第二參數，但**不會**自動載入 `ProtectedDict.txt`（瀏覽器無 fs）：

```javascript
OpenCC.Converter({ from: "cn", to: "tw" }, [["北京", "東京"]])("我去北京"); // 我去東京

// 從遠端檔案載入規則
const text = await fetch("/my-protected.txt").then((r) => r.text());
OpenCC.Converter({ from: "cn", to: "tw" }, OpenCC.parseOpenCCDict(text));
```

### `CNTWPhrases`：`twp` 模式內建詞彙層

[`data/custom/CNTWPhrases.txt`](./data/custom/CNTWPhrases.txt) 在 OpenCC `s2twp` / `tw2sp` 之上補 41 條大陸↔台灣慣用語（「视频」↔「影片」、「鼠标」↔「滑鼠」）—— OpenCC 官方只做 TW 內部短語規範化，不收生活詞彙。走和 `protectedDict` 同一套硬覆蓋機制，優先級排在使用者字典之下、內建轉換鏈之上。

- **預設開啟**：`from: "twp"` 或 `to: "twp"`；`loadCustomPhrases: false` 關閉
- **套用方向**：目標是台灣詞彙（`to: "tw" / "twp"`）且來源不是 → 正向；來源是台灣詞彙且 `to: "cn"` → 反向；**其餘方向不套用**，包括顯式打開開關（往香港輸出裡塞台灣詞彙並非本意）
- 台灣側互轉（`twp → tw`）不套：「土豆」這類簡繁同形詞會被按大陸語義改寫成「馬鈴薯」，而台灣語境下它是花生

這 41 條和上游的重合情況、以及「一條都刪不得」的消融驗證，見 [`docs/comparison.md`](./docs/comparison.md)。

## API 一覽

主入口（`import from "js-opencc"`）與 UMD bundle 的公開 API：

| 名稱 | 用途 |
| --- | --- |
| `createConverter` | 推薦入口，按 `{ from, to }` 動態建構轉換函式（ESM / Node） |
| `Converter` | UMD 同步版本；參數同上，`cn2t` / `t2cn` 只接受各自方向 |
| `ProtectedConverter` | 把硬保護字典套在任意 inner converter 外面 |
| `parseOpenCCDict` | 解析 OpenCC 格式字典文字為 `[key, value][]` |
| `CustomConverter` | 單字典快速建構轉換函式（不含 OpenCC 內建字典） |
| `ConverterFactory` | 多字典分組鏈式轉換的底層 factory |
| `Trie` | 底層 Trie（`addWord` / `loadDict` / `convert` / `findLongestMatch`） |
| `HTMLConverter` | DOM 內文字節點批次轉換 + 還原 |

完整型別定義隨套件發布。`./core` 與 `./cn2t` / `./t2cn` 子入口提供更小的 surface。

## Bundle 大小

| 套件 | 大小（minified） | 說明 |
| --- | --- | --- |
| `full.min.js` | ~1.13 MB | 完整版，支援所有轉換方向 |
| `cn2t.min.js` | ~1.04 MB | 僅簡體 → 繁體 |
| `t2cn.min.js` | ~100 KB | 僅繁體 → 簡體（絕大多數字典是簡→繁向，反向資料小） |

npm 安裝後佔 **6.1 MB**（tarball 2.5 MB）。每個 bundle 同時發未壓縮和 `.min.js` 兩份；這些 bundle 有 97% 是詞典字串，壓縮前後只差 3%。

## 和其他方案的關係

純 JS 這條路上還有 [`opencc-js`](https://github.com/nk2028/opencc-js)，**這個套件的架構來自它**——`Trie` / `ConverterFactory` / `HTMLConverter` 這些名字、`{ from, to }` 的地區代碼體系、子入口劃分，都沿用它的設計，詞組切分和相容漢字正規化也是先在它那裡看到才知道該做。謹此致謝。同一套 OpenCC 詞典、同樣的轉換語義，**絕大多數輸入兩者結果一致**。

選這個套件的理由只有三條：需要**硬覆蓋**某些詞條（鎖定語義是鏈式自訂轉換器表達不了的）、需要**內建的大陸↔台灣生活詞**（41 條裡 29 條官方鏈條給不出）、或者要**緊跟上游 `master` 詞典**（實測兩邊差 2286 條 / 3.62%）。三條都用不上就不必換。

逐項實測——引擎消融、詞典差異、載入粒度、記憶體、吞吐——都在 [`docs/comparison.md`](./docs/comparison.md)，含可重跑的方法。

官方 `opencc` 套件是另一個選擇：Node.js native binding，能用 Jieba 等擴充分詞，但依賴原生編譯（`node-gyp` + `node-addon-api`），純前端專案裡跑不起來。

## 同步與貢獻字典

```bash
npm run sync:opencc   # 從 OpenCC 官方拉取最新字典
npm run build         # 完整建置（含 sync + tsc + rollup）
npm run build:dist    # 跳過 sync，只跑 tsc + rollup
```

`sync:opencc` 不只是下載，它同時做四道**會中止**的對帳——上游變了而我們沒跟上時，寧可讓同步失敗，也不要靜默產出錯誤結果：

1. **字典檔案清單** —— 上游新增或刪除 `.txt` 且不在白名單裡，報錯要人裁決
2. **轉換鏈** —— 11 條鏈逐個比對上游 config 的 `conversion_chain`
3. **切分宣告** —— 16 個 config 的 `segmentation` 欄位**兩個方向都查**：我們切的上游不切了，以及上游新增了我們沒切的。後者尤其容易漏——什麼都不會報錯，只是從此少切一刀，地區詞彙又開始越界替換
4. **官方 testcases** —— fixture 與字典同一次快照重新整理，避免拿新字典去對舊用例

`STPhrases_GeneratedFromRegionalPhrases`（OpenCC 建置期產生的切分字典）由同步腳本按上游 `generate_st_phrases_from_regional_phrases.py` 的規則本地產生，不需要 OpenCC 的建置環境。

**反哺 OpenCC**：在 `data/custom/CNTWPhrases.txt` 追加詞條 → `npm run export:pr` 自動 fetch 上游 `TWPhrases.txt` 做 diff → 把清單提交給 [BYVoid/OpenCC](https://github.com/BYVoid/OpenCC)。

## 開發

```bash
npm test              # vitest run
npm run typecheck     # tsc --noEmit，涵蓋 src/、test/、scripts/
npm run lint          # ESLint 9 flat config
```

CI 在每次 release 時跑 build + test 後再 publish；`prepublishOnly` 鉤子給手動 `npm publish` 兜底。OpenCC 上游字典每兩週同步一次，只在內容真的有變化時才發布新版（`.opencc-sync.json` 內容雜湊偵測）。

## 從 v1.0.x 升級

自訂字典 API 在 v1.3 做過一次徹底重構，**完整變更見 [CHANGELOG.md](./CHANGELOG.md)**：

- 第二參數 `customDict` → `protectedDict`，行為從**軟覆蓋變成硬覆蓋**（命中規則後 OpenCC 內建字典不再處理這些欄位，機制保證）
- 移除 `applyCharFixes` 選項與 `data/custom/CharFixes.txt`，舊的字形保護訴求全部遷移到 `protectedDict`
- 若你依賴軟覆蓋的鏈式轉換（A→B 由使用者字典提供、B→C 由內建字典完成），改寫為直接 A→C

版本號策略：major 跟隨 OpenCC 上游大版本（OpenCC 1.x → js-opencc 1.x），minor / patch 由本專案自行迭代。

## License

Apache-2.0。隨套件發布的詞典資料來自 [OpenCC](https://github.com/BYVoid/OpenCC)，以同一協議再分發。
