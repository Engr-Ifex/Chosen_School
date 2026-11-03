// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminApplications from './AdminApplications';
import * as adminApi from '../../lib/admin-api';
import * as api from '../../lib/api';

vi.mock('../../lib/admin-api', () => ({
  fetchApplications: vi.fn(),
  fetchApplication: vi.fn(),
  fetchSession: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  fetchPlacementOptions: vi.fn(),
}));

const OPTIONS: api.PlacementOptions = {
  primary: ['PG', 'Basic 1'],
  secondary: ['JSS1'],
  sessions: ['2026/2027'],
  currentSession: '2026/2027',
};

const ITEM: adminApi.ApplicationListItem = {
  id: '507f1f77bcf86cd799439011',
  student: { surname: 'Adeyemi', firstName: 'Chidinma', middleName: null, dateOfBirth: '2015-04-02' },
  placement: { section: 'primary', classApplyingFor: 'Basic 1', academicSession: '2026/2027' },
  guardian: { phone: '08031234567' },
  submittedAt: '2026-11-02T15:00:00.000Z',
  hasPhoto: false,
};

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminApplications />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(api.fetchPlacementOptions).mockResolvedValue(OPTIONS);
  vi.mocked(adminApi.fetchApplications).mockResolvedValue({
    ok: true,
    data: { data: [ITEM], meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 } },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Admin applications list', () => {
  it('renders a submitted application', async () => {
    renderPage();

    // Rendered twice on purpose: a table for wide screens and cards for narrow
    // ones. Only one is visible, but jsdom does not apply CSS, so both exist.
    const names = await screen.findAllByText('Adeyemi Chidinma');
    expect(names.length).toBeGreaterThan(0);
    expect(screen.getAllByText('Basic 1').length).toBeGreaterThan(0);
  });

  it('shows the record count', async () => {
    renderPage();
    expect(await screen.findByText('1 application')).toBeTruthy();
  });

  it('distinguishes "no records yet" from "no results"', async () => {
    vi.mocked(adminApi.fetchApplications).mockResolvedValue({
      ok: true,
      data: { data: [], meta: { page: 1, pageSize: 20, total: 0, totalPages: 1 } },
    });

    renderPage();

    expect(await screen.findByText('No applications yet')).toBeTruthy();
    expect(screen.queryByText('No applications match these filters')).toBeNull();
  });

  it('shows a no-results state when a search returns nothing', async () => {
    renderPage();
    await screen.findAllByText('Adeyemi Chidinma');

    vi.mocked(adminApi.fetchApplications).mockResolvedValue({
      ok: true,
      data: { data: [], meta: { page: 1, pageSize: 20, total: 0, totalPages: 1 } },
    });

    fireEvent.change(screen.getByLabelText(/search/i), { target: { value: 'zzzz' } });

    expect(await screen.findByText('No applications match these filters')).toBeTruthy();
    expect(screen.getByRole('button', { name: /clear filters/i })).toBeTruthy();
  });

  it('shows an error with a retry control', async () => {
    vi.mocked(adminApi.fetchApplications).mockResolvedValue({
      ok: false,
      status: 500,
      message: 'Something went wrong. Please try again.',
    });

    renderPage();

    expect(await screen.findByText('Something went wrong. Please try again.')).toBeTruthy();

    vi.mocked(adminApi.fetchApplications).mockResolvedValue({
      ok: true,
      data: { data: [ITEM], meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 } },
    });

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect((await screen.findAllByText('Adeyemi Chidinma')).length).toBeGreaterThan(0);
  });

  it('sends a page size within the server limit', async () => {
    renderPage();
    await screen.findAllByText('Adeyemi Chidinma');

    const firstCall = vi.mocked(adminApi.fetchApplications).mock.calls[0]?.[0];
    expect(firstCall?.pageSize).toBe(20);
    expect(firstCall?.page).toBe(1);
  });

  it('never renders health information, because the list does not carry it', async () => {
    renderPage();
    await screen.findAllByText('Adeyemi Chidinma');

    // The list item type has no such field; this asserts the UI does not
    // invent one or reach for the detail endpoint.
    expect(screen.queryByText(/health/i)).toBeNull();
  });
});
