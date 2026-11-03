import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Logo } from '../../components/brand/Logo';
import { Button } from '../../components/ui/Button';
import { Container } from '../../components/ui/Container';
import { Field } from '../../components/ui/Field';
import { signIn } from '../../lib/admin-api';

/**
 * Administrator sign-in — DESIGN.md §6.1.
 *
 * The error message is the server's generic one. There is no "no account with
 * that email" state here, deliberately: the UI must not become the enumeration
 * oracle the API refuses to be.
 */
export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(null);

    const result = await signIn(email, password);
    setSubmitting(false);

    if (result.ok) {
      setSignedIn(true);
      return;
    }

    setError(result.message);
  }

  if (signedIn) return <Navigate to="/admin/applications" replace />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-4">
      <Container size="prose">
        <div className="mx-auto max-w-md">
          <div className="mb-6 flex items-center gap-3">
            <Logo height={48} alt="" />
            <div className="leading-tight">
              <p className="text-lg font-semibold text-brand-dark">Chosen School</p>
              <p className="text-sm text-muted">Administration</p>
            </div>
          </div>

          <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
            <h1 className="text-xl font-semibold text-brand-dark">Sign in</h1>
            <p className="mt-1 text-sm text-muted">
              This area is for the school administrator only.
            </p>

            {error && (
              <div
                role="alert"
                className="mt-4 rounded-[var(--radius-control)] border border-danger/30 bg-danger-soft p-3"
              >
                <p className="text-sm font-medium text-danger">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
              <Field
                id="admin-email"
                label="Email address"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />

              <div className="flex flex-col gap-1.5">
                <Field
                  id="admin-password"
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <label className="flex items-center gap-2 text-sm text-muted">
                  <input
                    type="checkbox"
                    checked={showPassword}
                    onChange={(e) => setShowPassword(e.target.checked)}
                    className="h-4 w-4 accent-[var(--color-brand)]"
                  />
                  Show password
                </label>
              </div>

              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>

            <p className="mt-4 text-xs text-muted">
              There is no self-service password reset. If you are locked out, contact whoever
              maintains the site.
            </p>
          </div>

          <p className="mt-6 text-center text-sm">
            <a href="/" className="text-brand underline hover:text-brand-hover">
              Return to the school website
            </a>
          </p>
        </div>
      </Container>
    </div>
  );
}
