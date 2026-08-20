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
 * Tags that should not be converted. INPUT is handled separately (below) rather
 * than skipped wholesale, so button-like inputs still get their label converted.
 */
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE"]);

/**
 * INPUT types whose `value` is a display label worth converting. Editable
 * inputs (text/password/search/…) hold user data and are left untouched.
 */
const CONVERTIBLE_INPUT_TYPES = new Set(["button", "submit", "reset"]);

/**
 * Attributes whose value is **text the user reads**, so it must follow the
 * page's conversion. Not to be confused with attributes that hold data.
 *
 * The distinction that matters here is display-vs-data, not element-vs-element:
 * an editable input's `value` is the user's own text and is left alone, but its
 * `placeholder` is UI chrome exactly like an `<img alt>` — leaving it behind
 * means a page converted to Traditional still shows Simplified hint text in
 * every empty field. `aria-label` and `title` are the same thing for screen
 * readers and tooltips; skipping them silently degrades the accessible copy
 * while the visible copy converts.
 */
const TEXT_ATTRIBUTES = ["placeholder", "title", "aria-label"] as const;

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

  /**
   * Original values, keyed by node and then by SLOT.
   *
   * One string per node is not enough: a single `<input>` can carry both a
   * converted `value` and a converted `placeholder`, an `<img>` both `alt` and
   * `title`. With a flat `WeakMap<Node, string>` the second conversion reuses
   * the first one's stored original and `restore()` writes it into the wrong
   * slot. Slot is `"#text"`, `"#value"`, or the attribute name.
   */
  const originalValues = new WeakMap<Node, Map<string, string>>();
  const changedLangNodes = new WeakSet<Element>();

  const TEXT_SLOT = "#text";
  const VALUE_SLOT = "#value";

  /**
   * Convert all text nodes in the DOM
   */
  function convert(): void {
    const fromLangLower = fromLangTag.toLowerCase();

    // Record the pre-conversion value exactly once per (node, slot). Repeated
    // convert() calls then re-convert from the stored original instead of from
    // already-converted text, and restore() always returns the true original.
    function originalOf(node: Node, slot: string, current: string): string {
      let slots = originalValues.get(node);
      if (!slots) {
        slots = new Map();
        originalValues.set(node, slots);
      }
      if (!slots.has(slot)) slots.set(slot, current);
      return slots.get(slot)!;
    }

    function processNode(node: Node, langMatched: boolean): void {
      // Skip elements with ignore-opencc class
      if (node instanceof Element && node.classList.contains(IGNORE_CLASS)) {
        return;
      }

      // Check and update lang attribute
      if (node instanceof Element) {
        // lang matching is case-insensitive per the HTML spec (zh-CN == zh-cn).
        const lang = node.getAttribute("lang");
        if (lang !== null && lang.toLowerCase() === fromLangLower) {
          langMatched = true;
          node.setAttribute("lang", toLangTag);
          changedLangNodes.add(node);
        } else if (lang !== null) {
          // Any explicit, non-matching lang (including lang="") breaks the
          // inherited match from an ancestor.
          langMatched = false;
        }

        // Skip certain tags
        if (SKIP_TAGS.has(node.tagName)) {
          return;
        }

        // Attributes that render as text, on any element. Runs before the
        // INPUT early-return below so an editable field's `placeholder` still
        // converts even though its `value` (user data) must not.
        if (langMatched) {
          for (const attr of TEXT_ATTRIBUTES) {
            const current = node.getAttribute(attr);
            if (current) {
              node.setAttribute(attr, converter(originalOf(node, attr, current)));
            }
          }
        }

        // INPUT is a void element: convert button-like labels, then stop —
        // it has no child text nodes to recurse into.
        if (node.tagName === "INPUT") {
          const input = node as HTMLInputElement;
          if (langMatched && CONVERTIBLE_INPUT_TYPES.has(input.type)) {
            input.value = converter(originalOf(input, VALUE_SLOT, input.value));
          }
          return;
        }

        // Handle special attributes
        if (langMatched) {
          if (node.tagName === "META") {
            const name = node.getAttribute("name");
            if (name === "description" || name === "keywords") {
              const content = node.getAttribute("content");
              if (content) {
                node.setAttribute("content", converter(originalOf(node, "content", content)));
              }
            }
          } else if (node.tagName === "IMG") {
            const alt = node.getAttribute("alt");
            if (alt) {
              node.setAttribute("alt", converter(originalOf(node, "alt", alt)));
            }
          }
        }
      }

      // Process child nodes
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE && langMatched) {
          const text = child.nodeValue;
          if (text) {
            child.nodeValue = converter(originalOf(child, TEXT_SLOT, text));
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

      // Restore every slot we recorded. Keyed by slot rather than dispatched on
      // tagName: one element can have several converted slots (an <input> with
      // both `value` and `placeholder`), and a tagName switch can only put back
      // one of them.
      const slots = originalValues.get(node);
      if (slots) {
        for (const [slot, original] of slots) {
          if (slot === TEXT_SLOT) {
            node.nodeValue = original;
          } else if (node instanceof Element) {
            if (slot === VALUE_SLOT) {
              (node as HTMLInputElement).value = original;
            } else {
              node.setAttribute(slot, original);
            }
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
