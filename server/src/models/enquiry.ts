/**
 * `enquiries` — contact enquiries from the public site (FR-023, FR-025).
 *
 * Fields and indexes: docs/DATA_MODEL.md §5. Archive only; no Trash (Q11).
 */

import { Schema, model } from 'mongoose';
import { inboxBaseFields, inboxSchemaOptions, type InboxBaseShape } from './inbox.js';

export interface EnquiryShape extends InboxBaseShape {
  message: string;
}

const enquirySchema = new Schema<EnquiryShape>(
  {
    ...inboxBaseFields(),
    message: {
      type: String,
      trim: true,
      required: [true, 'Message is required'],
      minlength: 1,
      maxlength: 2000,
    },
  },
  inboxSchemaOptions('enquiries'),
);

// §5 — the inbox lists active records newest first, and filters by status.
enquirySchema.index({ archivedAt: 1, createdAt: -1 });
enquirySchema.index({ status: 1, archivedAt: 1 });

export const Enquiry = model<EnquiryShape>('Enquiry', enquirySchema);
