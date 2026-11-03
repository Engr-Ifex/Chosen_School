/**
 * Trash lifecycle — docs/DATA_MODEL.md §4.6, API_SPEC §4.3.
 *
 * Three operations, one of which is irreversible.
 *
 * **The order of a permanent delete is the control, not a detail.** The photo
 * object is removed first, then the document, then the audit entry. If the
 * object delete fails the record is still there, so the operation can be retried
 * and nothing is lost. Reversing it would delete the only pointer to a
 * photograph that still exists in storage — unreachable, unenumerable, and
 * impossible to clean up later. That is the risk the roadmap names, and
 * API-A18 exists to prove the ordering holds.
 *
 * Trash is a soft delete: `deletedAt` and `deletedBy` are set, and every normal
 * query filters on `deletedAt: null`. `submittedAt` is never touched, so a
 * restored record returns to its original place in the list.
 */

import { Types } from 'mongoose';
import { AppError } from '../errors.js';
import { getStorage } from '../lib/storage/index.js';
import { createLogger } from '../logger.js';
import { Application } from '../models/application.js';
import { AuditLog } from '../models/auditlog.js';

const logger = createLogger('warn');

export interface TrashedRecord {
  id: string;
  student: { surname: string; firstName: string; middleName: string | null };
  placement: { section: string; classApplyingFor: string };
  submittedAt: Date | null;
  deletedAt: Date | null;
}

function toObjectId(id: string): Types.ObjectId {
  if (!/^[0-9a-fA-F]{24}$/.test(id)) {
    throw new AppError('VALIDATION_ERROR', 'That application id is not valid.', {
      id: 'must be a 24-character identifier',
    });
  }
  return new Types.ObjectId(id);
}

function summarise(doc: {
  _id: unknown;
  student?: { surname?: string; firstName?: string; middleName?: string | null };
  placement?: { section?: string; classApplyingFor?: string };
  submittedAt?: Date;
  deletedAt?: Date | null;
}): TrashedRecord {
  return {
    id: String(doc._id),
    student: {
      surname: doc.student?.surname ?? '',
      firstName: doc.student?.firstName ?? '',
      middleName: doc.student?.middleName ?? null,
    },
    placement: {
      section: doc.placement?.section ?? '',
      classApplyingFor: doc.placement?.classApplyingFor ?? '',
    },
    submittedAt: doc.submittedAt ?? null,
    deletedAt: doc.deletedAt ?? null,
  };
}

/** Moves a live record to Trash. Idempotent failures are honest: already trashed is NOT_FOUND. */
export async function moveToTrash(
  id: string,
  adminId: Types.ObjectId,
  now: Date = new Date(),
): Promise<TrashedRecord> {
  const updated = await Application.findOneAndUpdate(
    { _id: toObjectId(id), deletedAt: null },
    { $set: { deletedAt: now, deletedBy: adminId } },
    { new: true },
  ).lean();

  if (!updated) {
    throw new AppError('NOT_FOUND', 'That application could not be found.');
  }

  return summarise(updated);
}

/** Restores a trashed record. `submittedAt` is untouched, so ordering is preserved. */
export async function restoreFromTrash(id: string): Promise<TrashedRecord> {
  const restored = await Application.findOneAndUpdate(
    { _id: toObjectId(id), deletedAt: { $ne: null } },
    { $set: { deletedAt: null, deletedBy: null } },
    { new: true },
  ).lean();

  if (!restored) {
    throw new AppError('NOT_FOUND', 'That application is not in the trash.');
  }

  return summarise(restored);
}

/**
 * Permanently deletes a trashed record: object, then document, then audit.
 *
 * @param confirm Must equal the id. A stray or replayed request with the wrong
 *   value changes nothing — that is the point of requiring it.
 */
export async function permanentlyDelete(
  id: string,
  confirm: string,
  adminId: Types.ObjectId,
  now: Date = new Date(),
): Promise<void> {
  // Cheapest check first, and it touches nothing.
  if (confirm !== id) {
    throw new AppError('VALIDATION_ERROR', 'The confirmation did not match this record.', {
      confirm: 'must equal the application id',
    });
  }

  const objectId = toObjectId(id);
  const doc = await Application.findById(objectId).lean();

  if (!doc) {
    throw new AppError('NOT_FOUND', 'That application could not be found.');
  }

  if (!doc.deletedAt) {
    // Deleting a live record outright would skip the recoverable step entirely.
    throw new AppError(
      'CONFLICT',
      'Move the record to the trash before deleting it permanently.',
    );
  }

  const photoKey = doc.photo?.key ?? null;

  // 1. The object. If this throws, the record stays and the request can be retried.
  if (photoKey) {
    try {
      await getStorage().remove(photoKey);
    } catch (error) {
      logger.error('photo_delete_failed', {
        applicationId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      // Deliberately a 500: the caller must not be told this succeeded.
      throw new AppError('INTERNAL_ERROR', 'The photograph could not be deleted.');
    }
  }

  // 2. The document.
  const result = await Application.deleteOne({ _id: objectId });

  if (result.deletedCount !== 1) {
    throw new AppError('NOT_FOUND', 'That application could not be found.');
  }

  // 3. The audit entry. Records that it happened and what it was — never the
  // personal data it contained, or the log becomes a shadow copy that outlives
  // the deletion it describes.
  try {
    await AuditLog.create({
      at: now,
      actorId: adminId,
      action: 'application.permanently_deleted',
      targetType: 'application',
      targetId: objectId,
      ip: null,
      userAgent: null,
      meta: { hadPhoto: photoKey !== null },
    });
  } catch (error) {
    // The record is already gone; there is nothing to roll back. Log loudly.
    logger.error('audit_write_failed', {
      applicationId: id,
      action: 'application.permanently_deleted',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
