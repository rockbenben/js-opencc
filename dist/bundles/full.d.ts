/**
 * Full bundle - includes all locales and converters
 */
import { Trie, ConverterFactory, CustomConverter, DictLike } from "../core.js";
import { HTMLConverter, HTMLConverterOptions } from "../html-converter.js";
import { LocaleCode } from "../presets.js";
type DictGroup = DictLike[];
interface ConverterOptions {
    from: LocaleCode;
    to: LocaleCode;
}
/**
 * Create a converter with the specified locales
 */
declare function Converter(options: ConverterOptions): (input: string) => string;
declare const Locale: {
    from: {
        [k: string]: string[];
    };
    to: {
        [k: string]: string[];
    };
};
export { Converter, CustomConverter, ConverterFactory, HTMLConverter, Locale, Trie };
export type { ConverterOptions, HTMLConverterOptions, LocaleCode, DictLike, DictGroup };
//# sourceMappingURL=full.d.ts.map