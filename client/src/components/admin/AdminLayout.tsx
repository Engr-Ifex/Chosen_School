import { Link, useNavigate } from 'react-router-dom';
import { Logo } from '../brand/Logo';
import { Button } from '../ui/Button';
import { Container } from '../ui/Container';
import { signOut } from '../../lib/admin-api';
import { useAdminSession } from './SessionGate';

/**
 * Admin shell.
 *
 * Deliberately minimal: only the sections that exist are linked. The full admin
 * navigation in DESIGN.md §3.3 lists Dashboard, Trash, Enquiries and more —
 * linking to pages that do not exist yet would produce dead ends.
 */
export function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = useAdminSession();
  const navigate = useNavigate();

  async function handleSignOut() {
    if (session) await signOut(session.csrfToken);
    navigate('/admin/login', { replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col bg-page">
      <header className="border-b border-line bg-surface">
        <Container>
          <div className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex items-center gap-3">
              <Logo height={36} alt="" />
              <div className="leading-tight">
                <p className="text-sm font-semibold text-brand-dark">Chosen School</p>
                <p className="text-xs text-muted">Administration</p>
              </div>
            </div>

            <nav aria-label="Admin" className="flex items-center gap-2">
              <Link
                to="/admin/applications"
                className="rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium text-brand-dark hover:bg-brand-soft"
              >
                Applications
              </Link>
              <Link
                to="/admin/trash"
                className="rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium text-brand-dark hover:bg-brand-soft"
              >
                Trash
              </Link>
              <span className="hidden text-sm text-muted sm:inline">{session?.admin.email}</span>
              <Button variant="secondary" size="sm" onClick={() => void handleSignOut()}>
                Sign out
              </Button>
            </nav>
          </div>
        </Container>
      </header>

      <main className="flex-1">
        <Container>{children}</Container>
      </main>
    </div>
  );
}
