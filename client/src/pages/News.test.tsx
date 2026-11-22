// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import News from './News';
import * as api from '../lib/api';
import { plainText, whatsAppShareUrl } from './admin/announcement-share';

/**
 * News & Events page — FR-026 to FR-028 at component level, plus the FR-029
 * WhatsApp text. The API is mocked: what is public is decided and tested on
 * the server (API-P03, API-P04); this checks how the page presents it.
 */

vi.mock('../lib/api', () => ({ fetchPublicItems: vi.fn() }));
const fetchPublicItems = vi.mocked(api.fetchPublicItems);

const item = (overrides: Partial<api.PublicItem> = {}): api.PublicItem => ({
  id: '1',
  kind: 'announcement',
  title: 'TEST Resumption',
  category: { id: 'c', name: 'Resumption', slug: 'resumption' },
  body: '<p>School resumes on <strong>Monday</strong>.</p>',
  isUrgent: false,
  publishedAt: '2026-11-20T09:00:00.000Z',
  expiresAt: null,
  event: null,
  ...overrides,
});

beforeEach(() => fetchPublicItems.mockReset());
afterEach(cleanup);

describe('News page', () => {
  it('shows announcements with their category and formatted body', async () => {
    fetchPublicItems.mockResolvedValue({ data: [item()], total: 1, totalPages: 1 });
    render(<MemoryRouter><News /></MemoryRouter>);

    expect(await screen.findByText('TEST Resumption')).toBeTruthy();
    expect(screen.getByText('Resumption')).toBeTruthy();
    expect(screen.getByText('Monday').tagName).toBe('STRONG');
    expect(fetchPublicItems).toHaveBeenCalledWith('announcements', 1);
  });

  it('marks urgent items without hiding the rest', async () => {
    fetchPublicItems.mockResolvedValue({ data: [item({ isUrgent: true })], total: 1, totalPages: 1 });
    render(<MemoryRouter><News /></MemoryRouter>);
    expect(await screen.findByText('Urgent')).toBeTruthy();
  });

  it('switches to upcoming events, which show their dates', async () => {
    fetchPublicItems.mockImplementation(async (kind) =>
      kind === 'events'
        ? { data: [item({ id: '2', kind: 'event', title: 'TEST Sports day', event: { startDate: '2026-12-04T00:00:00.000Z', endDate: '2026-12-04T00:00:00.000Z' } })], total: 1, totalPages: 1 }
        : { data: [], total: 0, totalPages: 1 },
    );
    render(<MemoryRouter><News /></MemoryRouter>);

    expect(await screen.findByText(/no announcements at the moment/i)).toBeTruthy();
    const tab = screen.getByRole('tab', { name: 'Upcoming events' });
    fireEvent.click(tab);

    expect(await screen.findByText('TEST Sports day')).toBeTruthy();
    expect(screen.getByText(/4 December 2026/)).toBeTruthy();
    expect(tab.getAttribute('aria-selected')).toBe('true');
  });

  it('explains an empty list rather than looking broken', async () => {
    fetchPublicItems.mockResolvedValue({ data: [], total: 0, totalPages: 1 });
    render(<MemoryRouter><News /></MemoryRouter>);
    expect(await screen.findByText(/no announcements at the moment/i)).toBeTruthy();
  });

  it('offers a retry when the list cannot load', async () => {
    fetchPublicItems.mockResolvedValueOnce(null).mockResolvedValueOnce({ data: [item()], total: 1, totalPages: 1 });
    render(<MemoryRouter><News /></MemoryRouter>);

    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByText('TEST Resumption')).toBeTruthy());
  });
});

describe('WhatsApp share text (FR-029)', () => {
  it('turns the body into plain text with list bullets', () => {
    expect(plainText('<p>One <strong>two</strong></p><ul><li>A</li><li>B</li></ul>')).toBe('One two\n• A\n• B');
  });

  it('prepares a wa.me link the admin sends manually', () => {
    const url = whatsAppShareUrl(
      { title: 'TEST Sports day', body: '<p>Bring water.</p>', event: { startDate: '2026-12-04T00:00:00.000Z', endDate: '2026-12-04T00:00:00.000Z' } },
      'https://chosenschool.vercel.app',
    );
    expect(url.startsWith('https://wa.me/?text=')).toBe(true);
    const text = decodeURIComponent(url.split('text=')[1]!);
    expect(text).toContain('*TEST Sports day*');
    expect(text).toContain('4 December 2026');
    expect(text).toContain('Bring water.');
    expect(text).toContain('https://chosenschool.vercel.app/news');
  });
});
