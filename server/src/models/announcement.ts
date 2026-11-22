/**
 * `announcements` — announcements and events in one collection (ADR-022,
 * docs/DATA_MODEL.md §7). FR-026 to FR-029.
 *
 * Rules that live here because they must hold whatever code path writes:
 *  - `event` is present **exactly** when `kind = 'event'` — a conditional the
 *    `required` option cannot express, hence the validator.
 *  - `event.endDate` is not before `event.startDate`.
 *  - Event dates are calendar days (UTC midnight). Times of day are not
 *    modelled until Q12 is decided (DATA_MODEL §7 "Open").
 *  - `isUrgent` changes presentation only. Nothing here or in the service lets
 *    it skip the draft → publish step.
 */

import { Schema, model, type Types } from 'mongoose';

export const ANNOUNCEMENT_KINDS = ['announcement', 'event'] as const;
export type AnnouncementKind = (typeof ANNOUNCEMENT_KINDS)[number];

export const ANNOUNCEMENT_STATUSES = ['draft', 'published'] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

export interface EventDates {
  startDate: Date;
  endDate: Date;
}

export interface AnnouncementShape {
  kind: AnnouncementKind;
  title: string;
  categoryId?: Types.ObjectId | null;
  /** Sanitised limited HTML (`lib/sanitize.ts`). Never stored unsanitised. */
  body: string;
  isUrgent: boolean;
  status: AnnouncementStatus;
  /** Set on first publish, kept across unpublish/republish. */
  publishedAt?: Date | null;
  /** The item stops being public after this instant. */
  expiresAt?: Date | null;
  event?: EventDates | null;
  createdAt: Date;
  updatedAt: Date;
}

const eventSchema = new Schema<EventDates>(
  {
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
  },
  { _id: false },
);

const announcementSchema = new Schema<AnnouncementShape>(
  {
    kind: { type: String, required: true, enum: [...ANNOUNCEMENT_KINDS] },
    title: { type: String, required: true, trim: true, minlength: 1, maxlength: 160 },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    body: { type: String, required: true, minlength: 1, maxlength: 20_000 },
    isUrgent: { type: Boolean, required: true, default: false },
    status: { type: String, required: true, enum: [...ANNOUNCEMENT_STATUSES], default: 'draft' },
    publishedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    event: { type: eventSchema, default: null },
  },
  { collection: 'announcements', timestamps: true, autoIndex: false },
);

announcementSchema.pre('validate', function () {
  if (this.kind === 'event' && !this.event) {
    this.invalidate('event', 'An event needs a start and end date');
  }
  if (this.kind === 'announcement' && this.event) {
    this.invalidate('event', 'An announcement cannot carry event dates');
  }
  if (this.event && this.event.endDate.getTime() < this.event.startDate.getTime()) {
    this.invalidate('event.endDate', 'The end date cannot be before the start date');
  }
});

// §7 — the public lists filter on status and kind, then sort by date.
announcementSchema.index({ status: 1, kind: 1, publishedAt: -1 });
announcementSchema.index({ status: 1, kind: 1, 'event.startDate': 1 });
announcementSchema.index({ expiresAt: 1 });

export const Announcement = model<AnnouncementShape>('Announcement', announcementSchema);

/**
 * **The** public visibility rule — DATA_MODEL §7, one place, one definition.
 * Every public query starts from this filter; nothing else decides visibility.
 */
export function publicVisibilityFilter(now: Date): Record<string, unknown> {
  return {
    status: 'published',
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
  };
}
