/**
 * The body sanitiser — threat T-09, API_SPEC §4.5. No database.
 * Each case is a way stored HTML has historically turned into script.
 */

import { describe, expect, it } from 'vitest';
import { isEmptyBody, sanitizeBody } from './sanitize.js';

describe('sanitizeBody', () => {
  it('keeps the allowed formatting', () => {
    const html = '<h2>Title</h2><p>Some <strong>bold</strong> and <em>italic</em>.</p><ul><li>One</li></ul>';
    expect(sanitizeBody(html)).toBe(html);
  });

  it('drops script and style elements together with their content', () => {
    const out = sanitizeBody('<p>Hi</p><script>alert(1)</script><style>p{}</style>');
    expect(out).toBe('<p>Hi</p>');
  });

  it('strips event-handler attributes', () => {
    expect(sanitizeBody('<p onclick="alert(1)">x</p>')).toBe('<p>x</p>');
    expect(sanitizeBody('<img src=x onerror="alert(1)">')).toBe('');
  });

  it('removes javascript: and data: links, keeping the text', () => {
    expect(sanitizeBody('<a href="javascript:alert(1)">click</a>')).toBe('click');
    expect(sanitizeBody('<a href="data:text/html,<script>alert(1)</script>">x</a>')).toBe('x');
  });

  it('keeps safe links and adds rel=noopener', () => {
    expect(sanitizeBody('<a href="https://example.org/x" target="_blank" class="c">Read</a>')).toBe(
      '<a href="https://example.org/x" rel="noopener noreferrer">Read</a>',
    );
    expect(sanitizeBody('<a href="tel:+2348031234567">Call</a>')).toContain('href="tel:+2348031234567"');
  });

  it('strips, rather than escapes, disallowed tags', () => {
    const out = sanitizeBody('<p>Safe <span style="color:red">text</span> <iframe src="https://evil"></iframe></p>');
    expect(out).toBe('<p>Safe text </p>');
    expect(out).not.toContain('&lt;');
  });

  it('normalises browser editor output', () => {
    expect(sanitizeBody('<div><b>Bold</b> <i>it</i></div>')).toBe('<p><strong>Bold</strong> <em>it</em></p>');
    expect(sanitizeBody('<h1>Big</h1>')).toBe('<h2>Big</h2>');
  });

  it('removes all attributes from non-link tags', () => {
    expect(sanitizeBody('<p class="x" id="y" style="z">t</p>')).toBe('<p>t</p>');
  });
});

describe('isEmptyBody', () => {
  it('treats markup with no text as empty', () => {
    expect(isEmptyBody('<p></p><p><br /></p>')).toBe(true);
    expect(isEmptyBody('<p>&nbsp;</p>')).toBe(true);
  });

  it('treats any visible text as content', () => {
    expect(isEmptyBody('<p>Resumption is on Monday</p>')).toBe(false);
  });
});
