/**
 * The two inbox kinds: which fields each returns, and how they are shaped.
 *
 * The list is deliberately narrower than the detail view. Message bodies stay
 * out of the list, so a page of twenty is not twenty private messages.
 */

import { Enquiry } from '../models/enquiry.js';
import { VisitRequest } from '../models/visitrequest.js';
import { inboxService } from './inbox.js';

type Doc = Record<string, unknown>;

const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const strOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;
const dateOrNull = (value: unknown): Date | null => (value instanceof Date ? value : null);

/** Fields every inbox list item carries. */
function baseItem(doc: Doc) {
  return {
    id: String(doc._id),
    name: str(doc.name),
    phone: str(doc.phone),
    email: strOrNull(doc.email),
    section: str(doc.section),
    status: str(doc.status),
    createdAt: dateOrNull(doc.createdAt),
    archivedAt: dateOrNull(doc.archivedAt),
  };
}

const BASE_LIST = 'name phone email section status createdAt archivedAt';
const BASE_DETAIL = `${BASE_LIST} statusUpdatedAt updatedAt`;

export const enquiries = inboxService({
  model: Enquiry,
  noun: 'enquiry',
  listFields: BASE_LIST,
  detailFields: `${BASE_DETAIL} message`,
  defaultSort: '-createdAt',
  toListItem: (doc: Doc) => baseItem(doc),
  toDetail: (doc: Doc) => ({
    ...baseItem(doc),
    message: str(doc.message),
    statusUpdatedAt: dateOrNull(doc.statusUpdatedAt),
    updatedAt: dateOrNull(doc.updatedAt),
  }),
});

const visitItem = (doc: Doc) => ({
  ...baseItem(doc),
  preferredDate: dateOrNull(doc.preferredDate),
  preferredTime: str(doc.preferredTime),
});

export const visitRequests = inboxService({
  model: VisitRequest,
  noun: 'visit request',
  listFields: `${BASE_LIST} preferredDate preferredTime`,
  detailFields: `${BASE_DETAIL} preferredDate preferredTime message`,
  // Soonest requested day first: that is the order the school follows up in.
  defaultSort: 'preferredDate',
  toListItem: visitItem,
  toDetail: (doc: Doc) => ({
    ...visitItem(doc),
    message: strOrNull(doc.message),
    statusUpdatedAt: dateOrNull(doc.statusUpdatedAt),
    updatedAt: dateOrNull(doc.updatedAt),
  }),
});
