import { createContext, useContext, useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { fetchSession, type AdminSession } from '../../lib/admin-api';

/**
 * Session gate for every `/admin` route except sign-in.
 *
 * The check is a real request to `GET /auth/session`, not a client-side flag:
 * the server is the only authority on whether a session is still valid, and a
 * cookie in the browser proves nothing on its own.
 *
 * This is usability, not security. Every admin endpoint re-checks the session
 * server-side; a client that skips this gate gains nothing but a broken screen.
 */

const SessionContext = createContext<AdminSession | null>(null);

export function useAdminSession(): AdminSession | null {
  return useContext(SessionContext);
}

export function SessionGate() {
  const [status, setStatus] = useState<'checking' | 'ready' | 'anonymous'>('checking');
  const [session, setSession] = useState<AdminSession | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchSession().then((result) => {
      if (cancelled) return;
      setSession(result);
      setStatus(result ? 'ready' : 'anonymous');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page">
        <p className="text-sm text-muted">Checking your session…</p>
      </div>
    );
  }

  if (status === 'anonymous') {
    return <Navigate to="/admin/login" replace />;
  }

  return (
    <SessionContext.Provider value={session}>
      <Outlet />
    </SessionContext.Provider>
  );
}
