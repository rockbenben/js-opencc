/**
 * cn2t bundle - Simplified Chinese to Traditional Chinese only
 * Smaller bundle size for one-way conversion
 */
import { Trie, ConverterFactory, CustomConverter, DictLike } from "../core.js";
import { HTMLConverter, HTMLConverterOptions } from "../html-converter.js";
type DictGroup = DictLike[];
type TargetLocale = "t" | "tw" | "twp" | "hk" | "jp";
interface ConverterOptions {
    from?: "cn";
    to: TargetLocale;
}
/**
 * Create a converter from Simplified Chinese to Traditional variants
 */
declare function Converter(options: ConverterOptions): (input: string) => string;
export { Converter, CustomConverter, ConverterFactory, HTMLConverter, Trie };
export type { ConverterOptions, HTMLConverterOptions, DictLike, DictGroup };
//# sourceMappingURL=cn2t.d.ts.map