// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Admissions from './Admissions';
import { SUBMISSION_SUCCESS_MESSAGE } from '../lib/messages';
import * as api from '../lib/api';

/**
 * Behaviour of the admission form — E2E-02 and E2E-03 at component level.
 *
 * The API module is mocked because the point here is the form's reaction to
 * each outcome, not the network. The real request is covered by the server's
 * API tests and by the manual run recorded in the roadmap.
 */

vi.mock('../lib/api', () => ({
  fetchPlacementOptions: vi.fn(),
  submitApplication: vi.fn(),
}));

const OPTIONS: api.PlacementOptions = {
  primary: ['PG', 'KG1', 'Basic 1'],
  secondary: ['JSS1', 'SS3'],
  sessions: ['2026/2027'],
  currentSession: '2026/2027',
};

function renderPage() {
  return render(
    <MemoryRouter>
      <Admissions />
    </MemoryRouter>,
  );
}

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText(/surname \(required\)/i), {
    target: { value: 'Nwosu' },
  });
  fireEvent.change(screen.getByLabelText(/first name \(required\)/i), {
    target: { value: 'Amara' },
  });
  fireEvent.change(screen.getByLabelText(/date of birth \(required\)/i), {
    target: { value: '2016-03-11' },
  });
  fireEvent.change(screen.getByLabelText(/gender \(required\)/i), { target: { value: 'female' } });
  // Anchored: "full name (required)" also matches the signature field's
  // "Type your full name (required)".
  fireEvent.change(screen.getByLabelText(/^full name \(required\)/i), {
    target: { value: 'Nwosu Peter' },
  });
  fireEvent.change(screen.getByLabelText(/home address \(required\)/i), {
    target: { value: '12 Test Close' },
  });
  fireEvent.change(screen.getByLabelText(/phone number \(required\)/i), {
    target: { value: '08035551234' },
  });
  fireEvent.click(screen.getByLabelText('Primary'));
  fireEvent.change(screen.getByLabelText(/class applying for \(required\)/i), {
    target: { value: 'Basic 1' },
  });
  fireEvent.change(screen.getByLabelText(/type your full name \(required\)/i), {
    target: { value: 'Nwosu Peter' },
  });
}

beforeEach(() => {
  vi.mocked(api.fetchPlacementOptions).mockResolvedValue(OPTIONS);
  vi.mocked(api.submitApplication).mockReset();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Admissions form', () => {
  it('shows the exact success message only after a confirmed 201 (E2E-02)', async () => {
    vi.mocked(api.submitApplication).mockResolvedValue({
      ok: true,
      id: 'abc123',
      submittedAt: '2026-11-02T15:00:00.000Z',
    });

    renderPage();
    await screen.findByLabelText(/surname \(required\)/i);

    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: /submit application/i }));

    await waitFor(() => {
      expect(screen.getByText(SUBMISSION_SUCCESS_MESSAGE)).toBeTruthy();
    });
    expect(screen.getByText(/return to homepage/i)).toBeTruthy();
  });

  it('does not claim success when the server rejects the submission (E2E-03)', async () => {
    vi.mocked(api.submitApplication).mockResolvedValue({
      ok: false,
      kind: 'validation',
      message: 'Some details need correcting.',
      fields: { 'placement.classApplyingFor': 'is not a class offered in the secondary section' },
    });

    renderPage();
    await screen.findByLabelText(/surname \(required\)/i);

    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: /submit application/i }));

    await waitFor(() => {
      // Shown twice on purpose: once in the error summary, once under the
      // field it belongs to. Both matter — the summary is what a screen-reader
      // user hears first, the inline message is what they see at the input.
      expect(screen.getAllByText(/is not a class offered in the secondary section/i)).toHaveLength(
        2,
      );
    });
    expect(screen.queryByText(SUBMISSION_SUCCESS_MESSAGE)).toBeNull();
  });

  it('keeps everything the parent typed when the submission fails (E2E-03)', async () => {
    vi.mocked(api.submitApplication).mockResolvedValue({
      ok: false,
      kind: 'failure',
      message: 'Something went wrong. Please try again.',
    });

    renderPage();
    await screen.findByLabelText(/surname \(required\)/i);

    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: /submit application/i }));

    await waitFor(() => {
      expect(screen.getByText(/something went wrong/i)).toBeTruthy();
    });

    // The data is still there — losing it is the failure that actually hurts.
    expect((screen.getByLabelText(/surname \(required\)/i) as HTMLInputElement).value).toBe('Nwosu');
    expect((screen.getByLabelText(/phone number \(required\)/i) as HTMLInputElement).value).toBe(
      '08035551234',
    );
    expect((screen.getByLabelText(/home address \(required\)/i) as HTMLTextAreaElement).value).toBe(
      '12 Test Close',
    );
  });

  it('drives the class list from the chosen section', async () => {
    renderPage();
    await screen.findByLabelText(/surname \(required\)/i);

    // Nothing selectable before a section is chosen.
    const classSelect = screen.getByLabelText(/class applying for \(required\)/i) as HTMLSelectElement;
    expect(classSelect.disabled).toBe(true);

    fireEvent.click(screen.getByLabelText('Primary'));
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Basic 1' })).toBeTruthy();
    });
    expect(screen.queryByRole('option', { name: 'JSS1' })).toBeNull();

    // Switching section clears the class chosen from the other list.
    fireEvent.change(classSelect, { target: { value: 'Basic 1' } });
    fireEvent.click(screen.getByLabelText('Secondary'));

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'JSS1' })).toBeTruthy();
    });
    expect((screen.getByLabelText(/class applying for \(required\)/i) as HTMLSelectElement).value).toBe(
      '',
    );
  });

  it('blocks submission and reports empty required fields without calling the API', async () => {
    renderPage();
    await screen.findByLabelText(/surname \(required\)/i);

    fireEvent.click(screen.getByRole('button', { name: /submit application/i }));

    await waitFor(() => {
      expect(screen.getByText(/please correct/i)).toBeTruthy();
    });
    expect(api.submitApplication).not.toHaveBeenCalled();
  });

  it('disables the submit button while the request is in flight', async () => {
    let resolveSubmit: (value: api.SubmitResult) => void = () => {};
    vi.mocked(api.submitApplication).mockImplementation(
      () =>
        new Promise<api.SubmitResult>((resolve) => {
          resolveSubmit = resolve;
        }),
    );

    renderPage();
    await screen.findByLabelText(/surname \(required\)/i);

    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: /submit application/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /submitting/i })).toBeTruthy();
    });
    expect((screen.getByRole('button', { name: /submitting/i }) as HTMLButtonElement).disabled).toBe(
      true,
    );

    resolveSubmit({ ok: true, id: 'x', submittedAt: '2026-11-02T15:00:00.000Z' });
    await waitFor(() => {
      expect(screen.getByText(SUBMISSION_SUCCESS_MESSAGE)).toBeTruthy();
    });
  });
  it('does not ask the parent for an academic session', async () => {
    renderPage();
    await screen.findByLabelText(/surname \(required\)/i);

    expect(screen.queryByLabelText(/academic session/i)).toBeNull();
    expect(screen.queryByText(/academic session/i)).toBeNull();
  });

  it('offers a retry when the class list genuinely fails to load', async () => {
    vi.mocked(api.fetchPlacementOptions).mockResolvedValueOnce(null);

    renderPage();
    await screen.findByText(/we could not load the list of classes/i);

    vi.mocked(api.fetchPlacementOptions).mockResolvedValue(OPTIONS);
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() => {
      expect(screen.queryByText(/we could not load the list of classes/i)).toBeNull();
    });
  });
});
