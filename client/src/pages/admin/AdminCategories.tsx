import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { useAdminSession } from '../../components/admin/SessionGate';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { createCategory, deleteCategory, fetchCategories, renameCategory, type CategoryItem } from '../../lib/admin-api';

/**
 * News & events categories — FR-027, API_SPEC §4.9, ADR-024.
 *
 * The school supplies the list (FR-027: "documented before implementation");
 * nothing is pre-filled. A category in use cannot be deleted — the server
 * answers 409 with how many items use it, and that message is shown as is.
 */
export default function AdminCategories() {
  const session = useAdminSession();
  const [items, setItems] = useState<CategoryItem[]>([]);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await fetchCategories();
    if (result.ok) setItems(result.data.data);
    else setMessage({ tone: 'danger', text: result.message });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<{ ok: boolean; message?: string }>, done: string) {
    setBusy(true);
    setMessage(null);
    const result = await action();
    setBusy(false);
    if (result.ok) {
      setMessage({ tone: 'success', text: done });
      setEditing(null);
      await load();
      return true;
    }
    setMessage({ tone: 'danger', text: result.message ?? 'Something went wrong.' });
    return false;
  }

  return (
    <AdminLayout>
      <div className="max-w-2xl py-8">
        <p>
          <Link to="/admin/news" className="text-sm font-medium text-brand underline hover:text-brand-hover">
            ← Back to news &amp; events
          </Link>
        </p>
        <h1 className="mt-4 text-2xl font-semibold text-brand-dark">News &amp; events categories</h1>
        <p className="mt-1 text-sm text-muted">For example: Resumption, Examinations, Holidays, PTA meetings. Use the names the school has agreed.</p>

        {session && (
          <form
            className="mt-6 flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!name.trim()) return;
              void run(() => createCategory(name.trim(), session.csrfToken), `Added “${name.trim()}”.`).then((ok) => ok && setName(''));
            }}
          >
            <div className="flex-1">
              <Field id="new-category" label="New category" maxLength={60} value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <Button type="submit" disabled={busy || !name.trim()}>
              Add
            </Button>
          </form>
        )}

        <div aria-live="polite">
          {message && (
            <p role={message.tone === 'danger' ? 'alert' : 'status'} className={'mt-4 text-sm font-medium ' + (message.tone === 'danger' ? 'text-danger' : 'text-success')}>
              {message.text}
            </p>
          )}
        </div>

        <ul className="mt-6 divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface">
          {items.length === 0 && <li className="p-4 text-muted">No categories yet.</li>}
          {session &&
            items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-2 p-3">
                {editing?.id === item.id ? (
                  <form
                    className="flex flex-1 items-end gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void run(() => renameCategory(item.id, editing.name.trim(), session.csrfToken), 'Renamed.');
                    }}
                  >
                    <div className="flex-1">
                      <Field id={`rename-${item.id}`} label={`Rename ${item.name}`} maxLength={60} value={editing.name} onChange={(event) => setEditing({ id: item.id, name: event.target.value })} />
                    </div>
                    <Button type="submit" size="sm" disabled={busy || !editing.name.trim()}>
                      Save
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </form>
                ) : (
                  <>
                    <span className="flex-1 text-base text-ink">{item.name}</span>
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => setEditing({ id: item.id, name: item.name })}>
                      Rename<span className="sr-only"> {item.name}</span>
                    </Button>
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run(() => deleteCategory(item.id, session.csrfToken), `Deleted “${item.name}”.`)}>
                      Delete<span className="sr-only"> {item.name}</span>
                    </Button>
                  </>
                )}
              </li>
            ))}
        </ul>
      </div>
    </AdminLayout>
  );
}
