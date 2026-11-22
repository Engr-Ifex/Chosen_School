import { useRef, useState } from 'react';
import { Button } from '../components/ui/Button';
import { Container } from '../components/ui/Container';
import { Field } from '../components/ui/Field';
import { Select } from '../components/ui/Select';
import { Textarea } from '../components/ui/Textarea';
import { submitEnquiry, submitVisitRequest, type FieldErrors, type FormResult } from '../lib/api';
import { ENQUIRY_SUCCESS_MESSAGE, VISIT_REQUEST_SUCCESS_MESSAGE } from '../lib/messages';

/**
 * Contact page — FR-023, FR-024, DESIGN.md §4.8.
 *
 * Two visually separate forms, each with its own heading, submit action and
 * confirmation. Success is shown only after the server confirms saving, and the
 * visit confirmation says the request was received, not booked.
 *
 * School contact details (address, phone, map) are **not** shown yet: DESIGN.md
 * says to display only school-approved details, and those arrive with the
 * settings screen (S18). Inventing them here would publish something the
 * school never approved.
 */

type FieldKind = 'text' | 'tel' | 'email' | 'section' | 'date' | 'time' | 'textarea';

interface FieldSpec {
  name: string;
  label: string;
  kind: FieldKind;
  required: boolean;
  hint?: string;
  maxLength?: number;
}

const SECTION_OPTIONS = [
  { value: 'primary', label: 'Primary' },
  { value: 'secondary', label: 'Secondary' },
];

/** Today's date as `YYYY-MM-DD` in the visitor's own time zone, for the date picker. */
function todayLocal(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const CONTACT_FIELDS: FieldSpec[] = [
  { name: 'name', label: 'Parent or guardian name', kind: 'text', required: true, maxLength: 120 },
  { name: 'phone', label: 'Phone number', kind: 'tel', required: true },
  { name: 'email', label: 'Email address', kind: 'email', required: false, maxLength: 254 },
  { name: 'section', label: 'Section you are interested in', kind: 'section', required: true },
];

const ENQUIRY_FIELDS: FieldSpec[] = [
  ...CONTACT_FIELDS,
  { name: 'message', label: 'Your message', kind: 'textarea', required: true, maxLength: 2000 },
];

const VISIT_FIELDS: FieldSpec[] = [
  ...CONTACT_FIELDS,
  { name: 'preferredDate', label: 'Preferred date', kind: 'date', required: true },
  {
    name: 'preferredTime',
    label: 'Preferred time',
    kind: 'time',
    required: true,
    hint: 'The school will confirm or suggest another time.',
  },
  { name: 'message', label: 'Anything we should know', kind: 'textarea', required: false, maxLength: 1000 },
];

interface InboxFormProps {
  idPrefix: string;
  heading: string;
  intro: string;
  fields: FieldSpec[];
  submitLabel: string;
  successHeading: string;
  successMessage: string;
  submit: (body: Record<string, string>) => Promise<FormResult>;
}

function InboxForm({
  idPrefix,
  heading,
  intro,
  fields,
  submitLabel,
  successHeading,
  successMessage,
  submit,
}: InboxFormProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const headingId = `${idPrefix}-heading`;

  const idFor = (name: string) => `${idPrefix}-${name}`;
  const labelFor = (name: string) => fields.find((field) => field.name === name)?.label ?? name;

  function update(name: string, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
    if (errors[name]) {
      setErrors((current) => {
        const next = { ...current };
        delete next[name];
        return next;
      });
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setFormError(null);

    const missing: FieldErrors = {};
    for (const field of fields) {
      if (field.required && (values[field.name] ?? '').trim() === '') {
        missing[field.name] = `${field.label} is required.`;
      }
    }
    if (Object.keys(missing).length > 0) {
      setErrors(missing);
      summaryRef.current?.focus();
      return;
    }

    // Empty optional fields are left out rather than sent as "".
    const body: Record<string, string> = {};
    for (const field of fields) {
      const value = (values[field.name] ?? '').trim();
      if (value !== '') body[field.name] = value;
    }

    setSubmitting(true);
    const result = await submit(body);
    setSubmitting(false);

    if (result.ok) {
      setSubmitted(true);
      return;
    }

    if (result.kind === 'validation') {
      setErrors(result.fields);
      setFormError(result.message);
    } else {
      // 'failure' or 'unknown': the input is kept either way.
      setFormError(result.message);
    }
    summaryRef.current?.focus();
  }

  if (submitted) {
    return (
      <section aria-labelledby={headingId} className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
        <h2 id={headingId} className="text-xl font-semibold text-brand-dark">
          {heading}
        </h2>
        <div role="status" className="mt-4 rounded-[var(--radius-card)] border border-success/30 bg-success-soft p-4">
          <p className="font-semibold text-success">{successHeading}</p>
          <p className="mt-1 text-base text-ink">{successMessage}</p>
        </div>
        <p className="mt-4 text-sm text-muted">No automatic email or message is sent.</p>
      </section>
    );
  }

  const errorList = Object.entries(errors);

  return (
    <section aria-labelledby={headingId} className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
      <h2 id={headingId} className="text-xl font-semibold text-brand-dark">
        {heading}
      </h2>
      <p className="mt-2 text-sm text-ink">{intro}</p>

      <div ref={summaryRef} tabIndex={-1} aria-live="polite">
        {errorList.length > 0 && (
          <div role="alert" className="mt-4 rounded-[var(--radius-card)] border border-danger/30 bg-danger-soft p-4">
            <p className="text-sm font-semibold text-danger">
              Please correct {errorList.length} {errorList.length === 1 ? 'field' : 'fields'}
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1">
              {errorList.map(([name, message]) => (
                <li key={name} className="text-sm text-ink">
                  <a href={`#${idFor(name)}`} className="underline">
                    {message.startsWith(labelFor(name)) ? message : `${labelFor(name)}: ${message}`}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        {formError && errorList.length === 0 && (
          <div role="alert" className="mt-4 rounded-[var(--radius-card)] border border-danger/30 bg-danger-soft p-4">
            <p className="text-sm font-medium text-danger">{formError}</p>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-5">
        {fields.map((field) => {
          const id = idFor(field.name);
          const label = field.required ? `${field.label} (required)` : `${field.label} (optional)`;
          const common = {
            id,
            label,
            hint: field.hint,
            error: errors[field.name],
            value: values[field.name] ?? '',
            required: field.required,
          };

          if (field.kind === 'section') {
            return (
              <Select
                key={field.name}
                {...common}
                options={SECTION_OPTIONS}
                placeholder="Choose a section"
                onChange={(event) => update(field.name, event.target.value)}
              />
            );
          }

          if (field.kind === 'textarea') {
            return (
              <Textarea
                key={field.name}
                {...common}
                rows={5}
                maxLength={field.maxLength}
                onChange={(event) => update(field.name, event.target.value)}
              />
            );
          }

          return (
            <Field
              key={field.name}
              {...common}
              type={field.kind}
              maxLength={field.maxLength}
              min={field.kind === 'date' ? todayLocal() : undefined}
              autoComplete={
                field.name === 'name' ? 'name' : field.kind === 'tel' ? 'tel' : field.kind === 'email' ? 'email' : undefined
              }
              onChange={(event) => update(field.name, event.target.value)}
            />
          );
        })}

        <Button type="submit" disabled={submitting}>
          {submitting ? 'Sending…' : submitLabel}
        </Button>
      </form>
    </section>
  );
}

export default function Contact() {
  return (
    <Container>
      <div className="py-10">
        <h1 className="text-3xl font-semibold text-brand-dark">Contact the school</h1>
        <p className="mt-3 max-w-3xl text-base text-ink">
          Send a question, or ask to visit the school. You do not need an account. The school reads
          every message and follows up personally.
        </p>

        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          <InboxForm
            idPrefix="enquiry"
            heading="Send an enquiry"
            intro="Ask about admissions, classes or anything else."
            fields={ENQUIRY_FIELDS}
            submitLabel="Send enquiry"
            successHeading="Enquiry received"
            successMessage={ENQUIRY_SUCCESS_MESSAGE}
            submit={submitEnquiry}
          />
          <InboxForm
            idPrefix="visit"
            heading="Request a school visit"
            intro="Tell us when you would like to visit. This is a request: the school will contact you to confirm a time or suggest another."
            fields={VISIT_FIELDS}
            submitLabel="Request a visit"
            successHeading="Visit request received"
            successMessage={VISIT_REQUEST_SUCCESS_MESSAGE}
            submit={submitVisitRequest}
          />
        </div>
      </div>
    </Container>
  );
}
