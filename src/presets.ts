/**
 * OpenCC JS - Preset Configurations
 * Defines dictionary mappings for different Chinese variants
 */

/**
 * Supported locale codes
 * - cn: Simplified Chinese (Mainland China)
 * - tw: Traditional Chinese (Taiwan)
 * - twp: Traditional Chinese (Taiwan) with phrase conversion
 * - hk: Traditional Chinese (Hong Kong)
 * - hkp: Traditional Chinese (Hong Kong) with phrase conversion
 * - jp: Japanese Shinjitai
 * - seal: 小篆（Unicode 18.0 篆書區塊 U+3D000..U+3FC3F）。上游标为实验性：输出需要
 *   支持该区块的字型，否则是豆腐
 * - t: OpenCC standard Traditional Chinese
 */
export type LocaleCode = "cn" | "tw" | "twp" | "hk" | "hkp" | "jp" | "seal" | "t";

/**
 * Conversion steps from a variant to OpenCC standard.
 *
 * 值 = **步骤列表**，按 OpenCC `conversion_chain` 的顺序依次执行；每一步是一个字典名单，
 * 整个名单合进一个 trie。名单**内部**的顺序是 OpenCC 顺序的反面：上游首匹配即停，我们的
 * trie 后写覆盖，所以优先级最高的（词组字典）要排在**最后**。步骤之间不反转——步骤就是
 * 上游那一串 `dict`，一步对应一个 `conversion_chain` 元素。
 *
 * 步内可以合并、跨步不许合并：`group / union` 就是一个 trie，而先后两个步骤是两次 passes。
 * 小篆两侧各两步（`年 →(SealVariants) 秊 →(SealCharactersRev) 小篆`），并进一个 trie 只走
 * 一遍，第二次的输入根本不是 `秊`。链对账在 `scripts/sync-opencc.ts` 里按步比 upstream
 * 的 `conversion_chain`，拍平它会当场红。
 *
 * Each array is ONE conversion step, merged into a single trie. Chains mirror
 * `tw2t` / `hk2t` / `tw2sp` / `hk2sp` in OpenCC's data/config.
 */
export const variants2standard: Record<string, string[][]> = {
  // The generated dict sits between: upstream's group is
  // [STPhrases ∪ Generated] short-circuit STCharacters, so in last-write-wins
  // order STPhrases stays highest. Its value is the point — 出租车 must become
  // 出租車 as a pinned unit (char-wise conversion could pick wrong variants for
  // ambiguous characters), and segmentation needs it as a boundary entry.
  cn: [["STCharacters", "STPhrases_GeneratedFromRegionalPhrases", "STPhrases"]],
  hk: [["HKVariantsRev", "HKVariantsRevPhrases"]],
  hkp: [["HKVariantsRev", "HKVariantsRevPhrases", "HKPhrasesRev"]],
  tw: [["TWVariantsRev", "TWVariantsRevPhrases"]],
  twp: [["TWVariantsRev", "TWVariantsRevPhrases", "TWPhrasesRev"]],
  jp: [["JPShinjitaiCharacters", "JPShinjitaiPhrases"]],
  // seal2t.json 的两步，顺序照上游：先 小篆 → 现代汉字，再还原《說文》隶定字形。
  seal: [["SealCharacters"], ["SealVariantsRev"]],
};

/**
 * Conversion steps from OpenCC standard to a variant. Same ordering rules as
 * {@link variants2standard}; chains mirror `t2tw` / `t2hk` / `s2twp` / `s2hkp`.
 *
 * The `*VariantsPhrases` dicts are what keep proper nouns from being
 * over-converted (張棟樑 must not become 張棟梁, 純喫茶 not 純吃茶) — dropping
 * them silently diverges from OpenCC on hundreds of entries.
 */
export const standard2variants: Record<string, string[][]> = {
  cn: [["TSCharacters", "TSPhrases"]],
  hk: [["HKVariants", "HKVariantsPhrases"]],
  hkp: [["HKVariants", "HKVariantsPhrases", "HKPhrases"]],
  tw: [["TWVariants", "TWVariantsPhrases"]],
  twp: [["TWVariants", "TWVariantsPhrases", "TWPhrases"]],
  jp: [["JPShinjitaiCharactersRev"]],
  // t2seal.json 的两步：现代标准字 →《說文》隸定字，然后 汉字 → 小篆。
  // 顺序不能并，理由见 {@link variants2standard} 的「跨步不许合并」。
  seal: [["SealVariants"], ["SealCharactersRev"]],
};

/**
 * All dictionary file names
 */
export const allDictFiles = [...new Set([...Object.values(variants2standard).flat(2), ...Object.values(standard2variants).flat(2)])];

/** Traditional variants that carry their own regional vocabulary tables. */
const REGIONAL_VARIANTS: ReadonlySet<string> = new Set(["tw", "twp", "hk", "hkp"]);

/**
 * Which dictionary to cut the input on before running the conversion chain,
 * or `[]` for "don't segment".
 *
 * Segmentation only earns its cost when the chain has a **second** step that
 * could match across boundaries the first step set — see
 * `ConverterFactoryWithSegmentation`. OpenCC therefore declares a
 * `segmentation` on exactly eight configs (`s2tw`, `s2twp`, `s2hk`, `s2hkp`,
 * `tw2s`, `tw2sp`, `hk2s`, `hk2sp`) and on none of the single-step ones
 * (`s2t`, `t2tw`, `tw2t`, `t2s`, `t2hk`, `hk2t`, `jp2t`, `t2jp`). This
 * function reproduces that set rather than inventing a broader rule:
 *
 * - **cn → tw/twp/hk/hkp** cuts on `STPhrases`.
 * - **tw/twp/hk/hkp → cn** cuts on `TSPhrases`.
 * - everything else, including anything touching `t` or `jp`, does not cut.
 *
 * The direction of the dictionary is the part worth remembering: it is the
 * **raw input** being cut, so the keys must be in the input's script.
 * `s2*` cuts on the simplified-keyed `STPhrases`; `*2s` cuts on the
 * traditional-keyed `TSPhrases` — which lives in the chain's *second* step,
 * not its first. Picking "the first step's phrase dict" looks tidier and is
 * wrong for `tw2s`.
 *
 * `jp` is excluded deliberately: Shinjitai conversion has no phrase table
 * keyed in the source script, and OpenCC declares no segmentation for it.
 *
 * `seal` likewise gets no cut, and for a reason worth keeping straight: its
 * extra steps map single characters only, so no phrase dictionary is around to
 * bite across a boundary — a multi-step chain is not by itself a reason to
 * segment. `scripts/sync-opencc.ts` re-checks that no config we skip here ever
 * grows a `segmentation` upstream.
 *
 * ## The second segmentation dict: `STPhrases_GeneratedFromRegionalPhrases`
 *
 * OpenCC's `s2*` configs segment on **two** dictionaries — `STPhrases` plus a
 * generated one that maps each regional term's simplified projection to its
 * plain traditional form (`出租车 出租車`), keeping the term whole through
 * segmentation so the regional table can replace it as a unit. Without it
 * `出租车司机` under-applies to `出租車司機` where OpenCC gives `計程車司機`.
 *
 * We once thought its filter was unrecoverable (a naive derivation yielded 276
 * extra entries) and documented it as a known gap. The actual rule was found
 * by reading OpenCC's `generate_st_phrases_from_regional_phrases.py`: project
 * the keys of HKPhrases + TWPhrases through t2s and **drop projections shorter
 * than 3 code points** — short keys would split longer Simplified words before
 * STPhrases could match them. That one filter reproduces all 508 upstream
 * entries exactly. The sync script now generates the dict; see
 * `generateRegionalStPhrases` comments there for the full recipe.
 */
export function segmentationDictsFor(from: LocaleCode, to: LocaleCode): string[] {
  if (from === "cn" && REGIONAL_VARIANTS.has(to)) return ["STPhrases", "STPhrases_GeneratedFromRegionalPhrases"];
  if (to === "cn" && REGIONAL_VARIANTS.has(from)) return ["TSPhrases"];
  return [];
}

/**
 * How the custom CNTWPhrases dict should be applied to a conversion:
 * `"forward"` as shipped (cn keys → tw values), `"reverse"` swapped, or `null`
 * to leave it out entirely.
 */
export type PhraseDictDirection = "forward" | "reverse" | null;

/** Locales that carry Taiwan vocabulary. `t`/`hk`/`jp` are traditional but not Taiwanese. */
const isTwVocab = (locale: LocaleCode): boolean => locale === "tw" || locale === "twp";

/**
 * Decide whether — and in which direction — CNTWPhrases applies. This is the
 * single home for the rule: the main entry, both one-way bundles and the full
 * bundle all call it. Do not inline a copy at a call site — four copies is how
 * the four entry points came to disagree with each other.
 *
 * - Crossing INTO Taiwan vocabulary from outside it → `"forward"`.
 * - Leaving Taiwan vocabulary for `cn` → `"reverse"`.
 * - Everything else → `null`.
 *
 * Two asymmetries worth keeping straight, both deliberate:
 *
 * 1. A `tw`/`twp` SOURCE never gets the forward dict, even aimed at `twp`. Its
 *    keys are simplified, so against traditional input the only ones that can
 *    match are the script-invariant terms (土豆, 芝士, 高考, 雪糕, 薯片) — exactly
 *    the entries whose meaning differs in Taiwan (土豆 is peanut there, not
 *    馬鈴薯). A `t`/`hk`/`jp` source aimed at `twp` DOES get it, and should:
 *    芝士→起司 and 雪糕→冰淇淋 are the intended HK→TW conversions.
 * 2. `"reverse"` is confined to `to === "cn"`, not to any non-Taiwan target,
 *    because the reversed values are simplified (計程車 → 出租车) and would put
 *    simplified characters into a traditional target.
 *
 * @param loadCustomPhrases - Defaults to on when either end is `twp`. An
 *   explicit `true` enables the rule but does not override it: directions that
 *   score `null` (e.g. `cn → hk`) still get no dict.
 */
export function phraseDictDirection(from: LocaleCode, to: LocaleCode, loadCustomPhrases?: boolean): PhraseDictDirection {
  if (!(loadCustomPhrases ?? (from === "twp" || to === "twp"))) return null;
  if (!isTwVocab(from) && isTwVocab(to)) return "forward";
  if (isTwVocab(from) && to === "cn") return "reverse";
  return null;
}
