import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { ApplicationDetailShape } from '../../services/application-edit.js';
import { buildSections, pdfFilename, renderApplicationsPdf } from './application-pdf.js';

/**
 * Pulls the visible text out of a PDF.
 *
 * `pdfkit` writes text as hex strings inside `TJ` arrays, split at kerning
 * points, so the chunks are decoded and concatenated in order. This lets the
 * tests assert what is actually *on the page* rather than trusting the code that
 * produced it — which is the only way the "health information is absent from a
 * bulk export" rule can be proven rather than restated.
 */
function pdfText(buffer: Buffer): string {
  const latin = buffer.toString('latin1');
  let text = '';

  const streams = /stream\r?\n/g;
  let match: RegExpExecArray | null;

  while ((match = streams.exec(latin)) !== null) {
    const start = match.index + match[0].length;
    const end = latin.indexOf('endstream', start);
    if (end < 0) continue;

    let content: string;
    try {
      content = inflateSync(buffer.subarray(start, end)).toString('latin1');
    } catch {
      continue; // not a flate-compressed content stream
    }

    for (const hex of content.matchAll(/<([0-9A-Fa-f]+)>/g)) {
      text += Buffer.from(hex[1] ?? '', 'hex').toString('latin1');
    }
  }

  return text;
}

function record(overrides: Partial<ApplicationDetailShape> = {}): ApplicationDetailShape {
  return {
    id: '507f1f77bcf86cd799439011',
    student: {
      surname: 'Adeyemi',
      firstName: 'Chidinma',
      middleName: null,
      dateOfBirth: '2015-04-02T00:00:00.000Z',
      gender: 'female',
    },
    guardian: {
      name: 'Adeyemi Emeka',
      phone: '08031234567',
      homeAddress: '1 Example Road',
    },
    placement: { section: 'primary', classApplyingFor: 'Basic 1', academicSession: '2026/2027' },
    signature: { typedName: 'Adeyemi Emeka', signedAt: '2026-10-01T09:00:00.000Z' },
    healthInformation: null,
    photo: null,
    revisions: [],
    submittedAt: new Date('2026-10-01T09:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

describe('buildSections', () => {
  it('includes health information when asked', () => {
    const sections = buildSections(record({ healthInformation: 'Asthma' }), {
      includeHealth: true,
    });

    expect(sections.map((section) => section.heading)).toContain(
      'Health information and special needs',
    );
  });

  it('omits the health block when not asked, even if the record has it', () => {
    const sections = buildSections(record({ healthInformation: 'Asthma' }), {
      includeHealth: false,
    });

    expect(sections.map((section) => section.heading)).not.toContain(
      'Health information and special needs',
    );
    // Nothing else in the block structure carries it either.
    expect(JSON.stringify(sections)).not.toContain('Asthma');
  });

  it('shows an em dash rather than an empty cell for a missing value', () => {
    const sections = buildSections(record(), { includeHealth: false });
    const student = sections.find((section) => section.heading === 'Student information');

    expect(student?.rows.find((row) => row.label === 'Middle name')?.value).toBe('—');
  });
});

describe('pdfFilename', () => {
  it('names a single export after the applicant', () => {
    expect(pdfFilename([record()])).toBe('application-Adeyemi-507f1f77bcf86cd799439011.pdf');
  });

  it('counts a bulk export', () => {
    expect(pdfFilename([record(), record(), record()])).toBe('applications-3.pdf');
  });

  it('strips anything that could break out of the header', () => {
    const hostile = record({
      student: { surname: 'Adey"emi\r\nInjected: yes', firstName: 'X' },
    });

    const name = pdfFilename([hostile]);
    expect(name).not.toContain('"');
    expect(name).not.toContain('\r');
    expect(name).not.toContain('\n');
  });
});

describe('renderApplicationsPdf', () => {
  it('produces a valid PDF containing the record', async () => {
    const buffer = await renderApplicationsPdf([{ record: record() }], { includeHealth: true });

    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(500);

    const text = pdfText(buffer);
    expect(text).toContain('Adeyemi');
    expect(text).toContain('Chidinma');
    expect(text).toContain('08031234567');
  });

  it('includes health information in a single export', async () => {
    const buffer = await renderApplicationsPdf(
      [{ record: record({ healthInformation: 'Severe peanut allergy' }) }],
      { includeHealth: true },
    );

    expect(pdfText(buffer)).toContain('Severe peanut allergy');
  });

  it('leaves health information out of a bulk export', async () => {
    const records = [
      { record: record({ healthInformation: 'Severe peanut allergy' }) },
      { record: record({ id: '507f1f77bcf86cd799439012', student: { surname: 'Okonkwo' } }) },
    ];

    const buffer = await renderApplicationsPdf(records, { includeHealth: false });
    const text = pdfText(buffer);

    expect(text).toContain('Adeyemi');
    expect(text).toContain('Okonkwo');
    expect(text).not.toContain('Severe peanut allergy');
  });

  it('renders a record with no photograph without a broken image (S-05)', async () => {
    const buffer = await renderApplicationsPdf([{ record: record(), photo: null }], {
      includeHealth: true,
    });

    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdfText(buffer)).toContain('Adeyemi');
  });

  it('renders a corrupt photograph as a missing one rather than failing', async () => {
    const buffer = await renderApplicationsPdf(
      [{ record: record(), photo: Buffer.from('not an image') }],
      { includeHealth: true },
    );

    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('wraps a very long health note instead of losing it (S-06)', async () => {
    const longNote = 'Requires supervision during sport. '.repeat(60);
    const buffer = await renderApplicationsPdf(
      [{ record: record({ healthInformation: longNote }) }],
      { includeHealth: true },
    );

    const text = pdfText(buffer);
    expect(text).toContain('Requires supervision during sport.');
    // The note is long enough to run past one page, so it must have paginated.
    expect(text.length).toBeGreaterThan(2000);
  });

  it('puts each record on its own page in a bulk export', async () => {
    const records = [1, 2, 3].map((n) => ({
      record: record({
        id: `507f1f77bcf86cd79943901${n}`,
        student: { surname: `Applicant${n}` },
      }),
    }));

    const buffer = await renderApplicationsPdf(records, { includeHealth: false });
    const pageCount = (buffer.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;

    expect(pageCount).toBe(3);
  });
});
