import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../components/ui/Button';
import { Container } from '../components/ui/Container';
import { StatusBadge } from '../components/ui/StatusBadge';
import { fetchPublicItems, type PublicItem } from '../lib/api';
import { formatDay, formatDayRange } from '../lib/dates';

/**
 * News & Events — FR-026 to FR-028, DESIGN.md §4.6 and §5.5.
 *
 * Two tabs: Announcements (newest first) and Upcoming events (soonest first;
 * past events drop off). The server decides what is public: this page only
 * renders what the public endpoints return.
 *
 * Bodies arrive as **server-sanitised** HTML (allowlist in
 * `server/src/lib/sanitize.ts`), which is why rendering them as HTML is safe.
 * The site's CSP is the second line of defence.
 *
 * Urgent items get a visual highlight only. They are not reordered (API_SPEC §2.4).
 */

type Tab = 'announcements' | 'events';

const TABS: Array<{ id: Tab; label: string; empty: string }> = [
  { id: 'announcements', label: 'Announcements', empty: 'There are no announcements at the moment.' },
  { id: 'events', label: 'Upcoming events', empty: 'There are no upcoming events at the moment.' },
];

function Item({ item }: { item: PublicItem }) {
  return (
    <article
      className={
        'rounded-[var(--radius-card)] border bg-surface p-5 ' +
        (item.isUrgent ? 'border-warning/50 border-l-4 border-l-warning' : 'border-line')
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {item.isUrgent && <StatusBadge tone="warning">Urgent</StatusBadge>}
        {item.category && <StatusBadge tone="neutral">{item.category.name}</StatusBadge>}
      </div>
      <h3 className="mt-2 text-lg font-semibold text-brand-dark">{item.title}</h3>
      <p className="mt-1 text-sm text-muted">
        {item.event
          ? formatDayRange(item.event.startDate, item.event.endDate)
          : item.publishedAt
            ? `Posted ${formatDay(item.publishedAt, false)}`
            : null}
      </p>
      <div
        className="rich-text mt-3 text-base text-ink"
        // Sanitised on the server against a strict allowlist before storage.
        dangerouslySetInnerHTML={{ __html: item.body }}
      />
    </article>
  );
}

export default function News() {
  const [tab, setTab] = useState<Tab>('announcements');
  const [items, setItems] = useState<PublicItem[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ announcements: null, events: null });

  const load = useCallback(async () => {
    setState('loading');
    const result = await fetchPublicItems(tab, page);
    if (result) {
      setItems(result.data);
      setTotalPages(result.totalPages);
      setState('ready');
    } else {
      setState('error');
    }
  }, [tab, page]);

  useEffect(() => {
    void load();
  }, [load]);

  function select(next: Tab) {
    setTab(next);
    setPage(1);
  }

  /** Arrow keys move between tabs (WAI-ARIA tabs pattern; DESIGN.md §9). */
  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const next: Tab = tab === 'announcements' ? 'events' : 'announcements';
    select(next);
    tabRefs.current[next]?.focus();
  }

  const current = TABS.find((entry) => entry.id === tab)!;

  return (
    <Container size="prose">
      <div className="py-10">
        <h1 className="text-3xl font-semibold text-brand-dark">News &amp; Events</h1>
        <p className="mt-3 text-base text-ink">Announcements and upcoming dates from Chosen School.</p>

        <div role="tablist" aria-label="News and events" className="mt-8 flex gap-2 border-b border-line" onKeyDown={onKeyDown}>
          {TABS.map((entry) => (
            <button
              key={entry.id}
              ref={(element) => {
                tabRefs.current[entry.id] = element;
              }}
              id={`tab-${entry.id}`}
              role="tab"
              type="button"
              aria-selected={tab === entry.id}
              aria-controls={`panel-${entry.id}`}
              tabIndex={tab === entry.id ? 0 : -1}
              onClick={() => select(entry.id)}
              className={
                '-mb-px border-b-2 px-4 py-2 text-sm font-medium ' +
                (tab === entry.id ? 'border-brand text-brand-dark' : 'border-transparent text-muted hover:text-brand-dark')
              }
            >
              {entry.label}
            </button>
          ))}
        </div>

        <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="mt-6 space-y-4">
          {state === 'loading' && <p className="text-muted">Loading…</p>}
          {state === 'error' && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-warning/30 bg-warning-soft p-4">
              <p className="text-sm font-medium text-warning">We could not load this list. Check your connection and try again.</p>
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                Try again
              </Button>
            </div>
          )}
          {state === 'ready' && items.length === 0 && <p className="text-muted">{current.empty}</p>}
          {state === 'ready' && items.map((item) => <Item key={item.id} item={item} />)}

          {state === 'ready' && totalPages > 1 && (
            <nav aria-label="Pages" className="flex items-center gap-3 pt-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Newer
              </Button>
              <span className="text-sm text-muted">
                Page {page} of {totalPages}
              </span>
              <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                Older
              </Button>
            </nav>
          )}
        </div>
      </div>
    </Container>
  );
}
