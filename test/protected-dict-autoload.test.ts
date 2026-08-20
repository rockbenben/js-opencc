/**
 * 回归：createConverter 第二参数的「显式给了就绕过自动加载」契约。
 *
 * 为什么单独一个文件 + mock `node:fs/promises`：要观察这个 bug，ProtectedDict.txt
 * 里必须「有规则」，而出厂文件全被注释（自动加载结果为空），所以在真文件上 ""
 * 和 [] 行为恰好一样——bug 曾因此不可见。真去编辑磁盘上那个共享文件又不行：
 * vitest 多文件并行，upstream-parity 里无参调用 createConverter 的用例会在编辑
 * 窗口期读到测试规则、偶发变红。mock 只在本文件的模块注册表里生效，两个问题都没有。
 *
 * 曾经的写法是 `if (!protectedDict)`——falsy 判断让显式传入的 "" 也走了自动加载，
 * 与文档「显式传第二参数（包括 []）会绕过自动加载」相悖（DictLike 收字符串，
 * "" 是合法的显式实参）。现在是 `=== undefined`。
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("node:fs/promises", () => {
  const readFile = async (): Promise<string> => "汉语\t汉语LOCK\n";
  return { readFile, default: { readFile } };
});

import { createConverter } from "../src/converter.js";

describe("createConverter · protectedDict 自动加载的绕过契约", () => {
  it("不传第二参数 → 自动加载生效（mock 的正控，证明本文件的规则真的在场）", async () => {
    const convert = await createConverter({ from: "cn", to: "tw" });
    expect(convert("汉语")).toBe("汉语LOCK");
  });

  it('传 "" 与传 [] 一样绕过自动加载（falsy 判断的回归）', async () => {
    const viaArray = await createConverter({ from: "cn", to: "tw" }, []);
    const viaString = await createConverter({ from: "cn", to: "tw" }, "");
    expect(viaArray("汉语")).toBe("漢語");
    // falsy 判断下这里会是 "汉语LOCK"（"" 触发了自动加载，且上一条已把 memo 填上）
    expect(viaString("汉语")).toBe("漢語");
  });
});
