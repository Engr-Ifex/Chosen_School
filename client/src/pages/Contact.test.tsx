// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Contact from './Contact';
import { ENQUIRY_SUCCESS_MESSAGE, VISIT_REQUEST_SUCCESS_MESSAGE } from '../lib/messages';
import * as api from '../lib/api';

/**
 * Contact page — E2E-15 at component level (FR-023, FR-024).
 *
 * The API is mocked: what matters here is that success appears only on a
 * confirmed save, that input survives a failure, and that the visit wording
 * never implies a booking.
 */

vi.mock('../lib/api', () => ({
  submitEnquiry: vi.fn(),
  submitVisitRequest: vi.fn(),
}));

const submitEnquiry = vi.mocked(api.submitEnquiry);
const submitVisitRequest = vi.mocked(api.submitVisitRequest);

function renderPage() {
  render(
    <MemoryRouter>
      <Contact />
    </MemoryRouter>,
  );
  return {
    enquiry: screen.getByRole('region', { name: 'Send an enquiry' }),
    visit: screen.getByRole('region', { name: 'Request a school visit' }),
  };
}

function fillContact(form: HTMLElement) {
  const scoped = within(form);
  fireEvent.change(scoped.getByLabelText(/parent or guardian name/i), { target: { value: 'TEST-Parent' } });
  fireEvent.change(scoped.getByLabelText(/phone number/i), { target: { value: '08031234567' } });
  fireEvent.change(scoped.getByLabelText(/section you are interested in/i), { target: { value: 'primary' } });
}

beforeEach(() => {
  submitEnquiry.mockReset();
  submitVisitRequest.mockReset();
});

afterEach(cleanup);

describe('Contact page', () => {
  it('shows two separate forms', () => {
    const { enquiry, visit } = renderPage();
    expect(within(enquiry).getByRole('button', { name: 'Send enquiry' })).toBeTruthy();
    expect(within(visit).getByRole('button', { name: 'Request a visit' })).toBeTruthy();
  });

  it('does not submit, and lists the problems, when required fields are empty', async () => {
    const { enquiry } = renderPage();
    fireEvent.click(within(enquiry).getByRole('button', { name: 'Send enquiry' }));

    expect(await within(enquiry).findByText(/please correct 4 fields/i)).toBeTruthy();
    expect(submitEnquiry).not.toHaveBeenCalled();
  });

  it('confirms an enquiry only after the server saves it, without the optional email', async () => {
    submitEnquiry.mockResolvedValue({ ok: true, id: 'abc' });
    const { enquiry } = renderPage();
    fillContact(enquiry);
    fireEvent.change(within(enquiry).getByLabelText(/your message/i), { target: { value: 'Hello' } });
    fireEvent.click(within(enquiry).getByRole('button', { name: 'Send enquiry' }));

    expect(await within(enquiry).findByText(ENQUIRY_SUCCESS_MESSAGE)).toBeTruthy();
    expect(submitEnquiry).toHaveBeenCalledWith({
      name: 'TEST-Parent',
      phone: '08031234567',
      section: 'primary',
      message: 'Hello',
    });
  });

  it('keeps what was typed and shows the error when saving fails', async () => {
    submitEnquiry.mockResolvedValue({ ok: false, kind: 'failure', message: 'Something went wrong. Please try again.' });
    const { enquiry } = renderPage();
    fillContact(enquiry);
    fireEvent.change(within(enquiry).getByLabelText(/your message/i), { target: { value: 'Hello' } });
    fireEvent.click(within(enquiry).getByRole('button', { name: 'Send enquiry' }));

    expect(await within(enquiry).findByText('Something went wrong. Please try again.')).toBeTruthy();
    expect(within(enquiry).queryByText(ENQUIRY_SUCCESS_MESSAGE)).toBeNull();
    expect((within(enquiry).getByLabelText(/your message/i) as HTMLTextAreaElement).value).toBe('Hello');
  });

  it('shows server field errors against the right form', async () => {
    submitVisitRequest.mockResolvedValue({
      ok: false,
      kind: 'validation',
      message: 'Some details need correcting.',
      fields: { preferredTime: 'Preferred time must be a time such as 14:30' },
    });
    const { visit } = renderPage();
    fillContact(visit);
    fireEvent.change(within(visit).getByLabelText(/preferred date/i), { target: { value: '2099-01-15' } });
    fireEvent.change(within(visit).getByLabelText(/preferred time/i), { target: { value: '10:30' } });
    fireEvent.click(within(visit).getByRole('button', { name: 'Request a visit' }));

    await waitFor(() => expect(within(visit).getAllByText(/preferred time must be a time/i).length).toBeGreaterThan(0));
  });

  it('confirms a visit request as received — not as a booked visit', async () => {
    submitVisitRequest.mockResolvedValue({ ok: true, id: 'xyz' });
    const { visit } = renderPage();
    fillContact(visit);
    fireEvent.change(within(visit).getByLabelText(/preferred date/i), { target: { value: '2099-01-15' } });
    fireEvent.change(within(visit).getByLabelText(/preferred time/i), { target: { value: '10:30' } });
    fireEvent.click(within(visit).getByRole('button', { name: 'Request a visit' }));

    const status = await within(visit).findByRole('status');
    expect(status.textContent).toContain(VISIT_REQUEST_SUCCESS_MESSAGE);
    expect(status.textContent).toMatch(/received/i);
    expect(status.textContent).toMatch(/not yet a confirmed visit/i);
    // No booking language anywhere in the confirmation.
    expect(status.textContent).not.toMatch(/\b(booked|scheduled|see you)\b/i);
  });
});
