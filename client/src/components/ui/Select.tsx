import type { SelectHTMLAttributes } from 'react';

/**
 * A labelled select. Same accessibility wiring as `Field`: bound label,
 * described hint and error, `aria-invalid` on the control itself.
 */
export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}

export function Select({
  id,
  label,
  hint,
  error,
  options,
  placeholder,
  className = '',
  ...rest
}: SelectProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>

      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={
          'h-11 w-full rounded-[var(--radius-control)] border bg-surface px-3 text-base text-ink ' +
          'focus-visible:outline-2 focus-visible:outline-offset-2 ' +
          'disabled:cursor-not-allowed disabled:bg-brand-soft disabled:text-muted ' +
          (error ? 'border-danger focus-visible:outline-danger ' : 'border-line ') +
          className
        }
        {...rest}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

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
