/**
 * Announcements and events — FR-026 to FR-029, API_SPEC §2.4 and §4.5.
 *
 * The rules that carry the slice:
 *  - **Created as a draft, always.** Publishing is a separate action with its
 *    own audit entry, so an urgent notice cannot skip review (FR-027).
 *  - **One visibility rule** (`publicVisibilityFilter`) decides what the public
 *    sees. Events additionally drop out once their end date has passed, judged
 *    by the school's calendar day (UTC+1, no daylight saving).
 *  - **Bodies are sanitised before storage**, never on the way out, so what is
 *    in the database is already safe to render.
 *  - Publish twice, or unpublish a draft, is a `409`, not a silent success
 *    (API-A20): the second click is usually a stale screen.
 */

import { AppError } from '../errors.js';
import { isEmptyBody, sanitizeBody } from '../lib/sanitize.js';
import {
  Announcement,
  publicVisibilityFilter,
  type AnnouncementKind,
  type AnnouncementShape,
} from '../models/announcement.js';
import { AuditLog, type AuditAction } from '../models/auditlog.js';
import type { AnnouncementCreateInput, AnnouncementUpdateInput } from '../schemas/announcement.js';
import { assertCategory, categoryLookup, findCategoryBySlug } from './categories.js';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const FIELDS = 'kind title categoryId body isUrgent status publishedAt expiresAt event createdAt updatedAt';
const SCHOOL_UTC_OFFSET_MS = 60 * 60 * 1000;

type Doc = Pick<
  AnnouncementShape,
  'kind' | 'title' | 'body' | 'isUrgent' | 'status' | 'publishedAt' | 'expiresAt' | 'event' | 'createdAt' | 'updatedAt'
> & { _id: unknown; categoryId?: unknown };

type CategoryRef = { id: string; name: string; slug: string } | null;

function assertId(id: string): void {
  if (!OBJECT_ID.test(id)) {
    throw new AppError('VALIDATION_ERROR', 'That identifier is not valid.', { id: 'must be a 24-character identifier' });
  }
}

/** Today's date in the school's time zone, as UTC midnight (how event dates are stored). */
export function schoolToday(now: Date): Date {
  const local = new Date(now.getTime() + SCHOOL_UTC_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

/** Public shape — API_SPEC §2.4. No status, no internal timestamps. */
function toPublic(doc: Doc, category: CategoryRef) {
  return {
    id: String(doc._id),
    kind: doc.kind,
    title: doc.title,
    category,
    body: doc.body,
    isUrgent: doc.isUrgent,
    publishedAt: doc.publishedAt ?? null,
    expiresAt: doc.expiresAt ?? null,
    event: doc.event ? { startDate: doc.event.startDate, endDate: doc.event.endDate } : null,
  };
}

/** Admin shape: the public fields plus workflow state. */
function toAdmin(doc: Doc, category: CategoryRef, now: Date) {
  const expired = Boolean(doc.expiresAt && doc.expiresAt.getTime() <= now.getTime());
  return {
    ...toPublic(doc, category),
    status: doc.status,
    /** Published but past its expiry: hidden from the public, kept here. */
    isExpired: expired,
    isPublic: doc.status === 'published' && !expired,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function withCategories<T>(docs: Doc[], shape: (doc: Doc, category: CategoryRef) => T): Promise<T[]> {
  const lookup = await categoryLookup(docs.map((doc) => doc.categoryId));
  return docs.map((doc) => shape(doc, doc.categoryId ? (lookup.get(String(doc.categoryId)) ?? null) : null));
}

async function audit(action: AuditAction, actorId: string, targetId: string, meta: Record<string, string | boolean>) {
  try {
    await AuditLog.create({ at: new Date(), actorId, action, targetType: 'announcement', targetId, meta });
  } catch {
    // An audit write must never undo the action it describes.
  }
}

function cleanBody(raw: string): string {
  const body = sanitizeBody(raw);
  if (isEmptyBody(body)) {
    throw new AppError('VALIDATION_ERROR', 'Some details need correcting.', { body: 'Content is required' });
  }
  return body;
}

/** `kind` and `event` must agree; reported against the field the admin can fix. */
function assertKindAndEvent(kind: AnnouncementKind, event: unknown): void {
  if (kind === 'event' && !event) {
    throw new AppError('VALIDATION_ERROR', 'Some details need correcting.', { event: 'An event needs a start and end date' });
  }
  if (kind === 'announcement' && event) {
    throw new AppError('VALIDATION_ERROR', 'Some details need correcting.', { event: 'An announcement cannot carry event dates' });
  }
}

async function loadAdmin(id: string) {
  const doc = await Announcement.findById(id).select(FIELDS).lean();
  if (!doc) throw new AppError('NOT_FOUND', 'That item could not be found.');
  const [shaped] = await withCategories([doc as unknown as Doc], (d, c) => toAdmin(d, c, new Date()));
  return shaped!;
}

export async function createAnnouncement(input: AnnouncementCreateInput) {
  assertKindAndEvent(input.kind, input.event);
  if (input.categoryId) await assertCategory(input.categoryId, 'announcement');

  const doc = await Announcement.create({
    kind: input.kind,
    title: input.title,
    categoryId: input.categoryId ?? null,
    body: cleanBody(input.body),
    isUrgent: input.isUrgent ?? false,
    // Not from input, ever: API-A19.
    status: 'draft',
    publishedAt: null,
    expiresAt: input.expiresAt ?? null,
    event: input.event ?? null,
  });
  return loadAdmin(String(doc._id));
}

export async function updateAnnouncement(id: string, input: AnnouncementUpdateInput) {
  assertId(id);
  const current = await Announcement.findById(id).select('kind event').lean();
  if (!current) throw new AppError('NOT_FOUND', 'That item could not be found.');

  const kind = input.kind ?? current.kind;
  const event = input.event !== undefined ? input.event : current.event;
  assertKindAndEvent(kind, event);
  if (input.categoryId) await assertCategory(input.categoryId, 'announcement');

  const set: Record<string, unknown> = {};
  if (input.kind !== undefined) set.kind = input.kind;
  if (input.title !== undefined) set.title = input.title;
  if (input.categoryId !== undefined) set.categoryId = input.categoryId;
  if (input.body !== undefined) set.body = cleanBody(input.body);
  if (input.isUrgent !== undefined) set.isUrgent = input.isUrgent;
  if (input.expiresAt !== undefined) set.expiresAt = input.expiresAt;
  if (input.event !== undefined) set.event = input.event;

  await Announcement.updateOne({ _id: id }, { $set: set }, { runValidators: true });
  return loadAdmin(id);
}

export async function getAnnouncement(id: string) {
  assertId(id);
  return loadAdmin(id);
}

export async function listAnnouncements(options: {
  status?: 'draft' | 'published';
  kind?: AnnouncementKind;
  category?: string;
  page: number;
  pageSize: number;
}) {
  const filter: Record<string, unknown> = {};
  if (options.status) filter.status = options.status;
  if (options.kind) filter.kind = options.kind;
  if (options.category) filter.categoryId = options.category;

  const now = new Date();
  const [total, docs] = await Promise.all([
    Announcement.countDocuments(filter),
    Announcement.find(filter)
      .select(FIELDS)
      .sort({ updatedAt: -1, _id: 1 })
      .skip((options.page - 1) * options.pageSize)
      .limit(options.pageSize)
      .lean(),
  ]);

  return {
    data: await withCategories(docs as unknown as Doc[], (d, c) => toAdmin(d, c, now)),
    meta: { page: options.page, pageSize: options.pageSize, total, totalPages: Math.max(1, Math.ceil(total / options.pageSize)) },
  };
}

/** Publish: draft → published. The only way content becomes public. */
export async function publishAnnouncement(id: string, actorId: string) {
  assertId(id);
  const doc = await Announcement.findOneAndUpdate(
    { _id: id, status: 'draft' },
    [
      {
        $set: {
          status: 'published',
          // Kept from the first publish, so republishing does not jump the queue.
          publishedAt: { $ifNull: ['$publishedAt', '$$NOW'] },
        },
      },
    ],
    { new: true, updatePipeline: true },
  )
    .select('isUrgent')
    .lean();

  if (!doc) {
    if (!(await Announcement.exists({ _id: id }))) throw new AppError('NOT_FOUND', 'That item could not be found.');
    throw new AppError('CONFLICT', 'This item is already published.');
  }
  await audit('announcement.published', actorId, id, { urgent: doc.isUrgent });
  return loadAdmin(id);
}

/** Unpublish: published → draft. It leaves the public site at once. */
export async function unpublishAnnouncement(id: string, actorId: string) {
  assertId(id);
  const doc = await Announcement.findOneAndUpdate({ _id: id, status: 'published' }, { $set: { status: 'draft' } }, { new: true })
    .select('_id')
    .lean();
  if (!doc) {
    if (!(await Announcement.exists({ _id: id }))) throw new AppError('NOT_FOUND', 'That item could not be found.');
    throw new AppError('CONFLICT', 'This item is not published.');
  }
  await audit('announcement.unpublished', actorId, id, {});
  return loadAdmin(id);
}

/**
 * Delete. Permanent: there is no Trash for announcements (Q11 applies Trash to
 * applications only) and no backups (ADR-036), so the UI confirms first.
 */
export async function deleteAnnouncement(id: string, actorId: string): Promise<void> {
  assertId(id);
  const doc = await Announcement.findOneAndDelete({ _id: id }).select('kind status').lean();
  if (!doc) throw new AppError('NOT_FOUND', 'That item could not be found.');
  await audit('announcement.deleted', actorId, id, { kind: doc.kind, wasPublished: doc.status === 'published' });
}

/**
 * The public lists — API_SPEC §2.4. Announcements newest first; events by
 * start date, soonest first, dropping any whose end date has passed.
 */
export async function listPublic(
  kind: AnnouncementKind,
  options: { category?: string; page: number; pageSize: number },
) {
  const now = new Date();
  const filter: Record<string, unknown> = { ...publicVisibilityFilter(now), kind };

  if (kind === 'event') filter['event.endDate'] = { $gte: schoolToday(now) };

  if (options.category) {
    const categoryId = await findCategoryBySlug('announcement', options.category);
    // An unknown category is simply an empty list, not an error.
    if (!categoryId) {
      return { data: [], meta: { page: options.page, pageSize: options.pageSize, total: 0, totalPages: 1 } };
    }
    filter.categoryId = categoryId;
  }

  const sort: Record<string, 1 | -1> =
    kind === 'event' ? { 'event.startDate': 1, _id: 1 } : { publishedAt: -1, _id: 1 };

  const [total, docs] = await Promise.all([
    Announcement.countDocuments(filter),
    Announcement.find(filter)
      .select(FIELDS)
      .sort(sort)
      .skip((options.page - 1) * options.pageSize)
      .limit(options.pageSize)
      .lean(),
  ]);

  return {
    data: await withCategories(docs as unknown as Doc[], toPublic),
    meta: { page: options.page, pageSize: options.pageSize, total, totalPages: Math.max(1, Math.ceil(total / options.pageSize)) },
  };
}
