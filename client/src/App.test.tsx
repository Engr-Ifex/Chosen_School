import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App', () => {
  it('renders the school name', () => {
    expect(renderToString(<App />)).toContain('Chosen School');
  });

  it('renders the crest with accessible alternative text', () => {
    const html = renderToString(<App />);
    expect(html).toContain('Chosen School crest, navy version');
  });

  it('marks itself as a design-system preview rather than the public site', () => {
    expect(renderToString(<App />)).toContain('Design system preview');
  });

  it('renders the shared button primitive', () => {
    expect(renderToString(<App />)).toContain('Apply for admission');
  });

  it('renders status labels as words, not colour alone', () => {
    const html = renderToString(<App />);
    expect(html).toContain('Reviewed');
    expect(html).toContain('Needs attention');
  });
});
