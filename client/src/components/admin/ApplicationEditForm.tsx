import { useEffect, useMemo, useState } from 'react';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import { updateApplication, type ApplicationDetail } from '../../lib/admin-api';
import { fetchPlacementOptions, type PlacementOptions } from '../../lib/api';

/**
 * Edit mode for one application — DESIGN.md §6.4.
 *
 * **Only changed fields are sent.** The server compares whatever arrives against
 * the stored record and writes a revision for the differences, so sending the
 * whole form would still be correct — but sending the diff makes the request
 * honest about its intent and keeps the revision's `changedFields` obviously
 * derived from what the administrator actually touched.
 *
 * The section and class are edited together: the server rejects a pair that does
 * not belong together, so the class list follows the chosen section here rather
 * than letting the administrator discover that on save.
 */

const STUDENT_TEXT_FIELDS = [
  ['surname', 'Surname', 80],
  ['firstName', 'First name', 80],
  ['middleName', 'Middle name', 80],
  ['religion', 'Religion', 60],
  ['ethnicity', 'Ethnicity', 60],
  ['stateOfOrigin', 'State of origin', 60],
  ['previousSchool', 'Previous school', 120],
  ['lastClassAttended', 'Last class attended', 60],
] as const;

interface Props {
  record: ApplicationDetail;
  csrfToken: string;
  onSaved: (updated: ApplicationDetail) => void;
  onCancel: () => void;
}

type Values = Record<string, string>;

function initialValues(record: ApplicationDetail): Values {
  const read = (group: Record<string, unknown> | undefined, key: string): string => {
    const value = group?.[key];
    return value === null || value === undefined ? '' : String(value);
  };

  const values: Values = {
    'student.dateOfBirth': read(record.student, 'dateOfBirth').slice(0, 10),
    'student.gender': read(record.student, 'gender'),
    'guardian.name': read(record.guardian, 'name'),
    'guardian.homeAddress': read(record.guardian, 'homeAddress'),
    'guardian.phone': read(record.guardian, 'phone'),
    'guardian.email': read(record.guardian, 'email'),
    'guardian.occupation': read(record.guardian, 'occupation'),
    'guardian.officeAddress': read(record.guardian, 'officeAddress'),
    'placement.section': read(record.placement, 'section'),
    'placement.classApplyingFor': read(record.placement, 'classApplyingFor'),
    'placement.academicSession': read(record.placement, 'academicSession'),
    healthInformation: record.healthInformation ?? '',
  };

  for (const [key] of STUDENT_TEXT_FIELDS) {
    values[`student.${key}`] = read(record.student, key);
  }

  return values;
}

export function ApplicationEditForm({ record, csrfToken, onSaved, onCancel }: Props) {
  const original = useMemo(() => initialValues(record), [record]);
  const [values, setValues] = useState<Values>(original);
  const [options, setOptions] = useState<PlacementOptions | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    void fetchPlacementOptions().then(setOptions);
  }, []);

  const dirty = useMemo(
    () => Object.keys(values).some((key) => values[key] !== original[key]),
    [values, original],
  );

  const classes =
    values['placement.section'] === 'secondary'
      ? (options?.secondary ?? [])
      : (options?.primary ?? []);

  function set(key: string, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  /** Builds the nested body containing only fields that actually changed. */
  function buildChanges(): Record<string, unknown> {
    const body: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(values)) {
      if (value === original[key]) continue;

      if (key === 'healthInformation') {
        body.healthInformation = value;
        continue;
      }

      const [group, field] = key.split('.') as [string, string];
      const bucket = (body[group] as Record<string, string> | undefined) ?? {};
      bucket[field] = value;
      body[group] = bucket;
    }

    return body;
  }

  async function handleSave() {
    if (saving) return;

    const changes = buildChanges();
    if (Object.keys(changes).length === 0) {
      onCancel();
      return;
    }

    setSaving(true);
    setError(null);
    setFieldErrors({});

    const result = await updateApplication(record.id, csrfToken, changes);
    setSaving(false);

    if (!result.ok) {
      setError(result.message);
      setFieldErrors(result.fields ?? {});
      return;
    }

    onSaved(result.data);
  }

  function handleCancel() {
    // Unsaved work is discarded on cancel, so say so rather than losing it silently.
    if (dirty && !window.confirm('Discard your unsaved changes?')) return;
    onCancel();
  }

  const errorFor = (key: string) => fieldErrors[key];

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert" className="rounded-[var(--radius-card)] border border-danger/30 bg-danger-soft p-4">
          <p className="text-sm font-medium text-danger">{error}</p>
        </div>
      )}

      <section className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
        <h2 className="text-lg font-semibold text-brand-dark">Student information</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {STUDENT_TEXT_FIELDS.map(([key, label, max]) => (
            <Field
              key={key}
              id={`edit-student-${key}`}
              label={label}
              value={values[`student.${key}`] ?? ''}
              maxLength={max}
              onChange={(e) => set(`student.${key}`, e.target.value)}
              error={errorFor(`student.${key}`)}
            />
          ))}

          <Field
            id="edit-student-dateOfBirth"
            label="Date of birth"
            type="date"
            value={values['student.dateOfBirth'] ?? ''}
            onChange={(e) => set('student.dateOfBirth', e.target.value)}
            error={errorFor('student.dateOfBirth')}
          />

          <Select
            id="edit-student-gender"
            label="Gender"
            value={values['student.gender'] ?? ''}
            onChange={(e) => set('student.gender', e.target.value)}
            placeholder="Select…"
            options={[
              { value: 'female', label: 'Female' },
              { value: 'male', label: 'Male' },
            ]}
          />
        </div>
      </section>

      <section className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
        <h2 className="text-lg font-semibold text-brand-dark">Parent or guardian</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field
            id="edit-guardian-name"
            label="Name"
            value={values['guardian.name'] ?? ''}
            onChange={(e) => set('guardian.name', e.target.value)}
            error={errorFor('guardian.name')}
          />
          <Field
            id="edit-guardian-phone"
            label="Phone"
            value={values['guardian.phone'] ?? ''}
            onChange={(e) => set('guardian.phone', e.target.value)}
            error={errorFor('guardian.phone')}
          />
          <Field
            id="edit-guardian-email"
            label="Email"
            type="email"
            value={values['guardian.email'] ?? ''}
            onChange={(e) => set('guardian.email', e.target.value)}
            error={errorFor('guardian.email')}
          />
          <Field
            id="edit-guardian-occupation"
            label="Occupation"
            value={values['guardian.occupation'] ?? ''}
            onChange={(e) => set('guardian.occupation', e.target.value)}
          />
          <div className="sm:col-span-2">
            <Textarea
              id="edit-guardian-homeAddress"
              label="Home address"
              rows={2}
              value={values['guardian.homeAddress'] ?? ''}
              onChange={(e) => set('guardian.homeAddress', e.target.value)}
              error={errorFor('guardian.homeAddress')}
            />
          </div>
          <div className="sm:col-span-2">
            <Textarea
              id="edit-guardian-officeAddress"
              label="Office address"
              rows={2}
              value={values['guardian.officeAddress'] ?? ''}
              onChange={(e) => set('guardian.officeAddress', e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
        <h2 className="text-lg font-semibold text-brand-dark">School placement</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Select
            id="edit-placement-section"
            label="Section"
            value={values['placement.section'] ?? ''}
            onChange={(e) => {
              // The class must belong to the section, so clear it on change.
              set('placement.section', e.target.value);
              set('placement.classApplyingFor', '');
            }}
            placeholder="Select…"
            options={[
              { value: 'primary', label: 'Primary' },
              { value: 'secondary', label: 'Secondary' },
            ]}
          />
          <Select
            id="edit-placement-class"
            label="Class"
            value={values['placement.classApplyingFor'] ?? ''}
            onChange={(e) => set('placement.classApplyingFor', e.target.value)}
            placeholder="Select…"
            options={classes.map((name) => ({ value: name, label: name }))}
            error={errorFor('placement.classApplyingFor')}
          />
          <Field
            id="edit-placement-session"
            label="Academic session"
            value={values['placement.academicSession'] ?? ''}
            onChange={(e) => set('placement.academicSession', e.target.value)}
            error={errorFor('placement.academicSession')}
          />
        </div>
      </section>

      <section className="rounded-[var(--radius-card)] border border-warning/30 bg-warning-soft p-5">
        <h2 className="text-lg font-semibold text-warning">Health information and special needs</h2>
        <div className="mt-3">
          <Textarea
            id="edit-healthInformation"
            label="Health information"
            rows={4}
            value={values.healthInformation ?? ''}
            onChange={(e) => set('healthInformation', e.target.value)}
            error={errorFor('healthInformation')}
          />
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void handleSave()} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
        <Button variant="secondary" onClick={handleCancel} disabled={saving}>
          Cancel
        </Button>
        {dirty && <p className="text-sm text-muted">Unsaved changes</p>}
      </div>
    </div>
  );
}
