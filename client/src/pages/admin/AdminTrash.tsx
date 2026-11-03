import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { useAdminSession } from '../../components/admin/SessionGate';
import { Button } from '../../components/ui/Button';
import {
  deletePermanently,
  fetchTrash,
  restoreApplication,
  type ListMeta,
  type TrashItem,
} from '../../lib/admin-api';

/**
 * Trash — DESIGN.md §6.5, API_SPEC §4.3.
 *
 * Rows show only what identifies a record. The server does not send health
 * information, addresses, phone numbers or the photo, so this view cannot leak
 * them even by accident.
 *
 * Permanent deletion is a two-step action: the first click reveals a panel that
 * names the record and states that it cannot be undone. A single click is too
 * easy to repeat by accident, and this one is irreversible.
 */

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function fullName(item: TrashItem): string {
  return [item.student.surname, item.student.firstName, item.student.middleName]
    .filter(Boolean)
    .join(' ');
}

export default function AdminTrash() {
  const session = useAdminSession();
  const [items, setItems] = useState<TrashItem[]>([]);
  const [meta, setMeta] = useState<ListMeta | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setStatus('loading');
    const result = await fetchTrash(page);
    if (result.ok) {
      setItems(result.data.data);
      setMeta(result.data.meta);
      setStatus('ready');
    } else {
      setErrorMessage(result.message);
      setStatus('error');
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRestore(id: string) {
    if (!session) return;
    setBusyId(id);
    const result = await restoreApplication(id, session.csrfToken);
    setBusyId(null);

    if (!result.ok) {
      setErrorMessage(result.message);
      setStatus('error');
      return;
    }

    setConfirmingId(null);
    await load();
  }

  async function handleDelete(id: string) {
    if (!session) return;
    setBusyId(id);
    const result = await deletePermanently(id, session.csrfToken);
    setBusyId(null);

    if (!result.ok) {
      setErrorMessage(result.message);
      setStatus('error');
      return;
    }

    setConfirmingId(null);
    await load();
  }

  return (
    <AdminLayout>
      <div className="py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-brand-dark">Trash</h1>
            <p className="mt-1 text-sm text-muted">
              {meta ? `${meta.total} record${meta.total === 1 ? '' : 's'}` : 'Loading…'}
            </p>
          </div>
          <Link
            to="/admin/applications"
            className="text-sm font-medium text-brand underline hover:text-brand-hover"
          >
            Back to applications
          </Link>
        </div>

        {status === 'error' && (
          <div
            role="alert"
            className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-danger/30 bg-danger-soft p-4"
          >
            <p className="text-sm font-medium text-danger">{errorMessage}</p>
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        )}

        {status === 'loading' && (
          <p className="mt-8 text-sm text-muted" role="status">
            Loading the trash…
          </p>
        )}

        {status === 'ready' && items.length === 0 && (
          <div className="mt-8 rounded-[var(--radius-card)] border border-line bg-surface p-8 text-center">
            <p className="text-base font-medium text-ink">The trash is empty</p>
            <p className="mt-1 text-sm text-muted">
              Records you move to the trash will appear here, and can be restored.
            </p>
          </div>
        )}

        {status === 'ready' && items.length > 0 && (
          <ul className="mt-6 space-y-3">
            {items.map((item) => (
              <li
                key={item.id}
                className="rounded-[var(--radius-card)] border border-line bg-surface p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink">{fullName(item)}</p>
                    <p className="mt-1 text-sm capitalize text-muted">
                      {item.placement.section} · {item.placement.classApplyingFor}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      Submitted {formatDate(item.submittedAt)} · Moved to trash{' '}
                      {formatDate(item.deletedAt)}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busyId === item.id}
                      onClick={() => void handleRestore(item.id)}
                    >
                      Restore
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={busyId === item.id}
                      onClick={() => setConfirmingId(item.id)}
                    >
                      Delete permanently
                    </Button>
                  </div>
                </div>

                {confirmingId === item.id && (
                  <div className="mt-3 rounded-[var(--radius-control)] border border-danger/40 bg-danger-soft p-3">
                    <p className="text-sm font-medium text-danger">
                      Permanently delete the application for {fullName(item)}?
                    </p>
                    <p className="mt-1 text-sm text-danger">
                      This cannot be undone. The photograph, if any, is deleted too.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={busyId === item.id}
                        onClick={() => void handleDelete(item.id)}
                      >
                        {busyId === item.id ? 'Deleting…' : 'Yes, delete permanently'}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busyId === item.id}
                        onClick={() => setConfirmingId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {meta && meta.totalPages > 1 && (
          <nav aria-label="Pagination" className="mt-6 flex items-center justify-between">
            <Button
              variant="secondary"
              size="sm"
              disabled={meta.page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              Previous
            </Button>
            <p className="text-sm text-muted">
              Page {meta.page} of {meta.totalPages}
            </p>
            <Button
              variant="secondary"
              size="sm"
              disabled={meta.page >= meta.totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </nav>
        )}
      </div>
    </AdminLayout>
  );
}
