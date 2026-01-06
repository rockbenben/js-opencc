/**
 * OpenCC JS - HTML Converter
 * Convert Chinese text in DOM elements
 */
/**
 * Options for HTMLConverter
 */
export interface HTMLConverterOptions {
    /** The converter function to use */
    converter: (text: string) => string;
    /** The root node to start conversion from */
    rootNode: Element | Document;
    /** The original lang attribute value to match (e.g., 'zh-CN') */
    fromLangTag: string;
    /** The new lang attribute value after conversion (e.g., 'zh-TW') */
    toLangTag: string;
}
/**
 * Create an HTML converter for DOM elements
 * @param options - Converter options
 * @returns Object with convert and restore methods
 */
export declare function HTMLConverter(options: HTMLConverterOptions): {
    convert: () => void;
    restore: () => void;
};
//# sourceMappingURL=html-converter.d.ts.map