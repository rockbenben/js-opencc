// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { HTMLConverter } from "../src/html-converter.js";

// Deterministic fake converter: maps a couple of simplified chars to traditional,
// everything else passes through. Keeps tests independent of the real dictionaries.
const MAP: Record<string, string> = { 简: "繁", 体: "體" };
const fakeConvert = (s: string) => Array.from(s).map((c) => MAP[c] ?? c).join("");

function setup(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body;
}

function makeConverter(root: Element | Document, converter = fakeConvert) {
  return HTMLConverter({ converter, rootNode: root, fromLangTag: "zh-CN", toLangTag: "zh-TW" });
}

describe("HTMLConverter", () => {
  it("converts text nodes under a matching lang, and restore() undoes it", () => {
    const root = setup('<div lang="zh-CN">简体</div>');
    const div = root.querySelector("div")!;
    const { convert, restore } = makeConverter(root);

    convert();
    expect(div.textContent).toBe("繁體");
    expect(div.getAttribute("lang")).toBe("zh-TW");

    restore();
    expect(div.textContent).toBe("简体");
    expect(div.getAttribute("lang")).toBe("zh-CN");
  });

  it("skips elements carrying the ignore-opencc class", () => {
    const root = setup('<div lang="zh-CN"><span class="ignore-opencc">简体</span></div>');
    makeConverter(root).convert();
    expect(root.querySelector("span")!.textContent).toBe("简体");
  });

  it("does not convert content inside SKIP_TAGS (e.g. CODE)", () => {
    const root = setup('<div lang="zh-CN"><code>简体</code></div>');
    makeConverter(root).convert();
    expect(root.querySelector("code")!.textContent).toBe("简体");
  });

  it("matches the lang tag case-insensitively (B3)", () => {
    const root = setup('<div lang="zh-cn">简</div>');
    makeConverter(root).convert();
    expect(root.querySelector("div")!.textContent).toBe("繁");
  });

  it('treats lang="" as breaking an inherited match (B4)', () => {
    const root = setup('<div lang="zh-CN">简<span lang="">体</span></div>');
    makeConverter(root).convert();
    const div = root.querySelector("div")!;
    expect(div.firstChild!.nodeValue).toBe("繁"); // div's own text node converted
    expect(root.querySelector("span")!.textContent).toBe("体"); // span subtree not converted
  });

  it("converts button-like input labels but leaves editable inputs alone (B1)", () => {
    const root = setup('<div lang="zh-CN"><input type="button" value="简体"><input type="text" value="简体"></div>');
    const [button, text] = Array.from(root.querySelectorAll("input")) as HTMLInputElement[];
    const { convert, restore } = makeConverter(root);

    convert();
    expect(button.value).toBe("繁體"); // regression: this was unreachable dead code before
    expect(text.value).toBe("简体"); // editable input must stay untouched

    restore();
    expect(button.value).toBe("简体");
  });

  it("converts IMG alt and META description inherited from a matching lang", () => {
    const root = setup('<div lang="zh-CN"><img alt="简体"></div>');
    const meta = document.createElement("meta");
    meta.setAttribute("name", "description");
    meta.setAttribute("content", "简体");
    root.querySelector("div")!.appendChild(meta);

    makeConverter(root).convert();
    expect(root.querySelector("img")!.getAttribute("alt")).toBe("繁體");
    expect(meta.getAttribute("content")).toBe("繁體");
  });

  it("is idempotent across repeated convert() and restores the true original (B11)", () => {
    const append = (s: string) => s + "✓"; // f(f(x)) !== f(x), so double-conversion is detectable
    const root = setup('<div lang="zh-CN">x</div>');
    const div = root.querySelector("div")!;
    const { convert, restore } = makeConverter(root, append);

    convert();
    convert(); // second pass must NOT append twice
    expect(div.textContent).toBe("x✓");

    restore();
    expect(div.textContent).toBe("x"); // true original, not "x✓"
  });

  // ── 可见文字属性 ───────────────────────────────────────────────
  //
  // 判据是**显示 vs 数据**，不是元素类型：可编辑 input 的 value 是用户自己的
  // 文字，不能动；它的 placeholder 是界面文字，和 <img alt> 同类，必须跟着转。
  // 漏掉的话，一个转成繁体的页面里每个空输入框仍显示简体提示语。

  it("转换 placeholder / title / aria-label（都是用户读到的文字）", () => {
    const root = setup('<div lang="zh-CN"><input placeholder="简体" title="简体" aria-label="简体"></div>');
    makeConverter(root).convert();
    const input = root.querySelector("input")!;
    expect(input.getAttribute("placeholder")).toBe("繁體");
    expect(input.getAttribute("title")).toBe("繁體");
    expect(input.getAttribute("aria-label")).toBe("繁體");
  });

  it("可编辑 input 的 value 是用户数据，转 placeholder 也不能碰它", () => {
    const root = setup('<div lang="zh-CN"><input type="text" value="简体" placeholder="简体"></div>');
    makeConverter(root).convert();
    const input = root.querySelector<HTMLInputElement>("input")!;
    expect(input.value, "用户输入的内容不许动").toBe("简体");
    expect(input.getAttribute("placeholder"), "提示语要跟着页面转").toBe("繁體");
  });

  it("同一个节点上多个槽位都能各自还原", () => {
    // 原来 originalValues 是每节点一个字符串、restore 按 tagName 分派，
    // 一个元素有两处被转就会把其中一处还原成另一处的原值
    const root = setup('<div lang="zh-CN"><input type="submit" value="简体" placeholder="简体" title="简体"></div>');
    const { convert, restore } = makeConverter(root);
    convert();
    const input = root.querySelector<HTMLInputElement>("input")!;
    expect(input.value).toBe("繁體");
    expect(input.getAttribute("placeholder")).toBe("繁體");
    expect(input.getAttribute("title")).toBe("繁體");
    restore();
    expect(input.value).toBe("简体");
    expect(input.getAttribute("placeholder")).toBe("简体");
    expect(input.getAttribute("title")).toBe("简体");
  });

  it("lang 不匹配时这些属性也不转", () => {
    const root = setup('<div lang="en"><input placeholder="简体"></div>');
    makeConverter(root).convert();
    expect(root.querySelector("input")!.getAttribute("placeholder")).toBe("简体");
  });
});
