import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App shell', () => {
  it('renders the school name', () => {
    expect(renderToString(<App />)).toContain('Chosen School');
  });

  it('identifies itself as a placeholder rather than real content', () => {
    expect(renderToString(<App />)).toContain('S04');
  });
});
