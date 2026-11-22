/**
 * What `enquiries` and `visitrequests` have in common — DATA_MODEL §5, §6.
 *
 * Both are an "inbox": a visitor's message the administrator works through and
 * then archives. Neither has a Trash or a permanent delete (Q11): archive is
 * the only way out, and it is reversible.
 *
 * **There is no `confirmed` status, deliberately.** The PRD's statuses are New,
 * Reviewed and Responded to. A "confirmed" visit would let the dashboard imply
 * a booking the school has not made (DATA_MODEL §6).
 */

import type { SchemaDefinition } from 'mongoose';
import { normalisePhone, PHONE_PATTERN } from '../lib/phone.js';
import { SECTIONS, type Section } from './application.js';

export const INBOX_STATUSES = ['new', 'reviewed', 'responded'] as const;
export type InboxStatus = (typeof INBOX_STATUSES)[number];

export interface InboxBaseShape {
  name: string;
  /** Stored digits-only. See `lib/phone.ts`. */
  phone: string;
  email?: string | null;
  section: Section;
  status: InboxStatus;
  statusUpdatedAt?: Date | null;
  /** Archive, not delete. `null` means active. */
  archivedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const trimmed = (max: number) => ({ type: String, trim: true, maxlength: max });

/** Field definitions shared by both inbox collections. */
export function inboxBaseFields(): SchemaDefinition {
  return {
    name: { ...trimmed(120), required: [true, 'Name is required'], minlength: 1 },
    phone: {
      type: String,
      required: [true, 'Phone is required'],
      set: normalisePhone,
      validate: {
        validator: (value: string): boolean => PHONE_PATTERN.test(value),
        message: 'Phone must contain between 7 and 15 digits',
      },
    },
    email: { ...trimmed(254), lowercase: true, default: null },
    section: {
      type: String,
      required: [true, 'Section is required'],
      enum: { values: [...SECTIONS], message: 'Section must be primary or secondary' },
    },
    status: {
      type: String,
      required: true,
      enum: { values: [...INBOX_STATUSES], message: 'Status must be new, reviewed or responded' },
      default: 'new',
    },
    statusUpdatedAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
  };
}

/** Schema options shared by both. Indexes are created by script, never on boot. */
export function inboxSchemaOptions(collection: string) {
  return {
    collection,
    timestamps: true,
    // AGENTS.md §8: indexes are created by an explicit script, never on boot.
    autoIndex: false,
  } as const;
}
