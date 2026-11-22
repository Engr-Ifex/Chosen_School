/**
 * Enquiry and visit-request inbox — FR-023 to FR-025, API_SPEC §2.7 and §4.4.
 *
 * One implementation serves both collections, because their behaviour is
 * identical and only their extra fields differ. Each kind supplies its own
 * explicit projections and shaping functions, so nothing is ever spread from a
 * document into a response (AGENTS.md §6).
 *
 * Rules that are easy to "simplify" away:
 *  - **Archive is not delete**, and there is no delete at all (Q11).
 *  - **An archived record cannot change status** (`409`). It is no longer
 *    active; unarchive it first. The same reasoning stops trashed applications
 *    being edited.
 *  - **Setting the status it already has is a no-op**, so `statusUpdatedAt`
 *    keeps recording when it last really changed.
 *  - Every conditional update is a single atomic operation. The follow-up read
 *    exists only to tell "not found" from "wrong state" for the error message.
 */

import type { Model } from 'mongoose';
import { AppError } from '../errors.js';
import type { InboxBaseShape, InboxStatus } from '../models/inbox.js';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

function assertId(id: string): void {
  if (!OBJECT_ID.test(id)) {
    throw new AppError('VALIDATION_ERROR', 'That identifier is not valid.', {
      id: 'must be a 24-character identifier',
    });
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface InboxKind<TShape extends InboxBaseShape, TItem, TDetail> {
  model: Model<TShape>;
  /** Singular noun for messages, e.g. "enquiry". */
  noun: string;
  /** Space-separated fields for the list. Named, never `*`. */
  listFields: string;
  detailFields: string;
  defaultSort: string;
  toListItem: (doc: Record<string, unknown>) => TItem;
  toDetail: (doc: Record<string, unknown>) => TDetail;
}

export interface ListOptions {
  q?: string;
  status?: InboxStatus;
  archived: boolean;
  sort?: string;
  page: number;
  pageSize: number;
}

export function inboxService<TShape extends InboxBaseShape, TItem, TDetail>(
  kind: InboxKind<TShape, TItem, TDetail>,
) {
  const { model, noun } = kind;
  const notFound = () => new AppError('NOT_FOUND', `That ${noun} could not be found.`);

  async function findDetail(id: string): Promise<TDetail> {
    const doc = await model.findById(id).select(kind.detailFields).lean();
    if (!doc) throw notFound();
    return kind.toDetail(doc as unknown as Record<string, unknown>);
  }

  /**
   * Applies `update` only when `condition` holds. If nothing matched, reports
   * whether the record is missing or merely in the wrong state.
   */
  async function conditionalUpdate(
    id: string,
    condition: Record<string, unknown>,
    update: Record<string, unknown>,
    conflictMessage: string,
  ): Promise<TDetail> {
    assertId(id);
    const updated = await model
      .findOneAndUpdate({ _id: id, ...condition }, update, { new: true })
      .select(kind.detailFields)
      .lean();

    if (updated) return kind.toDetail(updated as unknown as Record<string, unknown>);

    const exists = await model.exists({ _id: id });
    if (!exists) throw notFound();
    throw new AppError('CONFLICT', conflictMessage);
  }

  return {
    async create(input: Record<string, unknown>): Promise<{ id: string }> {
      // `input` has already passed the Zod schema; the model validates again.
      // Status and archive state are set here, never taken from the visitor.
      const doc = new model({ ...input, status: 'new', archivedAt: null });
      await doc.save();
      return { id: String(doc._id) };
    },

    async list(options: ListOptions) {
      const filter: Record<string, unknown> = {
        archivedAt: options.archived ? { $ne: null } : null,
      };
      if (options.status) filter.status = options.status;

      if (options.q) {
        // Name prefix, case-insensitive; or an exact phone match when the query
        // looks like a number. The inbox is small enough that the unindexed
        // name match is not a concern (DATA_MODEL §5).
        const conditions: Array<Record<string, unknown>> = [
          { name: new RegExp(`^${escapeRegex(options.q)}`, 'i') },
        ];
        const digits = options.q.replace(/\D/g, '');
        if (digits.length >= 7) conditions.push({ phone: digits });
        filter.$or = conditions;
      }

      const sort = options.sort ?? kind.defaultSort;
      const field = sort.replace(/^-/, '');
      // `_id` breaks ties so paging cannot repeat or skip a record.
      const sortSpec: Record<string, 1 | -1> = { [field]: sort.startsWith('-') ? -1 : 1, _id: 1 };

      const [total, docs] = await Promise.all([
        model.countDocuments(filter),
        model
          .find(filter)
          .select(kind.listFields)
          .sort(sortSpec)
          .skip((options.page - 1) * options.pageSize)
          .limit(options.pageSize)
          .lean(),
      ]);

      return {
        data: docs.map((doc) => kind.toListItem(doc as unknown as Record<string, unknown>)),
        meta: {
          page: options.page,
          pageSize: options.pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / options.pageSize)),
        },
      };
    },

    async get(id: string): Promise<TDetail> {
      assertId(id);
      return findDetail(id);
    },

    async setStatus(id: string, status: InboxStatus): Promise<TDetail> {
      assertId(id);
      const current = await model.findById(id).select('status archivedAt').lean();
      if (!current) throw notFound();
      if (current.archivedAt) {
        throw new AppError('CONFLICT', `An archived ${noun} cannot change status. Unarchive it first.`);
      }
      if (current.status === status) return findDetail(id);

      // Conditional on the status read above, so two concurrent changes cannot
      // both claim to have moved it from the same state.
      return conditionalUpdate(
        id,
        { archivedAt: null, status: current.status },
        { $set: { status, statusUpdatedAt: new Date() } },
        `This ${noun} changed while you were editing it. Reload and try again.`,
      );
    },

    archive(id: string): Promise<TDetail> {
      return conditionalUpdate(
        id,
        { archivedAt: null },
        { $set: { archivedAt: new Date() } },
        `This ${noun} is already archived.`,
      );
    },

    unarchive(id: string): Promise<TDetail> {
      return conditionalUpdate(
        id,
        { archivedAt: { $ne: null } },
        { $set: { archivedAt: null } },
        `This ${noun} is not archived.`,
      );
    },
  };
}
