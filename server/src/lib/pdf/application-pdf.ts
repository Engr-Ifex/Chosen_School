/**
 * PDF rendering for one or more applications — FR-020, ADR-026.
 *
 * **Structured layout, not a browser.** Headless Chromium would need a few
 * hundred megabytes and a separate process, which a 512 MB Render instance
 * cannot spare. `pdfkit` draws the page directly, so the memory cost is one
 * document at a time.
 *
 * **The layout is deliberately a fixed form, not a mirror of the dashboard.**
 * ROADMAP S11 accepts that the two will drift: a printed record should look like
 * a record, not like a screenshot of an admin screen with navigation and buttons.
 *
 * **Health information is a parameter, not a default.** A bulk export is far
 * more likely to be emailed or left on a printer, so ADR-026 keeps it out of
 * anything containing more than one record. Making the caller state which it
 * wants is what stops that decision being lost in a refactor.
 */

import PDFDocument from 'pdfkit';
import type { ApplicationDetailShape } from '../../services/application-edit.js';

const PAGE_MARGIN = 50;
const LABEL_WIDTH = 140;
const SECTION_GAP = 16;

export interface PdfOptions {
  /** Only ever true for a single record (ADR-026). */
  includeHealth: boolean;
  /** Decoded image for this record, if it has one. */
  photo?: Buffer | null;
}

interface Row {
  label: string;
  value: string;
}

interface Section {
  heading: string;
  rows: Row[];
}

const text = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
};

const formatDate = (value: unknown): string => {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

/**
 * The content of one record, separated from how it is drawn.
 *
 * Keeping this pure is what makes the health-information rule testable without
 * parsing a PDF: the test asks whether the block exists, not whether some bytes
 * happen to appear on a page.
 */
export function buildSections(
  record: ApplicationDetailShape,
  options: { includeHealth: boolean },
): Section[] {
  const student = record.student as Record<string, unknown>;
  const guardian = record.guardian as Record<string, unknown>;
  const placement = record.placement as Record<string, unknown>;
  const signature = record.signature as Record<string, unknown>;

  const sections: Section[] = [
    {
      heading: 'Student information',
      rows: [
        { label: 'Surname', value: text(student.surname) },
        { label: 'First name', value: text(student.firstName) },
        { label: 'Middle name', value: text(student.middleName) },
        { label: 'Date of birth', value: formatDate(student.dateOfBirth) },
        { label: 'Gender', value: text(student.gender) },
        { label: 'Religion', value: text(student.religion) },
        { label: 'Ethnicity', value: text(student.ethnicity) },
        { label: 'State of origin', value: text(student.stateOfOrigin) },
        { label: 'Previous school', value: text(student.previousSchool) },
        { label: 'Last class attended', value: text(student.lastClassAttended) },
      ],
    },
    {
      heading: 'Parent or guardian',
      rows: [
        { label: 'Name', value: text(guardian.name) },
        { label: 'Phone', value: text(guardian.phone) },
        { label: 'Email', value: text(guardian.email) },
        { label: 'Home address', value: text(guardian.homeAddress) },
        { label: 'Occupation', value: text(guardian.occupation) },
        { label: 'Office address', value: text(guardian.officeAddress) },
      ],
    },
    {
      heading: 'School placement',
      rows: [
        { label: 'Section', value: text(placement.section) },
        { label: 'Class', value: text(placement.classApplyingFor) },
        { label: 'Academic session', value: text(placement.academicSession) },
        { label: 'Submitted', value: formatDate(record.submittedAt) },
        { label: 'Signed by', value: text(signature.typedName) },
      ],
    },
  ];

  if (options.includeHealth) {
    sections.push({
      heading: 'Health information and special needs',
      rows: [{ label: 'Details', value: text(record.healthInformation) }],
    });
  }

  return sections;
}

/** Draws one record, starting a new page unless it is the first. */
function drawRecord(
  doc: PDFKit.PDFDocument,
  record: ApplicationDetailShape,
  options: PdfOptions,
  index: number,
): void {
  if (index > 0) doc.addPage();

  const width = doc.page.width - PAGE_MARGIN * 2;

  doc.fillColor('#12324a').font('Helvetica-Bold').fontSize(16).text('Chosen School');
  doc.moveDown(0.15);
  doc.fillColor('#5b6b78').font('Helvetica').fontSize(9).text('Admission application record');
  doc.moveDown(0.6);

  const student = record.student as Record<string, unknown>;
  const name = [student.surname, student.firstName, student.middleName]
    .filter((part) => part !== null && part !== undefined && part !== '')
    .join(' ');

  doc.fillColor('#111111').font('Helvetica-Bold').fontSize(13).text(name || 'Application');
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#5b6b78')
    .text(`Submitted ${formatDate(record.submittedAt)}`);
  doc.moveDown(0.5);

  // A rule under the header, drawn rather than typed.
  doc
    .strokeColor('#c9d6e2')
    .lineWidth(1)
    .moveTo(PAGE_MARGIN, doc.y)
    .lineTo(PAGE_MARGIN + width, doc.y)
    .stroke();
  doc.moveDown(0.8);

  // The photograph sits beside the first section when there is one. A missing or
  // unreadable image is skipped rather than drawn as a broken frame.
  if (options.photo) {
    try {
      const imageTop = doc.y;
      doc.image(options.photo, PAGE_MARGIN + width - 110, imageTop, { fit: [110, 110] });
      doc.y = imageTop;
    } catch {
      // Corrupt image: carry on with the text. The record matters more.
    }
  }

  for (const section of buildSections(record, { includeHealth: options.includeHealth })) {
    if (doc.y > doc.page.height - 120) doc.addPage();

    doc.fillColor('#12324a').font('Helvetica-Bold').fontSize(11).text(section.heading);
    doc.moveDown(0.35);

    for (const row of section.rows) {
      const top = doc.y;
      doc.fillColor('#5b6b78').font('Helvetica').fontSize(9).text(row.label, PAGE_MARGIN, top, {
        width: LABEL_WIDTH,
      });
      doc
        .fillColor('#111111')
        .fontSize(10)
        .text(row.value, PAGE_MARGIN + LABEL_WIDTH, top, { width: width - LABEL_WIDTH });
      doc.moveDown(0.2);
    }

    doc.moveDown(SECTION_GAP / 20);
  }

  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#8a99a6')
    .text(
      `Record ${record.id} · generated ${formatDate(new Date())}`,
      PAGE_MARGIN,
      doc.page.height - PAGE_MARGIN - 12,
      { width },
    );
}

/** Renders one or more records into a single PDF. */
export async function renderApplicationsPdf(
  records: Array<{ record: ApplicationDetailShape; photo?: Buffer | null }>,
  options: { includeHealth: boolean },
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: PAGE_MARGIN,
    // Metadata is left empty on purpose: a title or author string here would be
    // embedded in every file the school emails out.
    info: { Title: '', Author: '', Creator: '' },
  });

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  records.forEach((entry, index) => {
    drawRecord(
      doc,
      entry.record,
      { includeHealth: options.includeHealth, photo: entry.photo ?? null },
      index,
    );
  });

  doc.end();

  return finished;
}

/**
 * A filename that is safe in a `Content-Disposition` header.
 *
 * Only `[A-Za-z0-9-]` survives: a surname containing a quote or a newline could
 * otherwise break out of the header, and the header is not the place to discover
 * that.
 */
export function pdfFilename(records: ApplicationDetailShape[]): string {
  if (records.length === 1) {
    const student = records[0]?.student as Record<string, unknown> | undefined;
    const surname = String(student?.surname ?? '')
      .replace(/[^A-Za-z0-9-]/g, '')
      .slice(0, 40);
    const id = records[0]?.id ?? '';
    return surname ? `application-${surname}-${id}.pdf` : `application-${id}.pdf`;
  }

  return `applications-${records.length}.pdf`;
}
