/**
 * 回归：README 的承诺「浏览器 / Deno 无 fs 时静默跳过（自动加载）」。
 *
 * web-tools 恒显式传数组，所以真实浏览器里这条路径从没被走过——它只在
 * 「浏览器端不传第二参数」时才触发。mock node:fs/promises 直接抛错来模拟
 * 无 fs 环境：createConverter() 不传第二参数必须照常工作，而不是把
 * 加载失败冒泡出去。（和 protected-dict-autoload.test.ts 一样单独一个文件：
 * 一个文件只能有一份对同一模块的 mock。）
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("node:fs/promises", () => {
  throw new Error("simulated browser: no fs");
});

import { createConverter } from "../src/converter.js";

describe("createConverter · 无 fs 环境", () => {
  it("正控：本文件里 node:fs/promises 真的不可用（mock 生效的证据）", async () => {
    // 没有这条,mock 悄悄失效时下一条照样绿——fs 还在,自动加载正常走通,
    // 测试就从「验证静默跳过」退化成「验证正常路径」而没人发现。
    // vitest 会把工厂抛错包成自己的提示语,匹配它的包装文案而不是原始消息
    await expect(import("node:fs/promises")).rejects.toThrow(/error when mocking a module/);
  });

  it("不传第二参数时静默跳过自动加载，转换照常", async () => {
    const convert = await createConverter({ from: "cn", to: "tw" });
    expect(convert("软件")).toBe("軟件");
  });
});
