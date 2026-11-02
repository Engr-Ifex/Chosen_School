/**
 * `admins` — the single administrator credential (docs/DATA_MODEL.md §2).
 *
 * There is no registration path. The one record is created by a CLI script, so
 * an attacker cannot self-provision an account however the API is probed.
 *
 * The credential material is protected twice: `select: false` keeps it out of
 * queries by default, and the `toJSON` transform removes it again in case a
 * future query explicitly selects it. Two guards because one mistake here is
 * unrecoverable.
 */

import { Schema, model } from 'mongoose';

export interface PasswordParams {
  memoryCost: number;
  timeCost: number;
  parallelism: number;
}

export interface AdminShape {
  email: string;
  passwordHash: string;
  passwordAlgo: string;
  passwordParams: PasswordParams;
  passwordUpdatedAt: Date;
  failedLoginCount: number;
  lockedUntil?: Date | null;
  lastLoginAt?: Date | null;
}

const adminSchema = new Schema<AdminShape>(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    passwordHash: { type: String, required: true, select: false },
    passwordAlgo: { type: String, required: true, default: 'argon2id' },
    passwordParams: {
      type: {
        memoryCost: { type: Number, required: true },
        timeCost: { type: Number, required: true },
        parallelism: { type: Number, required: true },
      },
      required: true,
      select: false,
    },
    passwordUpdatedAt: { type: Date, required: true },
    failedLoginCount: { type: Number, required: true, default: 0, min: 0 },
    lockedUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
  },
  {
    collection: 'admins',
    autoIndex: false,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.passwordHash;
        delete ret.passwordParams;
        return ret;
      },
    },
  },
);

// DB-01 — a duplicate email must be a unique-index error, not a second account.
adminSchema.index({ email: 1 }, { unique: true });

export const Admin = model<AdminShape>('Admin', adminSchema);
