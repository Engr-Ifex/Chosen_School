import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { Select } from '../../components/ui/Select';
import { StatusBadge } from '../../components/ui/StatusBadge';
import {
  fetchInbox,
  INBOX_STATUS_LABELS,
  type InboxKind,
  type InboxListItem,
  type InboxStatus,
  type ListMeta,
} from '../../lib/admin-api';
import {
  formatSection,
  formatTimestamp,
  formatVisitDate,
  INBOX_COPY,
  STATUS_TONES,
} from './inbox-format';

/**
 * Enquiry or visit-request inbox — FR-025.
 *
 * Active and archived records are separate views, never mixed in one table,
 * so an archived record cannot be mistaken for a live one, or for a deleted one
 * (there is no delete). Message bodies are not shown in the list.
 */

const STATUS_OPTIONS = (Object.keys(INBOX_STATUS_LABELS) as InboxStatus[]).map((value) => ({
  value,
  label: INBOX_STATUS_LABELS[value],
}));

export default function AdminInbox({ kind }: { kind: InboxKind }) {
  const copy = INBOX_COPY[kind];
  const isVisit = kind === 'visit-requests';

  const [items, setItems] = useState<InboxListItem[]>([]);
  const [meta, setMeta] = useState<ListMeta | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [status, setStatus] = useState<InboxStatus | ''>('');
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setState('loading');
    const result = await fetchInbox(kind, { q: appliedQuery, status, archived, page });
    if (result.ok) {
      setItems(result.data.data);
      setMeta(result.data.meta);
      setState('ready');
    } else {
      setErrorMessage(result.message);
      setState('error');
    }
  }, [kind, appliedQuery, status, archived, page]);

  // Each inbox is mounted with its own `key` (App.tsx), so switching between
  // them starts from clean filters rather than carrying one inbox's search over.
  useEffect(() => {
    void load();
  }, [load]);

  function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setAppliedQuery(query.trim());
  }

  return (
    <AdminLayout>
      <div className="py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-brand-dark">
              {copy.title}
              {archived && <span className="ml-2 text-base font-normal text-muted">— archived</span>}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {meta ? `${meta.total} ${meta.total === 1 ? 'record' : 'records'}` : ' '}
            </p>
          </div>

          <div role="group" aria-label="Show" className="flex gap-2">
            <Button
              variant={archived ? 'secondary' : 'primary'}
              size="sm"
              aria-pressed={!archived}
              onClick={() => {
                setArchived(false);
                setPage(1);
              }}
            >
              Active
            </Button>
            <Button
              variant={archived ? 'primary' : 'secondary'}
              size="sm"
              aria-pressed={archived}
              onClick={() => {
                setArchived(true);
                setPage(1);
              }}
            >
              Archived
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_200px]">
          <form onSubmit={handleSearch} role="search" className="flex items-end gap-2">
            <div className="flex-1">
              <Field
                id={`${kind}-search`}
                label="Search"
                type="search"
                placeholder="Name or phone"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>
          <Select
            id={`${kind}-status`}
            label="Status"
            placeholder="All statuses"
            options={STATUS_OPTIONS}
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as InboxStatus | '');
              setPage(1);
            }}
          />
        </div>

        {state === 'error' && (
          <div role="alert" className="mt-6 rounded-[var(--radius-card)] border border-danger/30 bg-danger-soft p-4">
            <p className="text-sm font-medium text-danger">{errorMessage}</p>
          </div>
        )}

        {state !== 'error' && (
          // `relative` contains the absolutely positioned `sr-only` labels, which
          // otherwise escape the scroll box and widen the whole page on a phone.
          <div className="relative mt-6 overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-brand-soft text-brand-dark">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Name</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Phone</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Section</th>
                  {isVisit && <th scope="col" className="px-4 py-3 font-semibold">Requested for</th>}
                  <th scope="col" className="px-4 py-3 font-semibold">Received</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {state === 'loading' && (
                  <tr>
                    <td colSpan={isVisit ? 7 : 6} className="px-4 py-6 text-muted">Loading…</td>
                  </tr>
                )}
                {state === 'ready' && items.length === 0 && (
                  <tr>
                    <td colSpan={isVisit ? 7 : 6} className="px-4 py-6 text-muted">
                      {appliedQuery || status ? 'Nothing matches these filters.' : archived ? 'Nothing archived.' : copy.empty}
                    </td>
                  </tr>
                )}
                {state === 'ready' &&
                  items.map((item) => (
                    <tr key={item.id} className="border-t border-line">
                      <td className="px-4 py-3 font-medium text-ink">{item.name}</td>
                      <td className="px-4 py-3 text-ink">{item.phone}</td>
                      <td className="px-4 py-3 text-ink">{formatSection(item.section)}</td>
                      {isVisit && (
                        <td className="px-4 py-3 text-ink">
                          {formatVisitDate(item.preferredDate)} · {item.preferredTime}
                        </td>
                      )}
                      <td className="px-4 py-3 text-ink">{formatTimestamp(item.createdAt)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={STATUS_TONES[item.status]}>
                          {INBOX_STATUS_LABELS[item.status]}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to={`/admin/${kind}/${item.id}`}
                          className="font-medium text-brand underline hover:text-brand-hover"
                        >
                          View<span className="sr-only"> {item.name}</span>
                        </Link>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {meta && meta.totalPages > 1 && (
          <nav aria-label="Pages" className="mt-4 flex items-center gap-3">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <span className="text-sm text-muted">
              Page {meta.page} of {meta.totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= meta.totalPages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </nav>
        )}
      </div>
    </AdminLayout>
  );
}
