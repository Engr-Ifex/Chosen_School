import type { InputHTMLAttributes } from 'react';

/**
 * A labelled text input.
 *
 * The accessibility wiring is the point, not decoration:
 *  - the label is bound with `htmlFor`/`id`, so clicking it focuses the input;
 *  - the hint and the error are linked with `aria-describedby`, so a screen
 *    reader reads them with the field rather than leaving them stranded;
 *  - `aria-invalid` marks the field itself, because a red border alone tells a
 *    colour-blind user nothing.
 *
 * Error text is rendered *and* announced — the message is never carried by
 * colour only (docs/DESIGN.md §2.3).
 */
export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  id: string;
  label: string;
  hint?: string;
  error?: string;
}

export function Field({ id, label, hint, error, className = '', ...rest }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>

      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={
          'h-11 w-full rounded-[var(--radius-control)] border bg-surface px-3 text-base text-ink ' +
          'placeholder:text-muted transition-colors ' +
          'focus-visible:outline-2 focus-visible:outline-offset-2 ' +
          'disabled:cursor-not-allowed disabled:bg-brand-soft disabled:text-muted ' +
          (error
            ? 'border-danger focus-visible:outline-danger '
            : 'border-line hover:border-brand/60 focus-visible:outline-accent-strong ') +
          className
        }
        {...rest}
      />

      {hint && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}

      {error && (
        <p id={errorId} className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
