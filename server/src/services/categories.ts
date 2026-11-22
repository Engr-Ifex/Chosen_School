/**
 * Categories — API_SPEC §4.9, DATA_MODEL §9, ADR-024.
 *
 * Deleting a category that items still use is refused with the usage count,
 * so the administrator reassigns them first. Silent orphaning is worse than an
 * extra click (approved 24 October 2026).
 */

import { AppError } from '../errors.js';
import { Announcement } from '../models/announcement.js';
import { Category, slugify, type CategoryScope } from '../models/category.js';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

export interface CategoryDto {
  id: string;
  scope: CategoryScope;
  name: string;
  slug: string;
  order: number;
}

type Doc = { _id: unknown; scope: CategoryScope; name: string; slug: string; order: number };

const toDto = (doc: Doc): CategoryDto => ({
  id: String(doc._id),
  scope: doc.scope,
  name: doc.name,
  slug: doc.slug,
  order: doc.order,
});

const FIELDS = 'scope name slug order';

function assertId(id: string): void {
  if (!OBJECT_ID.test(id)) {
    throw new AppError('VALIDATION_ERROR', 'That category id is not valid.', { id: 'must be a 24-character identifier' });
  }
}

function slugOrThrow(name: string): string {
  const slug = slugify(name);
  if (slug === '') {
    throw new AppError('VALIDATION_ERROR', 'Use letters or numbers in the name.', { name: 'needs letters or numbers' });
  }
  return slug;
}

/** Maps the unique-index error to a clear conflict. */
function isDuplicate(error: unknown): boolean {
  return (error as { code?: number }).code === 11000;
}

/** How many items use a category. Gallery items join this count in S17. */
async function usageCount(id: string, scope: CategoryScope): Promise<number> {
  if (scope === 'announcement') return Announcement.countDocuments({ categoryId: id });
  return 0;
}

export async function listCategories(scope: CategoryScope): Promise<CategoryDto[]> {
  const docs = await Category.find({ scope }).select(FIELDS).sort({ order: 1, name: 1 }).lean();
  return docs.map((doc) => toDto(doc as unknown as Doc));
}

export async function createCategory(input: { scope: CategoryScope; name: string; order?: number }): Promise<CategoryDto> {
  try {
    const doc = await Category.create({ ...input, slug: slugOrThrow(input.name), order: input.order ?? 0 });
    return toDto(doc.toObject() as unknown as Doc);
  } catch (error) {
    if (isDuplicate(error)) throw new AppError('CONFLICT', 'A category with that name already exists.');
    throw error;
  }
}

export async function updateCategory(id: string, input: { name?: string; order?: number }): Promise<CategoryDto> {
  assertId(id);
  const update: Record<string, unknown> = {};
  if (input.name !== undefined) {
    update.name = input.name;
    update.slug = slugOrThrow(input.name);
  }
  if (input.order !== undefined) update.order = input.order;

  try {
    const doc = await Category.findByIdAndUpdate(id, { $set: update }, { new: true, runValidators: true })
      .select(FIELDS)
      .lean();
    if (!doc) throw new AppError('NOT_FOUND', 'That category could not be found.');
    return toDto(doc as unknown as Doc);
  } catch (error) {
    if (isDuplicate(error)) throw new AppError('CONFLICT', 'A category with that name already exists.');
    throw error;
  }
}

export async function deleteCategory(id: string): Promise<void> {
  assertId(id);
  const doc = await Category.findById(id).select('scope').lean();
  if (!doc) throw new AppError('NOT_FOUND', 'That category could not be found.');

  const count = await usageCount(id, doc.scope);
  if (count > 0) {
    throw new AppError(
      'CONFLICT',
      `This category is used by ${count} ${count === 1 ? 'item' : 'items'}. Move them to another category first.`,
      { usage: String(count) },
    );
  }
  await Category.deleteOne({ _id: id });
}

/** Resolves ids to `{ id, name, slug }` for responses, in one query. */
export async function categoryLookup(ids: Array<unknown>): Promise<Map<string, { id: string; name: string; slug: string }>> {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (unique.length === 0) return new Map();
  const docs = await Category.find({ _id: { $in: unique } }).select('name slug').lean();
  return new Map(docs.map((doc) => [String(doc._id), { id: String(doc._id), name: doc.name, slug: doc.slug }]));
}

/** Throws a field error unless `id` is an existing category in `scope`. */
export async function assertCategory(id: string, scope: CategoryScope): Promise<void> {
  const exists = await Category.exists({ _id: id, scope });
  if (!exists) {
    throw new AppError('VALIDATION_ERROR', 'That category does not exist.', { categoryId: 'choose a category from the list' });
  }
}

export async function findCategoryBySlug(scope: CategoryScope, slug: string): Promise<string | null> {
  const doc = await Category.findOne({ scope, slug }).select('_id').lean();
  return doc ? String(doc._id) : null;
}
