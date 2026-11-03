/**
 * Administrator edit with revision history — API_SPEC §4.2, FR-019.
 *
 * **A revision is written only when something actually changed.** History that
 * records no-op saves is noise, and noise is what makes an audit trail
 * untrustworthy. The comparison below runs *after* Mongoose has applied its
 * setters, so a phone number typed as `0803 123 4567` and stored as
 * `08031234567` is correctly seen as unchanged rather than as an edit.
 *
 * **Only changed leaves are recorded.** `before` and `after` hold the dotted
 * paths that moved, not whole copies of the document — otherwise fifty revisions
 * of a large record would approach the size of the data they describe.
 */

import { Types } from 'mongoose';
import { isValidClassForSection } from '../config/school.js';
import { AppError } from '../errors.js';
import { Application } from '../models/application.js';
import type { ApplicationEditInput } from '../schemas/application-edit.js';

/** Revision cap from DATA_MODEL §4.3. The oldest entry is dropped, not refused. */
const MAX_REVISIONS = 50;

export interface ApplicationDetailShape {
  id: string;
  student: Record<string, unknown>;
  guardian: Record<string, unknown>;
  placement: Record<string, unknown>;
  signature: Record<string, unknown>;
  healthInformation: string | null;
  photo: { contentType: string; width: number; height: number } | null;
  revisions: unknown[];
  submittedAt: Date;
  deletedAt: Date | null;
}

/**
 * The detail representation, shared by `GET` and `PATCH` so the two can never
 * drift into returning different shapes for the same record.
 */
export function toDetail(doc: {
  _id: unknown;
  student?: unknown;
  guardian?: unknown;
  placement?: unknown;
  signature?: unknown;
  healthInformation?: string | null;
  photo?: { contentType?: string; width?: number; height?: number } | null;
  revisions?: unknown[];
  submittedAt?: Date;
  deletedAt?: Date | null;
}): ApplicationDetailShape {
  return {
    id: String(doc._id),
    student: (doc.student ?? {}) as Record<string, unknown>,
    guardian: (doc.guardian ?? {}) as Record<string, unknown>,
    placement: (doc.placement ?? {}) as Record<string, unknown>,
    signature: (doc.signature ?? {}) as Record<string, unknown>,
    healthInformation: doc.healthInformation ?? null,
    photo: doc.photo
      ? {
          contentType: doc.photo.contentType ?? 'image/webp',
          width: doc.photo.width ?? 0,
          height: doc.photo.height ?? 0,
        }
      : null,
    revisions: doc.revisions ?? [],
    submittedAt: doc.submittedAt ?? new Date(0),
    deletedAt: doc.deletedAt ?? null,
  };
}

/** Normalises a stored value so two representations of the same value compare equal. */
function comparable(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/** Dotted leaf paths present in the request. */
function providedPaths(input: ApplicationEditInput): string[] {
  const paths: string[] = [];

  for (const group of ['student', 'guardian', 'placement'] as const) {
    const section = input[group];
    if (!section) continue;
    for (const key of Object.keys(section)) {
      paths.push(`${group}.${key}`);
    }
  }

  if (input.healthInformation !== undefined) paths.push('healthInformation');

  return paths;
}

function readPath(input: ApplicationEditInput, path: string): unknown {
  const [group, key] = path.split('.') as [string, string | undefined];
  const section = (input as Record<string, unknown>)[group] as Record<string, unknown> | undefined;
  return key === undefined ? section : section?.[key];
}

export interface EditResult {
  record: ApplicationDetailShape;
  changedFields: string[];
}

export async function editApplication(
  id: string,
  input: ApplicationEditInput,
  adminId: Types.ObjectId,
  now: Date = new Date(),
): Promise<EditResult> {
  if (!/^[0-9a-fA-F]{24}$/.test(id)) {
    throw new AppError('VALIDATION_ERROR', 'That application id is not valid.', {
      id: 'must be a 24-character identifier',
    });
  }

  const doc = await Application.findById(id);

  if (!doc) {
    throw new AppError('NOT_FOUND', 'That application could not be found.');
  }

  if (doc.deletedAt) {
    // Editing something that is on its way to deletion is a way to lose work.
    throw new AppError('CONFLICT', 'Restore this record from the trash before editing it.');
  }

  // The effective pair, after merging: a PATCH may change only one of the two,
  // and either alone can make the combination invalid.
  const effectiveSection = input.placement?.section ?? doc.placement.section;
  const effectiveClass = input.placement?.classApplyingFor ?? doc.placement.classApplyingFor;

  if (!isValidClassForSection(effectiveSection, effectiveClass)) {
    throw new AppError('VALIDATION_ERROR', 'Some details need correcting.', {
      'placement.classApplyingFor': `is not a class offered in the ${effectiveSection} section`,
    });
  }

  const paths = providedPaths(input);
  const before: Record<string, string> = {};
  const after: Record<string, string> = {};
  const changedFields: string[] = [];

  for (const path of paths) {
    before[path] = comparable(doc.get(path));

    // Assigning runs the schema setters (phone digits, lowercase email), so the
    // comparison below sees the value as it will actually be stored.
    doc.set(path, readPath(input, path));

    after[path] = comparable(doc.get(path));

    if (before[path] !== after[path]) changedFields.push(path);
  }

  if (changedFields.length === 0) {
    // A no-op edit is still a success — the client's intent was satisfied — but
    // it must not pollute the history.
    return { record: toDetail(doc.toObject()), changedFields: [] };
  }

  doc.revisions.push({
    at: now,
    by: adminId,
    changedFields,
    before: Object.fromEntries(changedFields.map((path) => [path, before[path] ?? null])),
    after: Object.fromEntries(changedFields.map((path) => [path, after[path] ?? null])),
  } as never);

  // Bounded: the schema refuses more than 50, so drop the oldest here rather
  // than letting a save fail at the limit.
  if (doc.revisions.length > MAX_REVISIONS) {
    doc.revisions.splice(0, doc.revisions.length - MAX_REVISIONS);
  }

  await doc.save();

  return { record: toDetail(doc.toObject()), changedFields };
}
