import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { fetchApplication, type ApplicationDetail } from '../../lib/admin-api';

/**
 * Application detail — DESIGN.md §6.4, read-only in this slice.
 *
 * Editing and revision history are ROADMAP S10; there is no edit control here
 * because there is no endpoint behind it yet. A disabled button would imply the
 * feature exists and is broken.
 *
 * Health information is shown in its own clearly-marked block rather than
 * buried in the student section, so it is noticed when it matters and not
 * mistaken for ordinary data.
 */

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="grid gap-1 py-2 sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm font-medium text-muted">{label}</dt>
      <dd className="text-sm text-ink sm:col-span-2">{value && value !== '' ? value : '—'}</dd>
    </div>
  );
}

export default function AdminApplicationDetail() {
  const { id } = useParams<{ id: string }>();
  const [record, setRecord] = useState<ApplicationDetail | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'missing'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    void fetchApplication(id).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setRecord(result.data);
        setStatus('ready');
        return;
      }
      if (result.status === 404) {
        setStatus('missing');
        return;
      }
      setErrorMessage(result.message);
      setStatus('error');
    });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const back = (
    <p className="mt-4">
      <Link to="/admin/applications" className="text-sm font-medium text-brand underline hover:text-brand-hover">
        ← Back to applications
      </Link>
    </p>
  );

  return (
    <AdminLayout>
      <div className="py-8">
        {status === 'loading' && (
          <p className="text-sm text-muted" role="status">
            Loading application…
          </p>
        )}

        {status === 'error' && (
          <div role="alert" className="rounded-[var(--radius-card)] border border-danger/30 bg-danger-soft p-4">
            <p className="text-sm font-medium text-danger">{errorMessage}</p>
            <div className="mt-3">
              <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
                Try again
              </Button>
            </div>
          </div>
        )}

        {status === 'missing' && (
          <div className="rounded-[var(--radius-card)] border border-line bg-surface p-8 text-center">
            <p className="text-base font-medium text-ink">Application not found</p>
            <p className="mt-1 text-sm text-muted">
              It may have been permanently deleted.
            </p>
            {back}
          </div>
        )}

        {status === 'ready' && record && (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold text-brand-dark">
                  {[record.student.surname, record.student.firstName, record.student.middleName]
                    .filter(Boolean)
                    .join(' ')}
                </h1>
                <p className="mt-1 text-sm text-muted">
                  Submitted {formatDate(record.submittedAt)} ·{' '}
                  {record.placement.section === 'primary' ? 'Primary' : 'Secondary'} ·{' '}
                  {record.placement.classApplyingFor}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge tone="info">{record.placement.academicSession}</StatusBadge>
                {record.deletedAt && <StatusBadge tone="danger">In trash</StatusBadge>}
              </div>
            </div>

            <div className="mt-6 space-y-6">
              <section className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
                <h2 className="text-lg font-semibold text-brand-dark">Student information</h2>
                <dl className="mt-2 divide-y divide-line">
                  <Row label="Surname" value={record.student.surname} />
                  <Row label="First name" value={record.student.firstName} />
                  <Row label="Middle name" value={record.student.middleName} />
                  <Row
                    label="Date of birth"
                    value={record.student.dateOfBirth ? formatDate(record.student.dateOfBirth) : '—'}
                  />
                  <Row label="Gender" value={record.student.gender} />
                  <Row label="Religion" value={record.student.religion} />
                  <Row label="Ethnicity" value={record.student.ethnicity} />
                  <Row label="State of origin" value={record.student.stateOfOrigin} />
                  <Row label="Previous school" value={record.student.previousSchool} />
                  <Row label="Last class attended" value={record.student.lastClassAttended} />
                </dl>
              </section>

              <section className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
                <h2 className="text-lg font-semibold text-brand-dark">Parent or guardian</h2>
                <dl className="mt-2 divide-y divide-line">
                  <Row label="Name" value={record.guardian.name} />
                  <Row label="Phone" value={record.guardian.phone} />
                  <Row label="Email" value={record.guardian.email} />
                  <Row label="Home address" value={record.guardian.homeAddress} />
                  <Row label="Occupation" value={record.guardian.occupation} />
                  <Row label="Office address" value={record.guardian.officeAddress} />
                </dl>
              </section>

              <section className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
                <h2 className="text-lg font-semibold text-brand-dark">School placement</h2>
                <dl className="mt-2 divide-y divide-line">
                  <Row label="Section" value={record.placement.section} />
                  <Row label="Class" value={record.placement.classApplyingFor} />
                  <Row label="Academic session" value={record.placement.academicSession} />
                </dl>
              </section>

              {/* Sensitive: kept separate and labelled, never mixed into the above. */}
              <section className="rounded-[var(--radius-card)] border border-warning/30 bg-warning-soft p-5">
                <h2 className="text-lg font-semibold text-warning">
                  Health information and special needs
                </h2>
                <p className="mt-1 text-xs text-warning">
                  Sensitive. Shown here only, never in list views. Handle with care.
                </p>
                <p className="mt-3 whitespace-pre-wrap text-sm text-ink">
                  {record.healthInformation && record.healthInformation.trim() !== ''
                    ? record.healthInformation
                    : 'None provided.'}
                </p>
              </section>

              <section className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
                <h2 className="text-lg font-semibold text-brand-dark">Signature</h2>
                <dl className="mt-2 divide-y divide-line">
                  <Row label="Typed name" value={record.signature.typedName} />
                  <Row label="Signed at" value={formatDate(record.signature.signedAt)} />
                </dl>
                <p className="mt-3 text-xs text-muted">
                  A typed name records that the form was completed. It is not a legal signature.
                </p>
              </section>

              {record.revisions.length > 0 && (
                <section className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
                  <h2 className="text-lg font-semibold text-brand-dark">Edit history</h2>
                  <ul className="mt-2 space-y-1 text-sm text-ink">
                    {record.revisions.map((revision, index) => (
                      <li key={`${revision.at}-${index}`}>
                        {formatDate(revision.at)} — {revision.changedFields.join(', ')}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>

            {back}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
