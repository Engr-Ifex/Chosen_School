import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import {
  bulkPdfPath,
  downloadPdf,
  fetchApplications,
  type ApplicationListItem,
  type ListMeta,
  type ListParams,
} from '../../lib/admin-api';
import { fetchPlacementOptions, type PlacementOptions } from '../../lib/api';

/**
 * Applications list — DESIGN.md §6.3.
 *
 * Every state the design asks for is represented: loading, no records yet, no
 * results for the current filters, and error with retry. The distinction
 * between "nothing exists" and "nothing matches" matters — one tells the
 * administrator to wait for applications, the other to clear a filter.
 */

const DEFAULT_PAGE_SIZE = 20;

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function fullName(item: ApplicationListItem): string {
  return [item.student.surname, item.student.firstName, item.student.middleName]
    .filter((part): part is string => Boolean(part))
    .join(' ');
}

export default function AdminApplications() {
  const [params, setParams] = useState<ListParams>({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    sort: '-submittedAt',
  });
  const [searchInput, setSearchInput] = useState('');
  const [items, setItems] = useState<ApplicationListItem[]>([]);
  const [meta, setMeta] = useState<ListMeta | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [options, setOptions] = useState<PlacementOptions | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    void fetchPlacementOptions().then(setOptions);
  }, []);

  // Debounced so typing a surname does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setParams((current) => ({ ...current, q: searchInput || undefined, page: 1 }));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    void fetchApplications(params).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setItems(result.data.data);
        setMeta(result.data.meta);
        setStatus('ready');
      } else {
        setErrorMessage(result.message);
        setStatus('error');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [params, reloadToken]);

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllOnPage() {
    setSelected((current) => {
      const allSelected = items.every((item) => current.has(item.id));
      const next = new Set(current);
      for (const item of items) {
        if (allSelected) next.delete(item.id);
        else next.add(item.id);
      }
      return next;
    });
  }

  async function handleBulkExport() {
    if (selected.size === 0 || exporting) return;

    setExporting(true);
    setExportError(null);

    const result = await downloadPdf(bulkPdfPath([...selected]));
    setExporting(false);

    if (!result.ok) {
      setExportError(result.message);
      return;
    }

    setSelected(new Set());
  }

  const hasFilters = Boolean(params.q || params.section || params.class || params.session);
  const classes = useMemo(() => {
    if (!options) return [];
    return params.section === 'secondary' ? options.secondary : options.primary;
  }, [options, params.section]);

  function setFilter(patch: Partial<ListParams>) {
    setParams((current) => ({ ...current, ...patch, page: 1 }));
  }

  function toggleSort(field: string) {
    setParams((current) => ({
      ...current,
      sort: current.sort === field ? `-${field}` : field,
      page: 1,
    }));
  }

  const sortIndicator = (field: string) =>
    params.sort === field ? ' ▲' : params.sort === `-${field}` ? ' ▼' : '';

  return (
    <AdminLayout>
      <div className="py-8">
        <h1 className="text-2xl font-semibold text-brand-dark">Applications</h1>
        <p className="mt-1 text-sm text-muted">
          {meta ? `${meta.total} application${meta.total === 1 ? '' : 's'}` : 'Loading…'}
        </p>

        {selected.size > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border border-line bg-brand-soft/60 p-3">
            <p className="text-sm font-medium text-brand-dark">
              {selected.size} application{selected.size === 1 ? '' : 's'} selected
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" disabled={exporting} onClick={() => void handleBulkExport()}>
                {exporting ? 'Preparing…' : `Export selected (${selected.size})`}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </div>
          </div>
        )}

        {exportError && (
          <div role="alert" className="mt-4 rounded-[var(--radius-control)] border border-danger/30 bg-danger-soft p-3">
            <p className="text-sm font-medium text-danger">{exportError}</p>
          </div>
        )}

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="search" className="text-sm font-medium text-ink">
              Search
            </label>
            <input
              id="search"
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Name or phone"
              className="h-11 w-full rounded-[var(--radius-control)] border border-line bg-surface px-3 text-base text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
            />
          </div>

          <Select
            id="filter-section"
            label="Section"
            value={params.section ?? ''}
            onChange={(e) => {
              // Changing section invalidates a class from the other section.
              setParams((current) => ({
                ...current,
                section: e.target.value || undefined,
                class: undefined,
                page: 1,
              }));
            }}
            placeholder="All sections"
            options={[
              { value: 'primary', label: 'Primary' },
              { value: 'secondary', label: 'Secondary' },
            ]}
          />

          <Select
            id="filter-class"
            label="Class"
            value={params.class ?? ''}
            onChange={(e) => setFilter({ class: e.target.value || undefined })}
            placeholder="All classes"
            disabled={!params.section}
            options={classes.map((name) => ({ value: name, label: name }))}
          />

          <Select
            id="filter-session"
            label="Academic session"
            value={params.session ?? ''}
            onChange={(e) => setFilter({ session: e.target.value || undefined })}
            placeholder="All sessions"
            options={(options?.sessions ?? []).map((name) => ({ value: name, label: name }))}
          />
        </div>

        {status === 'error' && (
          <div
            role="alert"
            className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-danger/30 bg-danger-soft p-4"
          >
            <p className="text-sm font-medium text-danger">{errorMessage}</p>
            <Button variant="secondary" size="sm" onClick={() => setReloadToken((n) => n + 1)}>
              Try again
            </Button>
          </div>
        )}

        {status === 'loading' && (
          <p className="mt-8 text-sm text-muted" role="status">
            Loading applications…
          </p>
        )}

        {status === 'ready' && items.length === 0 && (
          <div className="mt-8 rounded-[var(--radius-card)] border border-line bg-surface p-8 text-center">
            <p className="text-base font-medium text-ink">
              {hasFilters ? 'No applications match these filters' : 'No applications yet'}
            </p>
            <p className="mt-1 text-sm text-muted">
              {hasFilters
                ? 'Try a different search term, or clear the filters.'
                : 'Applications submitted through the admission form will appear here.'}
            </p>
            {hasFilters && (
              <div className="mt-4">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSearchInput('');
                    setParams({ page: 1, pageSize: DEFAULT_PAGE_SIZE, sort: '-submittedAt' });
                  }}
                >
                  Clear filters
                </Button>
              </div>
            )}
          </div>
        )}

        {status === 'ready' && items.length > 0 && (
          <>
            {/* Desktop table */}
            <div className="mt-6 hidden overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface md:block">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Admission applications</caption>
                <thead className="border-b border-line bg-brand-soft/60">
                  <tr>
                    <th scope="col" className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label="Select all applications on this page"
                        checked={items.length > 0 && items.every((item) => selected.has(item.id))}
                        onChange={toggleAllOnPage}
                        className="h-4 w-4 accent-[var(--color-brand)]"
                      />
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold text-brand-dark">
                      <button type="button" onClick={() => toggleSort('student.surname')} className="underline-offset-2 hover:underline">
                        Applicant{sortIndicator('student.surname')}
                      </button>
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold text-brand-dark">Section</th>
                    <th scope="col" className="px-4 py-3 font-semibold text-brand-dark">Class</th>
                    <th scope="col" className="px-4 py-3 font-semibold text-brand-dark">Session</th>
                    <th scope="col" className="px-4 py-3 font-semibold text-brand-dark">
                      <button type="button" onClick={() => toggleSort('submittedAt')} className="underline-offset-2 hover:underline">
                        Submitted{sortIndicator('submittedAt')}
                      </button>
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold text-brand-dark">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label={`Select ${fullName(item)}`}
                          checked={selected.has(item.id)}
                          onChange={() => toggleSelected(item.id)}
                          className="h-4 w-4 accent-[var(--color-brand)]"
                        />
                      </td>
                      <td className="px-4 py-3 text-ink">{fullName(item)}</td>
                      <td className="px-4 py-3 capitalize text-ink">{item.placement.section}</td>
                      <td className="px-4 py-3 text-ink">{item.placement.classApplyingFor}</td>
                      <td className="px-4 py-3 text-ink">{item.placement.academicSession}</td>
                      <td className="px-4 py-3 text-ink">{formatDate(item.submittedAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to={`/admin/applications/${item.id}`}
                          className="font-medium text-brand underline hover:text-brand-hover"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Narrow screens: cards rather than a squeezed table */}
            <ul className="mt-6 space-y-3 md:hidden">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="rounded-[var(--radius-card)] border border-line bg-surface p-4"
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      aria-label={`Select ${fullName(item)}`}
                      checked={selected.has(item.id)}
                      onChange={() => toggleSelected(item.id)}
                      className="mt-1 h-4 w-4 accent-[var(--color-brand)]"
                    />
                    <p className="font-medium text-ink">{fullName(item)}</p>
                  </div>
                  <p className="mt-1 text-sm capitalize text-muted">
                    {item.placement.section} · {item.placement.classApplyingFor} ·{' '}
                    {item.placement.academicSession}
                  </p>
                  <p className="mt-1 text-sm text-muted">Submitted {formatDate(item.submittedAt)}</p>
                  <Link
                    to={`/admin/applications/${item.id}`}
                    className="mt-3 inline-block font-medium text-brand underline hover:text-brand-hover"
                  >
                    View application
                  </Link>
                </li>
              ))}
            </ul>

            {meta && meta.totalPages > 1 && (
              <nav aria-label="Pagination" className="mt-6 flex items-center justify-between">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={meta.page <= 1}
                  onClick={() => setParams((current) => ({ ...current, page: meta.page - 1 }))}
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
                  onClick={() => setParams((current) => ({ ...current, page: meta.page + 1 }))}
                >
                  Next
                </Button>
              </nav>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
