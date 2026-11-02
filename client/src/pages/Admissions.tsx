import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Container } from '../components/ui/Container';
import { Field } from '../components/ui/Field';
import { Select } from '../components/ui/Select';
import { Textarea } from '../components/ui/Textarea';
import {
  EMPTY_FORM,
  REQUIRED_FIELDS,
  classesForSection,
  fieldForPath,
  pathFor,
  toPayload,
  type AdmissionFormValues,
} from '../lib/admission-form';
import { fetchPlacementOptions, submitApplication, type FieldErrors, type PlacementOptions } from '../lib/api';
import { SUBMISSION_SUCCESS_MESSAGE } from '../lib/messages';

/**
 * The admission form — docs/DESIGN.md §4.4, ROADMAP S04.
 *
 * Two rules drive most of this component:
 *
 *  1. **Success is shown only on a confirmed `201`.** Anything else — a 422, a
 *     500, a timeout — keeps the parent's answers on screen. Losing a
 *     half-completed application is the failure that actually hurts.
 *  2. **The server owns validation.** Local checks only cover presence, so the
 *     browser can say "this is empty" without a round trip. Every other rule
 *     comes back as a `fields` map keyed by dotted path, and is rendered
 *     against the input it belongs to. No limit is written twice.
 */

const idFor = (field: string): string => `field-${field.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

export default function Admissions() {
  const [values, setValues] = useState<AdmissionFormValues>(EMPTY_FORM);
  const [options, setOptions] = useState<PlacementOptions | null>(null);
  const [optionsFailed, setOptionsFailed] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const summaryRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchPlacementOptions().then((result) => {
      if (cancelled) return;
      if (result) {
        setOptions(result);
        if (result.currentSession) {
          setValues((current) => ({ ...current, academicSession: result.currentSession ?? '' }));
        }
      } else {
        setOptionsFailed(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const classes = useMemo(
    () => classesForSection(values.section, options),
    [values.section, options],
  );

  function setField<K extends keyof AdmissionFormValues>(field: K, value: AdmissionFormValues[K]) {
    setValues((current) => {
      const next = { ...current, [field]: value };
      // Changing section invalidates a class chosen from the other section.
      if (field === 'section') next.classApplyingFor = '';
      return next;
    });
    // Clear this field's error as soon as the parent edits it, so a stale
    // message never sits under a field they have already corrected.
    setErrors((current) => {
      const path = pathFor(field);
      if (!(path in current)) return current;
      const next = { ...current };
      delete next[path];
      return next;
    });
  }

  const errorFor = (field: keyof AdmissionFormValues): string | undefined =>
    errors[pathFor(field)];

  function missingRequired(): FieldErrors {
    const found: FieldErrors = {};
    for (const field of REQUIRED_FIELDS) {
      if (String(values[field] ?? '').trim() === '') {
        found[pathFor(field)] = 'This field is required.';
      }
    }
    return found;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setFormError(null);

    const missing = missingRequired();
    if (Object.keys(missing).length > 0) {
      setErrors(missing);
      // Move focus to the summary so a keyboard or screen-reader user is told
      // what happened instead of being left at the bottom of a long form.
      summaryRef.current?.focus();
      return;
    }

    setSubmitting(true);
    const result = await submitApplication(toPayload(values));
    setSubmitting(false);

    if (result.ok) {
      setSubmitted(true);
      return;
    }

    if (result.kind === 'validation') {
      setErrors(result.fields);
      setFormError(result.message);
      summaryRef.current?.focus();
      return;
    }

    // 'failure' or 'unknown' — input is retained either way.
    setFormError(result.message);
    summaryRef.current?.focus();
  }

  if (submitted) {
    return (
      <Container size="prose">
        <div className="py-16">
          <div
            role="status"
            className="rounded-[var(--radius-card)] border border-success/30 bg-success-soft p-6"
          >
            <h1 className="text-xl font-semibold text-success">Application received</h1>
            <p className="mt-2 text-base text-ink">{SUBMISSION_SUCCESS_MESSAGE}</p>
          </div>

          <p className="mt-6 text-sm text-muted">
            No account is created and no email is sent. If the school needs anything further, they
            will contact you using the details you provided.
          </p>

          <p className="mt-6">
            <Link to="/" className="font-medium text-brand underline hover:text-brand-hover">
              Return to Homepage
            </Link>
          </p>
        </div>
      </Container>
    );
  }

  const errorList = Object.entries(errors);

  return (
    <Container size="prose">
      <div className="py-10">
        <h1 className="text-3xl font-semibold text-brand-dark">Apply for admission</h1>
        <p className="mt-3 text-base text-ink">
          Complete the form below to apply for a place at Chosen School. You do not need an account.
          Fields marked <span className="font-medium">(required)</span> must be completed.
        </p>

        {optionsFailed && (
          <div role="alert" className="mt-6 rounded-[var(--radius-card)] border border-warning/30 bg-warning-soft p-4">
            <p className="text-sm font-medium text-warning">
              We could not load the list of classes. Please refresh the page, or try again later.
            </p>
          </div>
        )}

        <div ref={summaryRef} tabIndex={-1} aria-live="polite">
          {errorList.length > 0 && (
            <div
              role="alert"
              className="mt-6 rounded-[var(--radius-card)] border border-danger/30 bg-danger-soft p-4"
            >
              <h2 className="text-sm font-semibold text-danger">
                Please correct {errorList.length} {errorList.length === 1 ? 'field' : 'fields'}
              </h2>
              <ul className="mt-2 list-inside list-disc space-y-1">
                {errorList.map(([path, message]) => {
                  const field = fieldForPath(path);
                  return (
                    <li key={path} className="text-sm text-ink">
                      {field ? (
                        <a href={`#${idFor(field)}`} className="underline">
                          {message}
                        </a>
                      ) : (
                        message
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {formError && errorList.length === 0 && (
            <div role="alert" className="mt-6 rounded-[var(--radius-card)] border border-danger/30 bg-danger-soft p-4">
              <p className="text-sm font-medium text-danger">{formError}</p>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-10">
          <fieldset className="space-y-5">
            <legend className="text-lg font-semibold text-brand-dark">Student information</legend>

            <Field
              id={idFor('surname')}
              label="Surname (required)"
              value={values.surname}
              onChange={(e) => setField('surname', e.target.value)}
              error={errorFor('surname')}
              autoComplete="family-name"
            />
            <Field
              id={idFor('firstName')}
              label="First name (required)"
              value={values.firstName}
              onChange={(e) => setField('firstName', e.target.value)}
              error={errorFor('firstName')}
              autoComplete="given-name"
            />
            <Field
              id={idFor('middleName')}
              label="Middle name"
              value={values.middleName}
              onChange={(e) => setField('middleName', e.target.value)}
              error={errorFor('middleName')}
            />
            <Field
              id={idFor('dateOfBirth')}
              label="Date of birth (required)"
              type="date"
              value={values.dateOfBirth}
              onChange={(e) => setField('dateOfBirth', e.target.value)}
              error={errorFor('dateOfBirth')}
              hint="Must be in the past."
            />
            <Select
              id={idFor('gender')}
              label="Gender (required)"
              value={values.gender}
              onChange={(e) => setField('gender', e.target.value)}
              error={errorFor('gender')}
              placeholder="Select…"
              options={[
                { value: 'female', label: 'Female' },
                { value: 'male', label: 'Male' },
              ]}
            />
            <Field
              id={idFor('religion')}
              label="Religion"
              value={values.religion}
              onChange={(e) => setField('religion', e.target.value)}
              error={errorFor('religion')}
            />
            <Field
              id={idFor('ethnicity')}
              label="Ethnicity"
              value={values.ethnicity}
              onChange={(e) => setField('ethnicity', e.target.value)}
              error={errorFor('ethnicity')}
            />
            <Field
              id={idFor('stateOfOrigin')}
              label="State of origin"
              value={values.stateOfOrigin}
              onChange={(e) => setField('stateOfOrigin', e.target.value)}
              error={errorFor('stateOfOrigin')}
            />
            <Field
              id={idFor('previousSchool')}
              label="Previous school"
              value={values.previousSchool}
              onChange={(e) => setField('previousSchool', e.target.value)}
              error={errorFor('previousSchool')}
            />
            <Field
              id={idFor('lastClassAttended')}
              label="Last class attended"
              value={values.lastClassAttended}
              onChange={(e) => setField('lastClassAttended', e.target.value)}
              error={errorFor('lastClassAttended')}
            />
          </fieldset>

          <fieldset className="space-y-5">
            <legend className="text-lg font-semibold text-brand-dark">
              Parent or guardian information
            </legend>

            <Field
              id={idFor('guardianName')}
              label="Full name (required)"
              value={values.guardianName}
              onChange={(e) => setField('guardianName', e.target.value)}
              error={errorFor('guardianName')}
              autoComplete="name"
            />
            <Textarea
              id={idFor('homeAddress')}
              label="Home address (required)"
              value={values.homeAddress}
              onChange={(e) => setField('homeAddress', e.target.value)}
              error={errorFor('homeAddress')}
              autoComplete="street-address"
            />
            <Field
              id={idFor('phone')}
              label="Phone number (required)"
              type="tel"
              inputMode="tel"
              value={values.phone}
              onChange={(e) => setField('phone', e.target.value)}
              error={errorFor('phone')}
              hint="Digits only, or with spaces and dashes — 7 to 15 digits."
              autoComplete="tel"
            />
            <Field
              id={idFor('email')}
              label="Email address"
              type="email"
              value={values.email}
              onChange={(e) => setField('email', e.target.value)}
              error={errorFor('email')}
              autoComplete="email"
            />
            <Field
              id={idFor('occupation')}
              label="Occupation"
              value={values.occupation}
              onChange={(e) => setField('occupation', e.target.value)}
              error={errorFor('occupation')}
            />
            <Textarea
              id={idFor('officeAddress')}
              label="Office address"
              value={values.officeAddress}
              onChange={(e) => setField('officeAddress', e.target.value)}
              error={errorFor('officeAddress')}
            />
          </fieldset>

          <fieldset className="space-y-5">
            <legend className="text-lg font-semibold text-brand-dark">School placement</legend>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">Section (required)</span>
              <div className="flex flex-wrap gap-6">
                {(['primary', 'secondary'] as const).map((section) => (
                  <label key={section} className="flex items-center gap-2 text-base text-ink">
                    <input
                      type="radio"
                      name="section"
                      id={idFor('section') + (section === 'primary' ? '' : '-secondary')}
                      value={section}
                      checked={values.section === section}
                      onChange={() => setField('section', section)}
                      className="h-4 w-4 accent-[var(--color-brand)]"
                    />
                    {section === 'primary' ? 'Primary' : 'Secondary'}
                  </label>
                ))}
              </div>
              {errorFor('section') && (
                <p className="text-sm font-medium text-danger">{errorFor('section')}</p>
              )}
            </div>

            <Select
              id={idFor('classApplyingFor')}
              label="Class applying for (required)"
              value={values.classApplyingFor}
              onChange={(e) => setField('classApplyingFor', e.target.value)}
              error={errorFor('classApplyingFor')}
              disabled={!values.section}
              placeholder={values.section ? 'Select…' : 'Choose a section first'}
              options={classes.map((name) => ({ value: name, label: name }))}
              hint="The list depends on the section you choose."
            />

            <Select
              id={idFor('academicSession')}
              label="Academic session (required)"
              value={values.academicSession}
              onChange={(e) => setField('academicSession', e.target.value)}
              error={errorFor('academicSession')}
              placeholder="Select…"
              options={(options?.sessions ?? []).map((name) => ({ value: name, label: name }))}
            />
          </fieldset>

          <fieldset className="space-y-5">
            <legend className="text-lg font-semibold text-brand-dark">
              Additional information
            </legend>

            <Textarea
              id={idFor('healthInformation')}
              label="Health information or special needs"
              value={values.healthInformation}
              onChange={(e) => setField('healthInformation', e.target.value)}
              error={errorFor('healthInformation')}
              hint="Optional. Only share what the school needs to care for your child. This is seen only by the school administrator."
            />
          </fieldset>

          <fieldset className="space-y-5">
            <legend className="text-lg font-semibold text-brand-dark">Signature</legend>

            <Field
              id={idFor('typedName')}
              label="Type your full name (required)"
              value={values.typedName}
              onChange={(e) => setField('typedName', e.target.value)}
              error={errorFor('typedName')}
              hint="Typing your name records that you have completed this form. It is not a legal signature."
            />
          </fieldset>

          <div className="flex flex-wrap items-center gap-4 border-t border-line pt-6">
            <Button type="submit" disabled={submitting || optionsFailed}>
              {submitting ? 'Submitting…' : 'Submit application'}
            </Button>
            <p className="text-sm text-muted">
              {submitting
                ? 'Please wait — do not close this page.'
                : 'You will see a confirmation once the application is saved.'}
            </p>
          </div>
        </form>
      </div>
    </Container>
  );
}
