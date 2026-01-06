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
export function HTMLConverter(options: HTMLConverterOptions) {
  const { converter, rootNode, fromLangTag, toLangTag } = options;

  // Store original values for restoration
  const originalValues = new WeakMap<Node, string>();
  const changedLangNodes = new WeakSet<Element>();

  /**
   * Convert all text nodes in the DOM
   */
  function convert(): void {
    function processNode(node: Node, langMatched: boolean): void {
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
        } else if (lang && lang.length > 0) {
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
          } else if (node.tagName === "IMG") {
            const alt = node.getAttribute("alt");
            if (alt) {
              originalValues.set(node, alt);
              node.setAttribute("alt", converter(alt));
            }
          } else if (node.tagName === "INPUT" && (node as HTMLInputElement).type === "button") {
            const input = node as HTMLInputElement;
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
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          processNode(child, langMatched);
        }
      }
    }

    processNode(rootNode, false);
  }

  /**
   * Restore all text nodes to original values
   */
  function restore(): void {
    function processNode(node: Node): void {
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
        } else if (node instanceof Element) {
          if (node.tagName === "META") {
            node.setAttribute("content", originalValue);
          } else if (node.tagName === "IMG") {
            node.setAttribute("alt", originalValue);
          } else if (node.tagName === "INPUT") {
            (node as HTMLInputElement).value = originalValue;
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
