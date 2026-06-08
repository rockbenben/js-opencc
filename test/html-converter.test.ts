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
});
