/**
 * t2cn bundle - Traditional Chinese to Simplified Chinese only
 * Smaller bundle size for one-way conversion
 */
import { Trie, ConverterFactory, CustomConverter, DictLike } from "../core.js";
import { HTMLConverter, HTMLConverterOptions } from "../html-converter.js";
type DictGroup = DictLike[];
type SourceLocale = "t" | "tw" | "twp" | "hk" | "jp";
interface ConverterOptions {
    from: SourceLocale;
    to?: "cn";
}
/**
 * Create a converter from Traditional variants to Simplified Chinese
 */
declare function Converter(options: ConverterOptions): (input: string) => string;
export { Converter, CustomConverter, ConverterFactory, HTMLConverter, Trie };
export type { ConverterOptions, HTMLConverterOptions, DictLike, DictGroup };
//# sourceMappingURL=t2cn.d.ts.map