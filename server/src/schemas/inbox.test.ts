/**
 * Enquiry and visit-request validation — API-P13, API-P18, API-P19, API-A35.
 * No database: this is the boundary on its own.
 */

import { describe, expect, it } from 'vitest';
import {
  enquiryInputSchema,
  INBOX_SORTS,
  inboxListQuerySchema,
  statusUpdateSchema,
  toFieldErrors,
  visitRequestInputSchema,
} from './inbox.js';

const enquiry = {
  name: 'TEST-Parent',
  phone: '0803 123 4567',
  section: 'primary',
  message: 'Do you have places in Basic 2?',
};

/** A date a week from now, `YYYY-MM-DD` in UTC. */
function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

const visit = {
  name: 'TEST-Parent',
  phone: '08031234567',
  section: 'secondary',
  preferredDate: daysFromNow(7),
  preferredTime: '10:30',
};

function fieldsOf(result: { success: boolean; error?: unknown }) {
  if (result.success) throw new Error('expected failure');
  return toFieldErrors(result.error as Parameters<typeof toFieldErrors>[0]);
}

describe('enquiryInputSchema', () => {
  it('accepts a valid enquiry and normalises the phone to digits', () => {
    const parsed = enquiryInputSchema.parse(enquiry);
    expect(parsed.phone).toBe('08031234567');
    expect(parsed.email).toBeUndefined();
  });

  it('treats an empty email as not supplied', () => {
    expect(enquiryInputSchema.parse({ ...enquiry, email: '' }).email).toBeUndefined();
  });

  it('rejects an invalid email', () => {
    expect(fieldsOf(enquiryInputSchema.safeParse({ ...enquiry, email: 'not-an-email' }))).toHaveProperty('email');
  });

  it('strips status and archive fields a visitor tries to set (API-P18)', () => {
    const parsed = enquiryInputSchema.parse({
      ...enquiry,
      status: 'responded',
      archivedAt: '2026-01-01',
    }) as Record<string, unknown>;
    expect(parsed.status).toBeUndefined();
    expect(parsed.archivedAt).toBeUndefined();
  });

  it.each(['name', 'phone', 'section', 'message'])('requires %s', (field) => {
    const input: Record<string, unknown> = { ...enquiry };
    delete input[field];
    expect(fieldsOf(enquiryInputSchema.safeParse(input))).toHaveProperty(field);
  });

  it('rejects a message over 2000 characters', () => {
    expect(fieldsOf(enquiryInputSchema.safeParse({ ...enquiry, message: 'x'.repeat(2001) }))).toHaveProperty('message');
  });
});

describe('visitRequestInputSchema', () => {
  it('accepts a valid request and stores the date as UTC midnight', () => {
    const parsed = visitRequestInputSchema.parse(visit);
    expect(parsed.preferredDate.toISOString()).toBe(`${visit.preferredDate}T00:00:00.000Z`);
  });

  it('rejects a free-text time such as "3pm" (API-P13)', () => {
    expect(fieldsOf(visitRequestInputSchema.safeParse({ ...visit, preferredTime: '3pm' }))).toHaveProperty(
      'preferredTime',
    );
  });

  it.each(['24:00', '9:30', '10:60', '10:30:00'])('rejects the time %s', (preferredTime) => {
    expect(fieldsOf(visitRequestInputSchema.safeParse({ ...visit, preferredTime }))).toHaveProperty('preferredTime');
  });

  it('rejects a date in the past (API-P19)', () => {
    expect(fieldsOf(visitRequestInputSchema.safeParse({ ...visit, preferredDate: daysFromNow(-1) }))).toHaveProperty(
      'preferredDate',
    );
  });

  it('accepts today (UTC)', () => {
    expect(visitRequestInputSchema.safeParse({ ...visit, preferredDate: daysFromNow(0) }).success).toBe(true);
  });

  it('rejects a date that does not exist rather than rolling it over', () => {
    expect(fieldsOf(visitRequestInputSchema.safeParse({ ...visit, preferredDate: '2099-02-30' }))).toHaveProperty(
      'preferredDate',
    );
  });

  it('rejects a full timestamp, which would carry a time zone', () => {
    expect(
      fieldsOf(visitRequestInputSchema.safeParse({ ...visit, preferredDate: `${daysFromNow(7)}T10:00:00Z` })),
    ).toHaveProperty('preferredDate');
  });

  it('allows the message to be left out', () => {
    expect(visitRequestInputSchema.parse(visit).message).toBeUndefined();
  });
});

describe('statusUpdateSchema', () => {
  it.each(['new', 'reviewed', 'responded'])('accepts %s', (status) => {
    expect(statusUpdateSchema.safeParse({ status }).success).toBe(true);
  });

  it('rejects "confirmed" — no such state exists (DATA_MODEL §6)', () => {
    expect(statusUpdateSchema.safeParse({ status: 'confirmed' }).success).toBe(false);
  });

  it('rejects any other field, naming it (API-A35)', () => {
    const fields = fieldsOf(statusUpdateSchema.safeParse({ status: 'reviewed', name: 'Changed' }));
    expect(fields).toHaveProperty('name');
  });
});

describe('inboxListQuerySchema', () => {
  it('defaults to the active inbox, page 1 of 20', () => {
    expect(inboxListQuerySchema(INBOX_SORTS.enquiries).parse({})).toMatchObject({
      archived: false,
      page: 1,
      pageSize: 20,
    });
  });

  it('rejects a sort key that is not whitelisted', () => {
    expect(inboxListQuerySchema(INBOX_SORTS.enquiries).safeParse({ sort: 'preferredDate' }).success).toBe(false);
    expect(inboxListQuerySchema(INBOX_SORTS.visitRequests).safeParse({ sort: '-preferredDate' }).success).toBe(true);
  });

  it('caps the page size at 100', () => {
    expect(inboxListQuerySchema(INBOX_SORTS.enquiries).safeParse({ pageSize: '500' }).success).toBe(false);
  });
});
