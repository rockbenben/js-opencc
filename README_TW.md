# js-opencc

[![npm version](https://img.shields.io/npm/v/js-opencc.svg)](https://www.npmjs.com/package/js-opencc)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

[简体中文](README.md) | [繁體中文](README_TW.md)

純 JavaScript 實現的中文簡繁轉換庫，直接從 [OpenCC](https://github.com/BYVoid/OpenCC) 官方同步字典。

## 為什麼要做這個專案？

[OpenCC](https://github.com/BYVoid/OpenCC) 是最權威的中文簡繁轉換工具，但在 JavaScript 環境中使用時遇到了問題：

- **官方 `opencc` npm 包**：需要 C++ 編譯環境（node-gyp），在純前端專案和很多部署環境中無法使用
- **`opencc-js` 包**：純 JavaScript 實現，但已超過 4 年未更新

**js-opencc** 解決了這些問題：

- ✅ **純 JavaScript** - 無需編譯，瀏覽器、Node.js、Deno 通用
- ✅ **直接同步官方字典** - 一鍵命令從 OpenCC 官方獲取最新字典
- ✅ **TypeScript 原生支援** - 完整的型別定義
- ✅ **UMD + ESM** - 同時支援 CDN 引用和現代模組系統
- ✅ **雙向貢獻** - 可以將自定義詞條導出提交給 OpenCC

## 快速開始

```bash
npm install js-opencc
```

或使用 CDN：

```html
<script src="https://cdn.jsdelivr.net/npm/js-opencc/dist/umd/full.min.js"></script>
```

## 使用方法

### ES Module (Node.js / 現代瀏覽器)

```typescript
import { createConverter } from "js-opencc";

// 簡體 → 繁體（台灣）
const converter = await createConverter({ from: "cn", to: "tw" });
console.log(converter("软件")); // 軟體

// 繁體（香港）→ 簡體
const hk2cn = await createConverter({ from: "hk", to: "cn" });
console.log(hk2cn("軟件")); // 软件
```

### CDN 引用 (瀏覽器)

```html
<!-- 完整版 -->
<script src="https://cdn.jsdelivr.net/npm/js-opencc/dist/umd/full.min.js"></script>

<!-- 簡體 → 繁體（體積更小） -->
<script src="https://cdn.jsdelivr.net/npm/js-opencc/dist/umd/cn2t.min.js"></script>

<!-- 繁體 → 簡體（體積最小，~62KB） -->
<script src="https://cdn.jsdelivr.net/npm/js-opencc/dist/umd/t2cn.min.js"></script>

<script>
  const converter = OpenCC.Converter({ from: "cn", to: "tw" });
  console.log(converter("软件")); // 軟體
</script>
```

### 自定義字典（自動載入）

本專案內建了兩個特殊的自定義字典檔案，會在轉換時**預設自動載入**：

1.  **`data/custom/CNTWPhrases.txt`（詞彙差異表）**

    - **生效時機**：當 `from: "twp"` 或 `to: "twp"` 時自動載入
    - **功能**：處理大陸與台灣的慣用語差異（如「视频」↔「影片」，「鼠标」↔「滑鼠」）
    - **特點**：雙向自動映射（cn→twp 直接使用，twp→cn 自動反轉）

2.  **`data/custom/CharFixes.txt`（字形優先表）**
    - **生效時機**：所有轉換模式下**預設載入**
    - **功能**：修正 OpenCC 的錯誤轉換或處理簡繁同形字
    - **特點**：優先級最高，會覆蓋 OpenCC 的官方轉換結果（如強制「抬」字不轉換）

#### 手動控制載入

如果你不想使用預設的自定義字典，可以在 `createConverter` 時禁用：

```typescript
const converter = await createConverter({
  from: "cn",
  to: "twp",
  loadCustomPhrases: false, // 禁用 CNTWPhrases.txt
  applyCharFixes: false, // 禁用 CharFixes.txt
});
```

#### 程式碼中添加自定義詞彙

除了使用檔案，你也可以在程式碼中動態傳入自定義字典：

```typescript
// 自定義詞條（優先級高於官方字典，但低於 CharFixes）
const customDict = [
  ["幼兒園", "幼稚園"],
  ["博客", "部落格"],
];

const converter = await createConverter({ from: "cn", to: "twp" }, customDict);
```

## 地區代碼

| 代碼  | 說明                                          |
| ----- | --------------------------------------------- |
| `cn`  | 簡體中文（中國大陸）                          |
| `tw`  | 繁體中文（台灣）                              |
| `twp` | 繁體中文（台灣）+ 詞彙轉換（如：软件 → 軟體） |
| `hk`  | 繁體中文（香港）                              |
| `jp`  | 日本新字體                                    |
| `t`   | OpenCC 標準繁體                               |

## Bundle 大小

| 包            | 大小 (minified) | 說明                     |
| ------------- | --------------- | ------------------------ |
| `full.min.js` | ~1.1 MB         | 完整版，支援所有轉換方向 |
| `cn2t.min.js` | ~1.0 MB         | 僅簡體 → 繁體            |
| `t2cn.min.js` | ~62 KB          | 僅繁體 → 簡體            |

## 更新字典

```bash
npm run sync:opencc   # 從 OpenCC 官方同步最新字典
npm run build         # 重新構建
```

## 貢獻給 OpenCC

如果你在使用過程發現字典缺失或錯誤：

1. 修改 `data/custom/CNTWPhrases.txt`（詞彙）
2. 執行 `npm run export:pr`
3. 指令碼會對比官方字典，生成該提交給 OpenCC 的新詞條列表
4. 提交 Pull Request 給 https://github.com/BYVoid/OpenCC

## License

Apache-2.0（與 OpenCC 相同）
