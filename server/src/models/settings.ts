/**
 * `settings` — the singleton site configuration (docs/DATA_MODEL.md §12).
 *
 * A single document with a fixed `key: 'site'`. The unique index on `key` is what
 * enforces "singleton" — not application code, which could be bypassed by a
 * second writer.
 *
 * `placement.*` lives here because the PRD forbids inventing class names and
 * session formats. The server validates submissions against these lists (§4.2),
 * so no school policy is hardcoded anywhere in the source.
 */

import { Schema, model, type Types } from 'mongoose';

export interface SocialLink {
  platform: string;
  url: string;
}

export interface SettingsShape {
  key: 'site';
  school: {
    name: string;
    shortName?: string | null;
    address: string;
    phone: string;
    email?: string | null;
    whatsapp?: string | null;
    mapUrl?: string | null;
  };
  social: SocialLink[];
  branding: {
    logoKey?: string | null;
  };
  placement: {
    primaryClasses: string[];
    secondaryClasses: string[];
    academicSessions: string[];
    currentSession?: string | null;
  };
  updatedAt: Date;
  updatedBy?: Types.ObjectId | null;
}

export const SETTINGS_KEY = 'site' as const;

const socialSchema = new Schema<SocialLink>(
  {
    platform: { type: String, required: true, trim: true, maxlength: 40 },
    url: { type: String, required: true, trim: true, maxlength: 300 },
  },
  { _id: false },
);

const settingsSchema = new Schema<SettingsShape>(
  {
    key: {
      type: String,
      required: true,
      enum: [SETTINGS_KEY],
      default: SETTINGS_KEY,
      immutable: true,
    },
    school: {
      name: { type: String, required: true, trim: true, maxlength: 160 },
      shortName: { type: String, trim: true, maxlength: 80, default: null },
      address: { type: String, required: true, trim: true, maxlength: 300 },
      phone: { type: String, required: true, trim: true, maxlength: 30 },
      email: { type: String, trim: true, lowercase: true, maxlength: 254, default: null },
      whatsapp: { type: String, trim: true, maxlength: 20, default: null },
      mapUrl: { type: String, trim: true, maxlength: 500, default: null },
    },
    social: {
      type: [socialSchema],
      default: [],
      validate: {
        validator: (value: SocialLink[]): boolean => value.length <= 10,
        message: 'At most 10 social links',
      },
    },
    branding: {
      logoKey: { type: String, default: null },
    },
    placement: {
      primaryClasses: { type: [String], default: [] },
      secondaryClasses: { type: [String], default: [] },
      academicSessions: { type: [String], default: [] },
      currentSession: { type: String, default: null },
    },
    updatedAt: { type: Date, required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  {
    collection: 'settings',
    autoIndex: false,
  },
);

// The singleton guarantee. DB-05.
settingsSchema.index({ key: 1 }, { unique: true });

export const Settings = model<SettingsShape>('Settings', settingsSchema);
