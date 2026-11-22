import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { RichTextEditor } from '../../components/admin/RichTextEditor';
import { useAdminSession } from '../../components/admin/SessionGate';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { Select } from '../../components/ui/Select';
import { StatusBadge } from '../../components/ui/StatusBadge';
import {
  createAnnouncement,
  fetchAnnouncement,
  fetchCategories,
  publishAnnouncement,
  updateAnnouncement,
  type AdminAnnouncement,
  type AnnouncementInput,
  type AnnouncementKind,
  type CategoryItem,
} from '../../lib/admin-api';
import { fromSchoolLocalInput, toSchoolLocalInput } from '../../lib/dates';

/**
 * Announcement / event editor — FR-026, FR-027, DESIGN.md §6.7.
 *
 * - Event-only fields appear only for events (DESIGN: "do not show irrelevant
 *   fields for the selected content type").
 * - **Save draft** never publishes. **Save and publish** saves first, then calls
 *   the separate publish action; if publishing fails, the saved draft and the
 *   form are both kept for correction.
 * - Expiry is entered in school time (UTC+1) and sent as an explicit instant.
 * - Leaving with unsaved changes asks first.
 */

interface FormState {
  kind: AnnouncementKind;
  title: string;
  categoryId: string;
  body: string;
  isUrgent: boolean;
  expiresAt: string;
  startDate: string;
  endDate: string;
}

const EMPTY: FormState = {
  kind: 'announcement',
  title: '',
  categoryId: '',
  body: '',
  isUrgent: false,
  expiresAt: '',
  startDate: '',
  endDate: '',
};

function fromRecord(record: AdminAnnouncement): FormState {
  return {
    kind: record.kind,
    title: record.title,
    categoryId: record.category?.id ?? '',
    body: record.body,
    isUrgent: record.isUrgent,
    expiresAt: toSchoolLocalInput(record.expiresAt),
    startDate: record.event?.startDate.slice(0, 10) ?? '',
    endDate: record.event?.endDate.slice(0, 10) ?? '',
  };
}

function toInput(form: FormState): AnnouncementInput {
  return {
    kind: form.kind,
    title: form.title.trim(),
    categoryId: form.categoryId || null,
    body: form.body,
    isUrgent: form.isUrgent,
    expiresAt: fromSchoolLocalInput(form.expiresAt),
    event: form.kind === 'event' ? { startDate: form.startDate, endDate: form.endDate || form.startDate } : null,
  };
}

export default function AdminAnnouncementEditor() {
  const { id } = useParams();
  const isNew = !id;
  const session = useAdminSession();
  const navigate = useNavigate();

  const [record, setRecord] = useState<AdminAnnouncement | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(isNew);
  const [dirty, setDirty] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetchCategories().then((result) => {
      if (result.ok) setCategories(result.data.data);
    });
    if (!id) return;
    void fetchAnnouncement(id).then((result) => {
      if (result.ok) {
        setRecord(result.data);
        setForm(fromRecord(result.data));
        setReady(true);
      } else {
        setLoadError(result.status === 404 ? 'That item could not be found.' : result.message);
      }
    });
  }, [id]);

  // Closing the tab or reloading with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setNotice(null);
  }

  function validate(): Record<string, string> {
    const found: Record<string, string> = {};
    if (!form.title.trim()) found.title = 'Title is required';
    if (!form.body.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()) found.body = 'Content is required';
    if (form.kind === 'event' && !form.startDate) found['event.startDate'] = 'Start date is required';
    if (form.kind === 'event' && form.endDate && form.startDate && form.endDate < form.startDate) {
      found['event.endDate'] = 'The end date cannot be before the start date';
    }
    return found;
  }

  async function save(andPublish: boolean) {
    if (!session || saving) return;
    setFormError(null);
    setNotice(null);
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      summaryRef.current?.focus();
      return;
    }

    setSaving(true);
    const input = toInput(form);
    const saved = record ? await updateAnnouncement(record.id, input, session.csrfToken) : await createAnnouncement(input, session.csrfToken);

    if (!saved.ok) {
      setSaving(false);
      setErrors(saved.fields ?? {});
      setFormError(saved.message);
      summaryRef.current?.focus();
      return;
    }

    setRecord(saved.data);
    setDirty(false);

    if (andPublish && saved.data.status === 'draft') {
      const published = await publishAnnouncement(saved.data.id, session.csrfToken);
      setSaving(false);
      if (!published.ok) {
        // The draft is saved; say so, and leave everything on screen.
        setFormError(`Saved as a draft, but publishing failed: ${published.message}`);
        if (isNew) navigate(`/admin/news/${saved.data.id}`, { replace: true });
        return;
      }
      navigate('/admin/news', { replace: true });
      return;
    }

    setSaving(false);
    setNotice(saved.data.status === 'published' ? 'Changes saved and live.' : 'Draft saved. It is not public.');
    if (isNew) navigate(`/admin/news/${saved.data.id}`, { replace: true });
  }

  function cancel() {
    if (dirty && !window.confirm('Leave without saving your changes?')) return;
    navigate('/admin/news');
  }

  const errorList = Object.entries(errors);
  const published = record?.status === 'published';

  return (
    <AdminLayout>
      <div className="max-w-3xl py-8">
        <p>
          <Link to="/admin/news" onClick={(event) => { event.preventDefault(); cancel(); }} className="text-sm font-medium text-brand underline hover:text-brand-hover">
            ← Back to news &amp; events
          </Link>
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-brand-dark">{isNew ? 'New item' : 'Edit item'}</h1>
          {record && <StatusBadge tone={published ? (record.isExpired ? 'warning' : 'success') : 'neutral'}>{published ? (record.isExpired ? 'Expired' : 'Published') : 'Draft'}</StatusBadge>}
        </div>
        {published && <p className="mt-1 text-sm text-muted">This item is public. Saving updates it on the site straight away.</p>}

        {loadError && (
          <div role="alert" className="mt-6 rounded-[var(--radius-card)] border border-danger/30 bg-danger-soft p-4">
            <p className="text-sm font-medium text-danger">{loadError}</p>
          </div>
        )}

        <div ref={summaryRef} tabIndex={-1} aria-live="polite">
          {errorList.length > 0 && (
            <div role="alert" className="mt-6 rounded-[var(--radius-card)] border border-danger/30 bg-danger-soft p-4">
              <p className="text-sm font-semibold text-danger">Please correct {errorList.length} {errorList.length === 1 ? 'field' : 'fields'}</p>
              <ul className="mt-2 list-inside list-disc text-sm text-ink">
                {errorList.map(([path, text]) => (
                  <li key={path}>{text}</li>
                ))}
              </ul>
            </div>
          )}
          {formError && errorList.length === 0 && (
            <div role="alert" className="mt-6 rounded-[var(--radius-card)] border border-danger/30 bg-danger-soft p-4">
              <p className="text-sm font-medium text-danger">{formError}</p>
            </div>
          )}
          {notice && (
            <p role="status" className="mt-6 text-sm font-medium text-success">
              {notice}
            </p>
          )}
        </div>

        {ready && session && (
          <form
            className="mt-6 space-y-6"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void save(false);
            }}
          >
            <fieldset>
              <legend className="text-sm font-medium text-ink">Type (required)</legend>
              <div className="mt-2 flex gap-6">
                {(['announcement', 'event'] as const).map((value) => (
                  <label key={value} className="flex items-center gap-2 text-base text-ink">
                    <input type="radio" name="kind" value={value} checked={form.kind === value} onChange={() => update('kind', value)} />
                    {value === 'announcement' ? 'Announcement' : 'Event'}
                  </label>
                ))}
              </div>
            </fieldset>

            <Field id="title" label="Title (required)" maxLength={160} value={form.title} error={errors.title} onChange={(event) => update('title', event.target.value)} />

            <Select
              id="category"
              label="Category (optional)"
              placeholder="No category"
              options={categories.map((category) => ({ value: category.id, label: category.name }))}
              value={form.categoryId}
              error={errors.categoryId}
              hint={categories.length === 0 ? 'No categories yet. Add them under Categories.' : undefined}
              onChange={(event) => update('categoryId', event.target.value)}
            />

            {form.kind === 'event' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="start-date" type="date" label="Start date (required)" value={form.startDate} error={errors['event.startDate']} onChange={(event) => update('startDate', event.target.value)} />
                <Field
                  id="end-date"
                  type="date"
                  label="End date (optional)"
                  hint="Leave empty for a one-day event."
                  min={form.startDate || undefined}
                  value={form.endDate}
                  error={errors['event.endDate']}
                  onChange={(event) => update('endDate', event.target.value)}
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <span id="body-label" className="text-sm font-medium text-ink">
                Content (required)
              </span>
              <RichTextEditor
                key={record?.id ?? 'new'}
                id="body"
                labelId="body-label"
                initialHtml={form.body}
                error={errors.body}
                describedBy={errors.body ? 'body-error' : undefined}
                onChange={(html) => update('body', html)}
              />
              {errors.body && (
                <p id="body-error" className="text-sm font-medium text-danger">
                  {errors.body}
                </p>
              )}
            </div>

            <label className="flex items-start gap-2 text-base text-ink">
              <input type="checkbox" className="mt-1" checked={form.isUrgent} onChange={(event) => update('isUrgent', event.target.checked)} />
              <span>
                Mark as urgent
                <span className="block text-sm text-muted">Highlights it on the site. It still has to be published like any other item.</span>
              </span>
            </label>

            <Field
              id="expires-at"
              type="datetime-local"
              label="Hide from the site after (optional)"
              hint="School time (WAT). Leave empty to keep it up until you unpublish it."
              value={form.expiresAt}
              error={errors.expiresAt}
              onChange={(event) => update('expiresAt', event.target.value)}
            />

            <div className="flex flex-wrap gap-2 border-t border-line pt-6">
              {!published && (
                <Button type="button" disabled={saving} onClick={() => void save(true)}>
                  {saving ? 'Saving…' : 'Save and publish'}
                </Button>
              )}
              <Button type="submit" variant={published ? 'primary' : 'secondary'} disabled={saving}>
                {published ? 'Save changes' : 'Save draft'}
              </Button>
              <Button type="button" variant="ghost" disabled={saving} onClick={cancel}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </AdminLayout>
  );
}
