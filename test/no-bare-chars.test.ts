/**
 * 源码与文档里不许有裸 PUA / 控制字符。
 *
 * 这个坑一个会话里踩了四次——每次都是「往文件里写 PUA 转义」时,某一层引号
 * 或模板把转义吃掉,落盘变成裸字符:编辑器里完全不可见,grep 里照常匹配,
 * 只有 cat -A 或逐字节扫描才现形。人已经证明记不住,让测试记。
 *
 * 词典本体(src/dict/)不在扫描范围——它们是数据,且由同步脚本生成。
 * test/fixtures/ 同属数据（同步脚本从上游整份下载），那里改由一条正向断言守着，
 * 见下面「官方用例夹具里的兼容汉字与小篆字符仍在」。
 * 需要在文里表示 PUA 或兼容汉字时写 \uE000 这样的转义(本文件自身也被扫)。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      // fixtures 与 dict 同属「下载/生成的数据」：官方用例夹具由 sync 整份覆盖，
      // 里面出现兼容汉字是上游的内容（小篆归一化那条用例的输入就是 U+F914），
      // 不是我们能改的源码。折叠之责改由下面那条专门断言守着。
      if (name === "node_modules" || name === "dist" || name === "dict" || name === "fixtures") continue;
      yield* walk(p);
    } else if (/\.(ts|mjs|md|json|txt)$/.test(name)) {
      yield p;
    }
  }
}

describe("裸字符扫描", () => {
  it("src/test/scripts/docs 及根目录文档里没有裸 PUA / C0 控制字符 / 兼容汉字", () => {
    const offenders: string[] = [];
    const dirs = ["src", "test", "scripts", "docs"].map((d) => join(ROOT, d));
    const rootDocs = readdirSync(ROOT)
      .filter((f) => /\.(md|json)$/.test(f))
      .map((f) => join(ROOT, f));
    const files = [...dirs.flatMap((d) => [...walk(d)]), ...rootDocs];
    expect(files.length).toBeGreaterThan(20); // 自检:扫不到足够多文件说明遍历坏了(实际约 29 个)
    for (const p of files) {
      const s = readFileSync(p, "utf8");
      for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        // C0 控制字符放行 \t \n \r;PUA 全禁
        // CJK 兼容汉字(U+F900-FAFF)同样禁止写成字面字符:它们和普通汉字
        // **字形完全一样**,一次 NFC 归一化就被悄悄换成普通汉字。core.ts 的
        // 兼容汉字正则就是这么从 [F900,FAFF] 变成 [8C48,FAFF] 的——输出仍然
        // 正确,所以任何输出对拍都发现不了。要表示它们就写 \uF900 这样的转义。
        if (
          (c < 32 && c !== 9 && c !== 10 && c !== 13) ||
          (c >= 0xe000 && c <= 0xf8ff) ||
          (c >= 0xf900 && c <= 0xfaff)
        ) {
          offenders.push(`${p} @${i} U+${c.toString(16).toUpperCase()}`);
          break;
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("官方用例夹具里的兼容汉字与小篆字符仍在（豁免扫描后补的那条断言）", () => {
    // 上面放过了 test/fixtures——那是 sync 从上游整份下载的夹具，内容不由我们定。
    // 但「兼容汉字被一次 NFC 悄悄折叠」对夹具同样成立，而后果不一样严重：夹具里的
    // U+F914 一旦被换成普通汉字，那条归一化用例就永远绿着，却再也不测归一化。
    // 所以扫描豁免的地方，要有一条正向断言顶上去。
    const text = readFileSync(join(ROOT, "test", "fixtures", "opencc-testcases.json"), "utf8");
    expect(text.includes(String.fromCodePoint(0xf914)), "夹具里的 U+F914 不见了——它被折叠过，重跑 sync 可复原").toBe(true);
    const hasSealChar = [...text].some((c) => {
      const cp = c.codePointAt(0) ?? 0;
      return cp >= 0x3d000 && cp <= 0x3fc3f;
    });
    expect(hasSealChar, "夹具里没有小篆字符——上游的 t2seal/seal2t 用例被改写过").toBe(true);
  });
});
