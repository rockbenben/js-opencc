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

export default bundles.flatMap((bundle) => [
  // UMD bundle (for browsers via CDN)
  {
    input: bundle.input,
    output: {
      file: `dist/umd/${bundle.name}.js`,
      format: "umd",
      name: bundle.globalName,
      sourcemap: true,
    },
    plugins: [resolve()],
  },
  // UMD minified bundle
  {
    input: bundle.input,
    output: {
      file: `dist/umd/${bundle.name}.min.js`,
      format: "umd",
      name: bundle.globalName,
      sourcemap: true,
    },
    plugins: [resolve(), terser()],
  },
]);
