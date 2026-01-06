# js-opencc

[![npm version](https://img.shields.io/npm/v/js-opencc.svg)](https://www.npmjs.com/package/js-opencc)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

[简体中文](README.md) | [繁体中文](README_TW.md)

纯 JavaScript 实现的中文简繁转换库，直接从 [OpenCC](https://github.com/BYVoid/OpenCC) 官方同步字典。

## 为什么要做这个项目？

[OpenCC](https://github.com/BYVoid/OpenCC) 是最权威的中文简繁转换工具，但在 JavaScript 环境中使用时遇到了问题：

- **官方 `opencc` npm 包**：需要 C++ 编译环境（node-gyp），在纯前端项目和很多部署环境中无法使用
- **`opencc-js` 包**：纯 JavaScript 实现，但已超过 4 年未更新

**js-opencc** 解决了这些问题：

- ✅ **纯 JavaScript** - 无需编译，浏览器、Node.js、Deno 通用
- ✅ **直接同步官方字典** - 一键命令从 OpenCC 官方获取最新字典
- ✅ **TypeScript 原生支持** - 完整的类型定义
- ✅ **UMD + ESM** - 同时支持 CDN 引用和现代模块系统
- ✅ **双向贡献** - 可以将自定义词条导出提交给 OpenCC

## 快速开始

```bash
npm install js-opencc
```

或使用 CDN：

```html
<script src="https://cdn.jsdelivr.net/npm/js-opencc/dist/umd/full.min.js"></script>
```

## 使用方法

### ES Module (Node.js / 现代浏览器)

```typescript
import { createConverter } from "js-opencc";

// 简体 → 繁体（台湾）
const converter = await createConverter({ from: "cn", to: "tw" });
console.log(converter("软件")); // 软体

// 繁体（香港）→ 简体
const hk2cn = await createConverter({ from: "hk", to: "cn" });
console.log(hk2cn("软件")); // 软件
```

### CDN 引用 (浏览器)

```html
<!-- 完整版 -->
<script src="https://cdn.jsdelivr.net/npm/js-opencc/dist/umd/full.min.js"></script>

<!-- 简体 → 繁体（体积更小） -->
<script src="https://cdn.jsdelivr.net/npm/js-opencc/dist/umd/cn2t.min.js"></script>

<!-- 繁体 → 简体（体积最小，~62KB） -->
<script src="https://cdn.jsdelivr.net/npm/js-opencc/dist/umd/t2cn.min.js"></script>

<script>
  const converter = OpenCC.Converter({ from: "cn", to: "tw" });
  console.log(converter("软件")); // 软体
</script>
```

### 自定义字典（自动加载）

本项目内置了两个特殊的自定义字典文件，会在转换时**默认自动加载**：

1.  **`data/custom/CNTWPhrases.txt`（词汇差异表）**

    - **生效时机**：当 `from: "twp"` 或 `to: "twp"` 时自动加载
    - **功能**：处理大陆与台湾的惯用语差异（如「视频」↔「影片」，「鼠标」↔「滑鼠」）
    - **特点**：双向自动映射（cn→twp 直接使用，twp→cn 自动反转）

2.  **`data/custom/CharFixes.txt`（字形优先表）**
    - **生效时机**：所有转换模式下**默认加载**
    - **功能**：修正 OpenCC 的错误转换或处理简繁同形字
    - **特点**：优先级最高，会覆盖 OpenCC 的官方转换结果（如强制「抬」字不转换）

#### 手动控制加载

如果你不想使用默认的自定义字典，可以在 `createConverter` 时禁用：

```typescript
const converter = await createConverter({
  from: "cn",
  to: "twp",
  loadCustomPhrases: false, // 禁用 CNTWPhrases.txt
  applyCharFixes: false, // 禁用 CharFixes.txt
});
```

#### 代码中添加自定义词汇

除了使用文件，你也可以在代码中动态传入自定义字典：

```typescript
// 自定义词条（优先级高于官方字典，但低于 CharFixes）
const customDict = [
  ["幼儿园", "幼稚园"],
  ["博客", "部落格"],
];

const converter = await createConverter({ from: "cn", to: "twp" }, customDict);
```

## 地区代码

| 代码  | 说明                                          |
| ----- | --------------------------------------------- |
| `cn`  | 简体中文（中国大陆）                          |
| `tw`  | 繁体中文（台湾）                              |
| `twp` | 繁体中文（台湾）+ 词汇转换（如：软件 → 软体） |
| `hk`  | 繁体中文（香港）                              |
| `jp`  | 日本新字体                                    |
| `t`   | OpenCC 标准繁体                               |

## Bundle 大小

| 包            | 大小 (minified) | 说明                     |
| ------------- | --------------- | ------------------------ |
| `full.min.js` | ~1.1 MB         | 完整版，支持所有转换方向 |
| `cn2t.min.js` | ~1.0 MB         | 仅简体 → 繁体            |
| `t2cn.min.js` | ~62 KB          | 仅繁体 → 简体            |

## 更新字典

```bash
npm run sync:opencc   # 从 OpenCC 官方同步最新字典
npm run build         # 重新构建
```

## 贡献给 OpenCC

如果你在使用过程中发现字典缺失或错误：

1. 修改 `data/custom/CNTWPhrases.txt`（词汇）
2. 运行 `npm run export:pr`
3. 脚本会对比官方字典，生成该提交给 OpenCC 的新词条列表
4. 提交 Pull Request 给 https://github.com/BYVoid/OpenCC

## License

Apache-2.0（与 OpenCC 相同）
