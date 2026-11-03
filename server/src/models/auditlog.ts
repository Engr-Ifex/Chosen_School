/**
 * `auditlogs` — security events (docs/DATA_MODEL.md §14, ADR-025).
 *
 * **Never stored:** passwords, tokens, form contents, health information or
 * photograph data. An entry records *that* something happened — not the data it
 * happened to — otherwise the audit log becomes a shadow copy that outlives the
 * record it describes, including after a permanent deletion.
 */

import { Schema, model, type Types } from 'mongoose';

export const AUDIT_ACTIONS = [
  'auth.login.success',
  'auth.login.failure',
  'auth.logout',
  'auth.password.changed',
  'application.permanently_deleted',
  'gallery.image_unpublished',
  'settings.updated',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditLogShape {
  at: Date;
  /** Null for a failed login against an address that does not exist. */
  actorId?: Types.ObjectId | null;
  action: AuditAction;
  targetType?: string | null;
  targetId?: Types.ObjectId | null;
  ip?: string | null;
  userAgent?: string | null;
  /** Small, non-sensitive detail only. */
  meta?: Record<string, string | number | boolean> | null;
}

const auditLogSchema = new Schema<AuditLogShape>(
  {
    at: { type: Date, required: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
    action: { type: String, required: true, enum: [...AUDIT_ACTIONS] },
    targetType: { type: String, default: null, maxlength: 40 },
    targetId: { type: Schema.Types.ObjectId, default: null },
    ip: { type: String, default: null, maxlength: 45 },
    userAgent: { type: String, default: null, maxlength: 255 },
    meta: { type: Schema.Types.Mixed, default: null },
  },
  {
    collection: 'auditlogs',
    autoIndex: false,
  },
);

auditLogSchema.index({ at: -1 });
auditLogSchema.index({ action: 1, at: -1 });

export const AuditLog = model<AuditLogShape>('AuditLog', auditLogSchema);
