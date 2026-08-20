import resolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";

// Bundle configurations - using pre-compiled JS from dist/
const bundles = [
  // Full bundle (all locales)
  {
    name: "full",
    input: "dist/bundles/full.js",
    globalName: "OpenCC",
  },
  // Simplified -> Traditional
  {
    name: "cn2t",
    input: "dist/bundles/cn2t.js",
    globalName: "OpenCC",
  },
  // Traditional -> Simplified
  {
    name: "t2cn",
    input: "dist/bundles/t2cn.js",
    globalName: "OpenCC",
  },
];

/**
 * 每个 bundle 出未压缩和压缩两份。
 *
 * 未压缩版曾被拿掉过（这些 bundle 97% 是词典字符串，压缩前后只差 3%，
 * 「未压缩更好读」在这里并不成立），但**发布过的文件路径就是契约**——
 * 直接引 `dist/umd/full.js` 的 CDN 用户会 404，而这种坏法只在别人的页面上
 * 现形，我们这边什么都看不到。省几 MB 不值当，留着。
 *
 * `sourcemapExcludeSources` 两份都加：不加的话 map 会把整本词典的源码再内联
 * 一份，单个 map 就 1.2 MB，比它描述的 bundle 还大。去掉内联源码后 mappings
 * 仍在，调 core.ts 那部分逻辑照样对得上行号——这一项不删文件，是纯赚。
 */
export default bundles.flatMap((bundle) => {
  const output = (min) => ({
    file: `dist/umd/${bundle.name}${min ? ".min" : ""}.js`,
    format: "umd",
    name: bundle.globalName,
    sourcemap: true,
    sourcemapExcludeSources: true,
  });
  return [
    { input: bundle.input, output: output(false), plugins: [resolve()] },
    { input: bundle.input, output: output(true), plugins: [resolve(), terser()] },
  ];
});
