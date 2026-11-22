/**
 * `categories` — shared by announcements and (from S17) the gallery.
 * docs/DATA_MODEL.md §9, ADR-024.
 *
 * A collection rather than a list in settings, so an item references a stable
 * id and a rename is one write. Deleting a category that is in use is refused
 * (`409`) rather than silently orphaning content.
 */

import { Schema, model } from 'mongoose';

export const CATEGORY_SCOPES = ['announcement', 'gallery'] as const;
export type CategoryScope = (typeof CATEGORY_SCOPES)[number];

export interface CategoryShape {
  scope: CategoryScope;
  name: string;
  slug: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const categorySchema = new Schema<CategoryShape>(
  {
    scope: { type: String, required: true, enum: [...CATEGORY_SCOPES] },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 60 },
    slug: {
      type: String,
      required: true,
      maxlength: 70,
      match: [/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slug must be lowercase and hyphenated'],
    },
    order: { type: Number, required: true, default: 0 },
  },
  { collection: 'categories', timestamps: true, autoIndex: false },
);

// §9 — a slug is unique within its scope, so "Events" can exist for both.
categorySchema.index({ scope: 1, slug: 1 }, { unique: true });

export const Category = model<CategoryShape>('Category', categorySchema);

/** "PTA Meetings & Events" → "pta-meetings-events". */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
}
