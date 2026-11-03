/**
 * Admin applications — list and detail. docs/API_SPEC.md §4.2.
 *
 * Read-only in this slice: `PATCH` (edit and revision history) belongs to
 * ROADMAP S10, and the photo/PDF/trash endpoints to S08/S09/S11.
 *
 * **The projection is the security boundary here.** A whole-document return
 * would leak `healthInformation` into a list response the moment someone adds a
 * field, so every list field is named explicitly and `healthInformation` is not
 * among them. The risk is stated in ROADMAP S06 and asserted by a test.
 */

import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../errors.js';
import { getStorage } from '../../lib/storage/index.js';
import { Application } from '../../models/application.js';

/** Sortable fields. Anything else is a `VALIDATION_ERROR`, never a fallback. */
const SORTABLE = [
  'submittedAt',
  'student.surname',
  'student.firstName',
  'placement.classApplyingFor',
] as const;

const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  section: z.enum(['primary', 'secondary']).optional(),
  class: z.string().trim().max(60).optional(),
  session: z.string().trim().max(40).optional(),
  /** `-submittedAt` means descending (API_SPEC §1.6). */
  sort: z
    .string()
    .trim()
    .max(40)
    .optional()
    .refine(
      (value) =>
        value === undefined ||
        SORTABLE.includes(value.replace(/^-/, '') as (typeof SORTABLE)[number]),
      { message: `sort must be one of: ${SORTABLE.join(', ')} (prefix - for descending)` },
    ),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  includeTrashed: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

/** Escapes a value so it is matched literally inside a RegExp. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.');
    if (path && !(path in fields)) fields[path] = issue.message;
  }
  return fields;
}

interface ListItemSource {
  _id: unknown;
  student?: { surname?: string; firstName?: string; middleName?: string | null; dateOfBirth?: Date };
  placement?: { section?: string; classApplyingFor?: string; academicSession?: string };
  guardian?: { phone?: string };
  submittedAt?: Date;
  photo?: { key?: string } | null;
}

/** The fixed list projection. Every field is named; nothing is spread. */
function toListItem(doc: ListItemSource) {
  return {
    id: String(doc._id),
    student: {
      surname: doc.student?.surname ?? '',
      firstName: doc.student?.firstName ?? '',
      middleName: doc.student?.middleName ?? null,
      dateOfBirth: doc.student?.dateOfBirth ?? null,
    },
    placement: {
      section: doc.placement?.section ?? '',
      classApplyingFor: doc.placement?.classApplyingFor ?? '',
      academicSession: doc.placement?.academicSession ?? '',
    },
    guardian: { phone: doc.guardian?.phone ?? '' },
    submittedAt: doc.submittedAt ?? null,
    hasPhoto: Boolean(doc.photo?.key),
  };
}

export function adminApplicationsRouter(): Router {
  const router = Router();

  router.get('/applications', async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Some filters need correcting.',
        toFieldErrors(parsed.error),
      );
    }

    const { q, section, class: className, session, sort, page, pageSize, includeTrashed } =
      parsed.data;

    const filter: Record<string, unknown> = {};
    if (!includeTrashed) filter.deletedAt = null;
    if (section) filter['placement.section'] = section;
    if (className) filter['placement.classApplyingFor'] = className;
    if (session) filter['placement.academicSession'] = session;

    if (q) {
      // One value, tested against both indexed fields (API_SPEC §4.2).
      // The name match is prefix-anchored and case-insensitive so it can use
      // the index; a substring regex could not.
      const conditions: Array<Record<string, unknown>> = [
        { 'search.studentName': new RegExp(`^${escapeRegex(q.toLowerCase())}`) },
      ];

      const digits = q.replace(/\D/g, '');
      if (digits.length >= 7) conditions.push({ 'search.guardianPhone': digits });

      filter.$or = conditions;
    }

    const descending = sort?.startsWith('-') ?? false;
    const sortField = (sort ?? 'submittedAt').replace(/^-/, '');
    // `_id` breaks ties so page 2 cannot repeat or skip a record that shares a
    // sort value (S-04).
    const sortSpec: Record<string, 1 | -1> = {
      [sortField]: descending ? -1 : 1,
      _id: 1,
    };

    const [total, docs] = await Promise.all([
      Application.countDocuments(filter),
      Application.find(filter)
        .select(
          'student.surname student.firstName student.middleName student.dateOfBirth ' +
            'placement.section placement.classApplyingFor placement.academicSession ' +
            'guardian.phone submittedAt photo.key',
        )
        .sort(sortSpec)
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
    ]);

    res.status(200).json({
      data: (docs as unknown as ListItemSource[]).map(toListItem),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  });

  /**
   * Streams the private photograph — API_SPEC §4.2.
   *
   * Never a redirect and never a presigned URL: both would hand out a link that
   * keeps working after the session ends. The bytes pass through the same
   * session check as every other admin route, and `no-store` stops the browser
   * or a proxy keeping a copy.
   */
  router.get('/applications/:id/photo', async (req, res) => {
    const { id } = req.params;

    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
      throw new AppError('VALIDATION_ERROR', 'That application id is not valid.', {
        id: 'must be a 24-character identifier',
      });
    }

    const doc = await Application.findById(id).select('photo').lean();

    if (!doc || !doc.photo?.key) {
      throw new AppError('NOT_FOUND', 'That application has no photograph.');
    }

    const object = await getStorage().get(doc.photo.key);

    if (!object) {
      // The record points at a file that is gone. Report it as missing rather
      // than inventing an image or leaking the key.
      throw new AppError('NOT_FOUND', 'That application has no photograph.');
    }

    res.setHeader('Content-Type', object.contentType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline; filename="photo.webp"');
    res.send(object.data);
  });

  router.get('/applications/:id', async (req, res) => {
    const { id } = req.params;

    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
      // A malformed id is a bad request, not a missing record.
      throw new AppError('VALIDATION_ERROR', 'That application id is not valid.', {
        id: 'must be a 24-character identifier',
      });
    }

    const doc = await Application.findById(id).lean();

    if (!doc) throw new AppError('NOT_FOUND', 'That application could not be found.');

    // The detail view is the protected admin view, so health information and
    // revision history are included — but still shaped explicitly.
    res.status(200).json({
      id: String(doc._id),
      student: doc.student,
      guardian: doc.guardian,
      placement: doc.placement,
      signature: doc.signature,
      healthInformation: doc.healthInformation ?? null,
      photo: doc.photo
        ? { contentType: doc.photo.contentType, width: doc.photo.width, height: doc.photo.height }
        : null,
      revisions: doc.revisions ?? [],
      submittedAt: doc.submittedAt,
      deletedAt: doc.deletedAt ?? null,
    });
  });

  return router;
}
