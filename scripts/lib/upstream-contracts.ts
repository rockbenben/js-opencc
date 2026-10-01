/**
 * 我们与上游 OpenCC 的**契约名单**：哪些字典收、哪些 config 的链比对、哪些 config
 * 声明了切段。
 *
 * 放在单独文件里有两个理由：一是 `scripts/sync-opencc.ts` 被导入就会跑 `main()`
 * （联网 + 写盘），测试拿它的常量只能靠日志看；二是这些名单本身就是判据——上游多一个
 * config 而名单没跟上，是「我们静默少查一处」，那正是本仓反复踩的坑，所以它得能被
 * 离线测试钉住（见 test/upstream-contracts.test.ts），而不是只有跑同步时才生效。
 */
import type { LocaleCode } from "../../src/presets.js";

/**
 * Which OpenCC config each preset entry mirrors, so a drifting conversion chain
 * fails the sync instead of silently diverging.
 *
 * `step` is the index where THIS side's step list starts in the config's
 * `conversion_chain`; the side may span several entries (the seal chains are two
 * steps each) and every one is compared in order. Single-step configs (t2tw) use
 * 0; two-step ones (s2twp = cn→standard, then standard→twp) use 1 for the half
 * this preset owns. Missing here on purpose: the cn side (`STCharacters` /
 * `TSCharacters` groups), because OpenCC's s2t/t2s chains include dicts it
 * generates at build time (see UNAVAILABLE_UPSTREAM_DICTS in the sync script)
 * which we cannot mirror from data/dictionary at all.
 */
export const CONFIG_CHAINS: Array<{ config: string; side: "from" | "to"; locale: string; step: number }> = [
  { config: "s2t", side: "from", locale: "cn", step: 0 },
  { config: "t2tw", side: "to", locale: "tw", step: 0 },
  { config: "t2hk", side: "to", locale: "hk", step: 0 },
  { config: "s2twp", side: "to", locale: "twp", step: 1 },
  { config: "s2hkp", side: "to", locale: "hkp", step: 1 },
  { config: "t2jp", side: "to", locale: "jp", step: 0 },
  { config: "tw2t", side: "from", locale: "tw", step: 0 },
  { config: "hk2t", side: "from", locale: "hk", step: 0 },
  { config: "tw2sp", side: "from", locale: "twp", step: 0 },
  { config: "hk2sp", side: "from", locale: "hkp", step: 0 },
  { config: "jp2t", side: "from", locale: "jp", step: 0 },
  // 小篆两侧各占两步，所以 s2seal 的 to 侧从 1 开始、比两步。
  { config: "t2seal", side: "to", locale: "seal", step: 0 },
  { config: "seal2t", side: "from", locale: "seal", step: 0 },
  { config: "s2seal", side: "to", locale: "seal", step: 1 },
];

/**
 * 官方用例覆盖到、但**不做链比对**的 config，以及为什么。
 *
 * 这张名单是链对账的「余数」：`CONFIG_CHAINS` 的 config 集合并上这里的键，必须正好等于
 * 上游用例覆盖的 config 全集——两边都由 test/upstream-contracts.test.ts 钉住，所以它既
 * 不能漏（上游加了新 config 而我们谁都没查会红），也不能虚设（名单里的键在用例里不存在
 * 会红，避免哪天上游撤了某个 config 后这里变成永远绿的空话）。
 */
export const NOT_CHAIN_CHECKED: Record<string, string> = {
  // to 侧的「标准字 → 地区变体」那一步与 t2tw / t2hk 完全同一个字典组，已经比过了；
  // 剩下的 cn 侧属于下面那一类，镜像不了。
  s2tw: "to 侧即 t2tw 的同一个字典组（已比对）；cn 侧含构建期 TSCharactersExt",
  s2hk: "to 侧即 t2hk 的同一个字典组（已比对）；cn 侧含构建期 TSCharactersExt",
  // 纯 cn 方向的链只有 cn 侧，而它引用的 TSCharactersExt 是上游构建期从 tofu-risk
  // 数据生成的，data/dictionary 里没有对应 .txt，无从比对。
  t2s: "cn 侧链含构建期生成的 TSCharactersExt，data/dictionary 里查不到",
  tw2s: "from 侧即 tw2t 的同一个字典组（已比对）；cn 侧含构建期 TSCharactersExt",
  hk2s: "from 侧即 hk2t 的同一个字典组（已比对）；cn 侧含构建期 TSCharactersExt",
};

/**
 * Which OpenCC configs declare a `segmentation`, and what our
 * `segmentationDictsFor` must return for the equivalent locale pair.
 *
 * The conversion-chain check above cannot see this field, so without a
 * separate comparison an upstream change to WHICH dictionary a config cuts on
 * would land silently — and cutting on the wrong-script dictionary produces
 * subtly wrong regional vocabulary, the failure mode that is invisible in
 * word-list tests.
 */
export const CONFIG_SEGMENTATION: Array<{ config: string; from: LocaleCode; to: LocaleCode }> = [
  { config: "s2tw", from: "cn", to: "tw" },
  { config: "s2twp", from: "cn", to: "twp" },
  { config: "s2hk", from: "cn", to: "hk" },
  { config: "s2hkp", from: "cn", to: "hkp" },
  { config: "tw2s", from: "tw", to: "cn" },
  { config: "tw2sp", from: "twp", to: "cn" },
  { config: "hk2s", from: "hk", to: "cn" },
  { config: "hk2sp", from: "hkp", to: "cn" },
];

/**
 * Configs that must NOT declare a segmentation — a new one appearing is drift too.
 *
 * 小篆那三个是多步链却不切段，值得记住为什么：它的后续步骤只映射单字（`SealVariants`
 * 与 `SealCharactersRev` 的键都恰好一个码位），没有会在跨词边界上乱咬的词组表，少一刀
 * 不多、多一刀不少。所以「链有第二步就该切段」这条经验不能反过来用——上面那个理由讲的
 * 是切段何时**必要**，不是它何时**够用**。
 */
export const CONFIG_NO_SEGMENTATION: string[] = ["s2t", "t2s", "t2tw", "tw2t", "t2hk", "hk2t", "t2jp", "jp2t", "t2seal", "seal2t", "s2seal"];
