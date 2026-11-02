import { Link } from 'react-router-dom';
import { Logo } from '../brand/Logo';
import { Container } from '../ui/Container';

/**
 * Site header.
 *
 * Minimal on purpose: only routes that exist are linked. The full navigation
 * described in docs/DESIGN.md §3.1 arrives with the pages it points at —
 * linking to pages that do not exist would produce dead ends for a parent.
 */
export function SiteHeader() {
  return (
    <header className="border-b border-line bg-surface">
      <Container>
        <div className="flex flex-wrap items-center justify-between gap-3 py-4">
          <Link to="/" className="flex min-w-0 items-center gap-3 no-underline">
            <Logo height={44} alt="" />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-lg font-semibold text-brand-dark">
                Chosen School
              </span>
              <span className="block truncate text-xs text-muted">Primary &amp; Secondary</span>
            </span>
          </Link>

          <nav aria-label="Main" className="flex items-center gap-2">
            <Link
              to="/"
              className="rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium text-brand-dark hover:bg-brand-soft"
            >
              Home
            </Link>
            <Link
              to="/admissions"
              className="rounded-[var(--radius-control)] bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
            >
              Apply for admission
            </Link>
          </nav>
        </div>
      </Container>
    </header>
  );
}
