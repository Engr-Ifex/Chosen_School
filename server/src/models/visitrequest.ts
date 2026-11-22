/**
 * `visitrequests` — requests to visit the school (FR-024, FR-025).
 *
 * Fields and indexes: docs/DATA_MODEL.md §6. Archive only; no Trash (Q11).
 *
 * **No confirmation field.** A request is not a booking; the administrator
 * follows up manually. See `inbox.ts` for why there is no `confirmed` status.
 */

import { Schema, model } from 'mongoose';
import { inboxBaseFields, inboxSchemaOptions, type InboxBaseShape } from './inbox.js';

/** `HH:mm`, 24-hour. Free text such as "3pm" is rejected (API-P13). */
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface VisitRequestShape extends InboxBaseShape {
  /** UTC midnight of the requested day. */
  preferredDate: Date;
  preferredTime: string;
  message?: string | null;
}

const visitRequestSchema = new Schema<VisitRequestShape>(
  {
    ...inboxBaseFields(),
    preferredDate: { type: Date, required: [true, 'Preferred date is required'] },
    preferredTime: {
      type: String,
      required: [true, 'Preferred time is required'],
      validate: {
        validator: (value: string): boolean => TIME_PATTERN.test(value),
        message: 'Preferred time must be HH:mm (24-hour)',
      },
    },
    message: { type: String, trim: true, maxlength: 1000, default: null },
  },
  inboxSchemaOptions('visitrequests'),
);

// §6 — the inbox lists active requests by the day they ask for.
visitRequestSchema.index({ archivedAt: 1, preferredDate: 1 });
visitRequestSchema.index({ status: 1, archivedAt: 1 });

export const VisitRequest = model<VisitRequestShape>('VisitRequest', visitRequestSchema);
