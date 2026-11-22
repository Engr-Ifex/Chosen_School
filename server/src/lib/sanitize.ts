/**
 * Allowlist HTML sanitiser for announcement (and, from S19, page-content)
 * bodies — API_SPEC §4.5, SECURITY §9, threat T-09.
 *
 * Uses `sanitize-html` rather than hand-written parsing: a sanitiser is only
 * as good as its HTML parser, and getting one subtly wrong is how stored XSS
 * happens. This is the one place the dependency is used.
 *
 * Rules:
 *  - **Allowlist only**: paragraphs, line breaks, two heading levels, bold,
 *    italic, lists, links. Everything else is **stripped, not escaped** (escaped
 *    markup shows as visible garbage in the editor, API_SPEC §4.5).
 *  - Script, style and similar elements are dropped **with their content**.
 *  - No attributes except `href` on links, and only `http`, `https`, `mailto`
 *    and `tel` URLs. `javascript:` and `data:` are removed.
 *  - Browser editor output is normalised: `b` → `strong`, `i` → `em`,
 *    `div` → `p`, `h1` → `h2`, so stored HTML stays small and predictable.
 *  - Links get `rel="noopener noreferrer"` so a linked page cannot reach back
 *    to the site.
 *
 * The site's Content-Security-Policy (`script-src 'self'`) is the second line
 * of defence if this ever lets something through.
 */

import sanitizeHtml from 'sanitize-html';

const SAFE_HREF = /^(https?:\/\/|mailto:|tel:)/i;

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'br', 'h2', 'h3', 'strong', 'em', 'ul', 'ol', 'li', 'a'],
  allowedAttributes: { a: ['href', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesAppliedToAttributes: ['href'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'iframe', 'object', 'template'],
  transformTags: {
    b: 'strong',
    i: 'em',
    div: 'p',
    h1: 'h2',
    h4: 'h3',
    // A link to anything but http(s)/mailto/tel becomes a `span`, which is not
    // allowed and so is unwrapped: the text survives, the link does not.
    a: (_tagName, attribs): sanitizeHtml.Tag =>
      SAFE_HREF.test((attribs.href ?? '').trim())
        ? { tagName: 'a', attribs: { href: attribs.href!.trim(), rel: 'noopener noreferrer' } }
        : { tagName: 'span', attribs: {} },
  },
};

export function sanitizeBody(html: string): string {
  return sanitizeHtml(html, OPTIONS).trim();
}

/** True when the sanitised body has no visible text at all. */
export function isEmptyBody(sanitised: string): boolean {
  return sanitizeHtml(sanitised, { allowedTags: [], allowedAttributes: {} }).replace(/&nbsp;/g, ' ').trim() === '';
}
