import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { useAdminSession } from '../../components/admin/SessionGate';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { StatusBadge, type StatusTone } from '../../components/ui/StatusBadge';
import {
  deleteAnnouncement,
  fetchAnnouncements,
  publishAnnouncement,
  unpublishAnnouncement,
  type AdminAnnouncement,
  type ListMeta,
} from '../../lib/admin-api';
import { formatDayRange, formatInstant } from '../../lib/dates';
import { whatsAppShareUrl } from './announcement-share';

/**
 * Announcements & Events list — FR-026, FR-027, FR-029, DESIGN.md §6.7.
 *
 * Each row shows where the item really stands: Draft, Published (public), or
 * Expired (published but past its expiry, hidden from the public). Publishing
 * and unpublishing are explicit buttons, separate from editing. Delete is
 * permanent (no Trash for announcements, and no backups — ADR-036), so it asks
 * first and names the item.
 */

function stateOf(item: AdminAnnouncement): { label: string; tone: StatusTone } {
  if (item.status === 'draft') return { label: 'Draft', tone: 'neutral' };
  if (item.isExpired) return { label: 'Expired', tone: 'warning' };
  return { label: 'Published', tone: 'success' };
}

export default function AdminAnnouncements() {
  const session = useAdminSession();
  const [items, setItems] = useState<AdminAnnouncement[]>([]);
  const [meta, setMeta] = useState<ListMeta | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    const result = await fetchAnnouncements({ kind, status, page });
    if (result.ok) {
      setItems(result.data.data);
      setMeta(result.data.meta);
      setState('ready');
    } else {
      setMessage({ tone: 'danger', text: result.message });
      setState('error');
    }
  }, [kind, status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(id: string, action: () => Promise<{ ok: boolean; message?: string }>, done: string) {
    setBusyId(id);
    setMessage(null);
    const result = await action();
    setBusyId(null);
    setConfirmingId(null);
    if (result.ok) {
      setMessage({ tone: 'success', text: done });
      await load();
    } else {
      setMessage({ tone: 'danger', text: result.message ?? 'Something went wrong.' });
    }
  }

  return (
    <AdminLayout>
      <div className="py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-brand-dark">News &amp; events</h1>
            <p className="mt-1 text-sm text-muted">{meta ? `${meta.total} ${meta.total === 1 ? 'item' : 'items'}` : ' '}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/admin/categories"
              className="rounded-[var(--radius-control)] border border-line px-4 py-2 text-sm font-medium text-brand-dark hover:bg-brand-soft"
            >
              Categories
            </Link>
            <Link
              to="/admin/news/new"
              className="rounded-[var(--radius-control)] bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
            >
              New item
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:max-w-xl">
          <Select
            id="filter-kind"
            label="Type"
            placeholder="All types"
            options={[
              { value: 'announcement', label: 'Announcements' },
              { value: 'event', label: 'Events' },
            ]}
            value={kind}
            onChange={(event) => {
              setKind(event.target.value);
              setPage(1);
            }}
          />
          <Select
            id="filter-status"
            label="Status"
            placeholder="All statuses"
            options={[
              { value: 'draft', label: 'Draft' },
              { value: 'published', label: 'Published' },
            ]}
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          />
        </div>

        <div aria-live="polite">
          {message && (
            <p role={message.tone === 'danger' ? 'alert' : 'status'} className={'mt-4 text-sm font-medium ' + (message.tone === 'danger' ? 'text-danger' : 'text-success')}>
              {message.text}
            </p>
          )}
        </div>

        <ul className="mt-6 space-y-3">
          {state === 'loading' && <li className="text-muted">Loading…</li>}
          {state === 'ready' && items.length === 0 && (
            <li className="rounded-[var(--radius-card)] border border-line bg-surface p-6 text-muted">
              Nothing here yet. Use <strong>New item</strong> to write an announcement or add an event.
            </li>
          )}
          {state === 'ready' &&
            items.map((item) => {
              const badge = stateOf(item);
              const busy = busyId === item.id;
              return (
                <li key={item.id} className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                    <StatusBadge tone="info">{item.kind === 'event' ? 'Event' : 'Announcement'}</StatusBadge>
                    {item.isUrgent && <StatusBadge tone="warning">Urgent</StatusBadge>}
                    {item.category && <StatusBadge tone="neutral">{item.category.name}</StatusBadge>}
                  </div>
                  <h2 className="mt-2 text-base font-semibold text-ink">{item.title}</h2>
                  <p className="mt-1 text-sm text-muted">
                    {item.event && <>{formatDayRange(item.event.startDate, item.event.endDate)} · </>}
                    {item.publishedAt ? `First published ${formatInstant(item.publishedAt)}` : 'Never published'}
                    {item.expiresAt && <> · {item.isExpired ? 'Expired' : 'Expires'} {formatInstant(item.expiresAt)}</>}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      to={`/admin/news/${item.id}`}
                      className="rounded-[var(--radius-control)] border border-line px-3 py-1.5 text-sm font-medium text-brand-dark hover:bg-brand-soft"
                    >
                      Edit<span className="sr-only"> {item.title}</span>
                    </Link>
                    {session && item.status === 'draft' && (
                      <Button size="sm" disabled={busy} onClick={() => void act(item.id, () => publishAnnouncement(item.id, session.csrfToken), `Published “${item.title}”.`)}>
                        Publish
                      </Button>
                    )}
                    {session && item.status === 'published' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => void act(item.id, () => unpublishAnnouncement(item.id, session.csrfToken), `“${item.title}” is no longer public.`)}
                      >
                        Unpublish
                      </Button>
                    )}
                    {item.isPublic && (
                      <a
                        href={whatsAppShareUrl(item, window.location.origin)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-[var(--radius-control)] border border-line px-3 py-1.5 text-sm font-medium text-brand-dark hover:bg-brand-soft"
                      >
                        Share on WhatsApp<span className="sr-only"> (opens WhatsApp; you choose who to send it to)</span>
                      </a>
                    )}
                    {session && confirmingId !== item.id && (
                      <Button size="sm" variant="secondary" disabled={busy} onClick={() => setConfirmingId(item.id)}>
                        Delete
                      </Button>
                    )}
                  </div>

                  {session && confirmingId === item.id && (
                    <div role="alertdialog" aria-label="Confirm delete" className="mt-3 rounded-[var(--radius-card)] border border-danger/30 bg-danger-soft p-3">
                      <p className="text-sm text-ink">
                        Delete <strong>{item.title}</strong> permanently? This cannot be undone.
                      </p>
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" variant="danger" disabled={busy} onClick={() => void act(item.id, () => deleteAnnouncement(item.id, session.csrfToken), `Deleted “${item.title}”.`)}>
                          Delete permanently
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setConfirmingId(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
        </ul>

        {meta && meta.totalPages > 1 && (
          <nav aria-label="Pages" className="mt-4 flex items-center gap-3">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <span className="text-sm text-muted">
              Page {meta.page} of {meta.totalPages}
            </span>
            <Button variant="secondary" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)}>
              Next
            </Button>
          </nav>
        )}
      </div>
    </AdminLayout>
  );
}
