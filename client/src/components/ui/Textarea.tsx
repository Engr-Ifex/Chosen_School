import type { TextareaHTMLAttributes } from 'react';

/** A labelled textarea, wired the same way as `Field`. */
export interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  id: string;
  label: string;
  hint?: string;
  error?: string;
}

export function Textarea({
  id,
  label,
  hint,
  error,
  className = '',
  rows = 4,
  ...rest
}: TextareaProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>

      <textarea
        id={id}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={
          'w-full rounded-[var(--radius-control)] border bg-surface px-3 py-2 text-base text-ink ' +
          'placeholder:text-muted transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ' +
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
