// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('./lib/api', () => ({
  fetchPlacementOptions: vi.fn().mockResolvedValue({
    primary: ['Primary 1'],
    secondary: ['JSS 1'],
    sessions: ['2026/2027'],
    currentSession: '2026/2027',
  }),
  submitApplication: vi.fn(),
}));

beforeEach(() => {
  window.history.pushState({}, '', '/');
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('routes', () => {
  it('serves the home page at /', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /primary & secondary/i })).toBeTruthy();
  });

  it('serves the admission form at /admissions', async () => {
    window.history.pushState({}, '', '/admissions');
    render(<App />);

    expect(await screen.findByRole('heading', { name: /apply for admission/i })).toBeTruthy();
  });

  it('serves a not-found page for an unknown route', () => {
    window.history.pushState({}, '', '/no-such-page');
    render(<App />);

    expect(screen.getByRole('heading', { name: /page not found/i })).toBeTruthy();
  });
});
