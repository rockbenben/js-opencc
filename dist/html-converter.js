/**
 * OpenCC JS - HTML Converter
 * Convert Chinese text in DOM elements
 */
/**
 * Tags that should not be converted
 */
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "CODE", "PRE"]);
/**
 * Class name to ignore conversion
 */
const IGNORE_CLASS = "ignore-opencc";
/**
 * Create an HTML converter for DOM elements
 * @param options - Converter options
 * @returns Object with convert and restore methods
 */
export function HTMLConverter(options) {
    const { converter, rootNode, fromLangTag, toLangTag } = options;
    // Store original values for restoration
    const originalValues = new WeakMap();
    const changedLangNodes = new WeakSet();
    /**
     * Convert all text nodes in the DOM
     */
    function convert() {
        function processNode(node, langMatched) {
            // Skip elements with ignore-opencc class
            if (node instanceof Element && node.classList.contains(IGNORE_CLASS)) {
                return;
            }
            // Check and update lang attribute
            if (node instanceof Element) {
                const lang = node.getAttribute("lang");
                if (lang === fromLangTag) {
                    langMatched = true;
                    node.setAttribute("lang", toLangTag);
                    changedLangNodes.add(node);
                }
                else if (lang && lang.length > 0) {
                    langMatched = false;
                }
                // Skip certain tags
                if (SKIP_TAGS.has(node.tagName)) {
                    return;
                }
                // Handle special attributes
                if (langMatched) {
                    if (node.tagName === "META") {
                        const name = node.getAttribute("name");
                        if (name === "description" || name === "keywords") {
                            const content = node.getAttribute("content");
                            if (content) {
                                originalValues.set(node, content);
                                node.setAttribute("content", converter(content));
                            }
                        }
                    }
                    else if (node.tagName === "IMG") {
                        const alt = node.getAttribute("alt");
                        if (alt) {
                            originalValues.set(node, alt);
                            node.setAttribute("alt", converter(alt));
                        }
                    }
                    else if (node.tagName === "INPUT" && node.type === "button") {
                        const input = node;
                        originalValues.set(node, input.value);
                        input.value = converter(input.value);
                    }
                }
            }
            // Process child nodes
            for (const child of Array.from(node.childNodes)) {
                if (child.nodeType === Node.TEXT_NODE && langMatched) {
                    const text = child.nodeValue;
                    if (text) {
                        originalValues.set(child, text);
                        child.nodeValue = converter(text);
                    }
                }
                else if (child.nodeType === Node.ELEMENT_NODE) {
                    processNode(child, langMatched);
                }
            }
        }
        processNode(rootNode, false);
    }
    /**
     * Restore all text nodes to original values
     */
    function restore() {
        function processNode(node) {
            if (node instanceof Element && node.classList.contains(IGNORE_CLASS)) {
                return;
            }
            // Restore lang attribute
            if (node instanceof Element && changedLangNodes.has(node)) {
                node.setAttribute("lang", fromLangTag);
            }
            // Restore text content
            const originalValue = originalValues.get(node);
            if (originalValue !== undefined) {
                if (node.nodeType === Node.TEXT_NODE) {
                    node.nodeValue = originalValue;
                }
                else if (node instanceof Element) {
                    if (node.tagName === "META") {
                        node.setAttribute("content", originalValue);
                    }
                    else if (node.tagName === "IMG") {
                        node.setAttribute("alt", originalValue);
                    }
                    else if (node.tagName === "INPUT") {
                        node.value = originalValue;
                    }
                }
            }
            // Process children
            for (const child of Array.from(node.childNodes)) {
                processNode(child);
            }
        }
        processNode(rootNode);
    }
    return { convert, restore };
}
//# sourceMappingURL=html-converter.js.map