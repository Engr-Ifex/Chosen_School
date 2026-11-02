import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button } from './Button';

/**
 * The default `type` is the behaviour worth pinning: a button inside a form
 * defaults to `submit` in HTML, so a "Cancel" that forgot `type="button"` would
 * submit the admission form. One test is cheaper than that bug.
 */
describe('Button', () => {
  it('defaults to type="button" so it cannot submit a form by accident', () => {
    const html = renderToString(<Button>Cancel</Button>);
    expect(html).toContain('type="button"');
  });

  it('honours an explicit submit type', () => {
    const html = renderToString(<Button type="submit">Send</Button>);
    expect(html).toContain('type="submit"');
  });

  it('uses brand blue for the primary variant', () => {
    const html = renderToString(<Button variant="primary">Go</Button>);
    expect(html).toContain('bg-brand');
  });

  it('uses warm gold with navy text for the accent variant', () => {
    // Deep gold behind white text measures 3.65:1 — below AA for normal text.
    // Warm gold with navy measures 4.76:1 and stays inside the approved palette.
    const html = renderToString(<Button variant="accent">Go</Button>);
    expect(html).toContain('bg-accent ');
    expect(html).toContain('text-brand-dark');
    expect(html).not.toContain('text-white');
  });

  it('renders disabled state without removing the control', () => {
    const html = renderToString(<Button disabled>Go</Button>);
    expect(html).toContain('disabled');
  });
});
