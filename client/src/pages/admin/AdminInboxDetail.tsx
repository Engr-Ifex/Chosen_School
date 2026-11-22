import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { useAdminSession } from '../../components/admin/SessionGate';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/StatusBadge';
import {
  archiveInboxItem,
  fetchInboxItem,
  INBOX_STATUS_LABELS,
  setInboxStatus,
  unarchiveInboxItem,
  type InboxDetail,
  type InboxKind,
  type InboxStatus,
} from '../../lib/admin-api';
import {
  formatSection,
  formatTimestamp,
  formatVisitDate,
  INBOX_COPY,
  STATUS_TONES,
} from './inbox-format';

/**
 * One enquiry or visit request — FR-025.
 *
 * The status is changed with three explicit buttons rather than a dropdown that
 * saves on change, so a stray keypress cannot mark something "Responded to".
 * An archived record shows its state plainly and must be unarchived before its
 * status can change, which the server also enforces (`409`).
 */

const STATUSES = Object.keys(INBOX_STATUS_LABELS) as InboxStatus[];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[180px_1fr]">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-base text-ink">{children}</dd>
    </div>
  );
}

export default function AdminInboxDetail({ kind }: { kind: InboxKind }) {
  const { id = '' } = useParams();
  const session = useAdminSession();
  const copy = INBOX_COPY[kind];
  const isVisit = kind === 'visit-requests';

  const [record, setRecord] = useState<InboxDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await fetchInboxItem(kind, id);
    if (result.ok) setRecord(result.data);
    else setLoadError(result.status === 404 ? `That ${copy.singular.toLowerCase()} could not be found.` : result.message);
  }, [kind, id, copy.singular]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => ReturnType<typeof setInboxStatus>, done: string) {
    if (!session || busy) return;
    setBusy(true);
    setActionError(null);
    setNotice(null);
    const result = await action();
    setBusy(false);
    if (result.ok) {
      setRecord(result.data);
      setNotice(done);
    } else {
      setActionError(result.message);
    }
  }

  return (
    <AdminLayout>
      <div className="py-8">
        <p>
          <Link to={`/admin/${kind}`} className="text-sm font-medium text-brand underline hover:text-brand-hover">
            ← Back to {copy.title.toLowerCase()}
          </Link>
        </p>

        {loadError && (
          <div role="alert" className="mt-6 rounded-[var(--radius-card)] border border-danger/30 bg-danger-soft p-4">
            <p className="text-sm font-medium text-danger">{loadError}</p>
          </div>
        )}

        {!record && !loadError && <p className="mt-6 text-muted">Loading…</p>}

        {record && session && (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold text-brand-dark">{record.name}</h1>
              <StatusBadge tone={STATUS_TONES[record.status]}>{INBOX_STATUS_LABELS[record.status]}</StatusBadge>
              {record.archivedAt && <StatusBadge tone="neutral">Archived</StatusBadge>}
            </div>
            <p className="mt-1 text-sm text-muted">
              {copy.singular} received {formatTimestamp(record.createdAt)}
            </p>

            {isVisit && (
              <p className="mt-4 rounded-[var(--radius-card)] border border-warning/30 bg-warning-soft p-3 text-sm text-ink">
                This is a request, not a booking. Contact the parent or guardian to confirm a time or suggest another.
              </p>
            )}

            <div aria-live="polite">
              {notice && (
                <p role="status" className="mt-4 text-sm font-medium text-success">
                  {notice}
                </p>
              )}
              {actionError && (
                <div role="alert" className="mt-4 rounded-[var(--radius-card)] border border-danger/30 bg-danger-soft p-3">
                  <p className="text-sm font-medium text-danger">{actionError}</p>
                </div>
              )}
            </div>

            <dl className="mt-6 divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface px-4">
              <Row label="Phone">
                <a href={`tel:${record.phone}`} className="text-brand underline">
                  {record.phone}
                </a>
              </Row>
              <Row label="Email">
                {record.email ? (
                  <a href={`mailto:${record.email}`} className="text-brand underline">
                    {record.email}
                  </a>
                ) : (
                  '—'
                )}
              </Row>
              <Row label="Section">{formatSection(record.section)}</Row>
              {isVisit && (
                <Row label="Requested for">
                  {formatVisitDate(record.preferredDate)} at {record.preferredTime}
                </Row>
              )}
              <Row label="Message">
                <span className="whitespace-pre-wrap">{record.message || '—'}</span>
              </Row>
              <Row label="Status last changed">{formatTimestamp(record.statusUpdatedAt)}</Row>
              {record.archivedAt && <Row label="Archived">{formatTimestamp(record.archivedAt)}</Row>}
            </dl>

            <section aria-labelledby="status-heading" className="mt-8">
              <h2 id="status-heading" className="text-lg font-semibold text-brand-dark">
                Status
              </h2>
              {record.archivedAt ? (
                <p className="mt-2 text-sm text-muted">Unarchive this record to change its status.</p>
              ) : (
                <div role="group" aria-label="Set status" className="mt-3 flex flex-wrap gap-2">
                  {STATUSES.map((value) => (
                    <Button
                      key={value}
                      size="sm"
                      variant={record.status === value ? 'primary' : 'secondary'}
                      aria-pressed={record.status === value}
                      disabled={busy || record.status === value}
                      onClick={() =>
                        void run(
                          () => setInboxStatus(kind, record.id, value, session.csrfToken),
                          `Marked as ${INBOX_STATUS_LABELS[value]}.`,
                        )
                      }
                    >
                      {INBOX_STATUS_LABELS[value]}
                    </Button>
                  ))}
                </div>
              )}
            </section>

            <section aria-labelledby="archive-heading" className="mt-8">
              <h2 id="archive-heading" className="text-lg font-semibold text-brand-dark">
                Archive
              </h2>
              <p className="mt-2 text-sm text-muted">
                Archiving moves this out of the active inbox. Nothing is deleted, and it can be unarchived at any time.
              </p>
              <div className="mt-3">
                {record.archivedAt ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => void run(() => unarchiveInboxItem(kind, record.id, session.csrfToken), 'Moved back to the active inbox.')}
                  >
                    Unarchive
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => void run(() => archiveInboxItem(kind, record.id, session.csrfToken), 'Archived.')}
                  >
                    Archive
                  </Button>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
