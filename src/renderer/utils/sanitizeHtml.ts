/**
 * Sanitizes an HTML string using the browser's built-in DOMParser.
 * Strips all elements and attributes not in the allowlist.
 * Safe for use with dangerouslySetInnerHTML in Electron.
 */

const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'b',
  'i',
  'em',
  'strong',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'code',
  'pre',
  'blockquote',
  'hr',
  'span',
  'div',
  'a',
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'title', 'target', 'rel']),
};

function sanitizeNode(node: Element): void {
  Array.from(node.childNodes).forEach((child) => {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as Element;
      const tag = el.tagName.toLowerCase();

      if (!ALLOWED_TAGS.has(tag)) {
        // Replace disallowed element with its text content
        const text = document.createTextNode(el.textContent || '');
        node.replaceChild(text, el);
        return;
      }

      // Strip disallowed attributes
      Array.from(el.attributes).forEach((attr) => {
        const allowed = ALLOWED_ATTRS[tag];
        if (!allowed || !allowed.has(attr.name)) {
          el.removeAttribute(attr.name);
        }
      });

      // Force external links to be safe
      if (tag === 'a') {
        el.setAttribute('rel', 'noopener noreferrer');
        const href = el.getAttribute('href') || '';
        if (!href.startsWith('https://') && !href.startsWith('http://')) {
          el.removeAttribute('href');
        }
      }

      sanitizeNode(el);
    }
  });
}

export function sanitizeHtml(dirty: string): string {
  if (!dirty) return '';
  const doc = new DOMParser().parseFromString(dirty, 'text/html');
  sanitizeNode(doc.body);
  return doc.body.innerHTML;
}
