import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * Buttons.
 *
 * Colour rules from docs/DESIGN.md §2.4, and the reason each variant exists:
 *
 *  - `primary`  brand blue with white text. The one main action per region.
 *  - `accent`   **warm gold with deep navy text.** The brief offers two options
 *               for gold buttons: deep gold with white text, or warm gold with
 *               navy text. Only the second reaches AA — deep gold behind white
 *               measures 3.65:1, below the 4.5:1 needed for normal-size text.
 *               The hover state lightens the gold, which *increases* contrast
 *               against the navy label rather than reducing it.
 *  - `secondary` surface with a border. Quieter than primary, still clearly a
 *               control.
 *  - `ghost`    text-only, for tertiary actions and toolbars.
 *  - `danger`   destructive actions, visually distinct from every brand colour.
 *
 * Hover and active states shift the background; `disabled` removes both and
 * drops opacity, but never removes the control from the layout.
 */
export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] font-medium ' +
  'transition-colors duration-150 select-none ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 ' +
  'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-inherit';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-hover active:bg-brand-dark',
  accent: 'bg-accent text-brand-dark hover:bg-[#e5ac47] active:bg-[#eab35a]',
  secondary:
    'bg-surface text-brand-dark border border-line hover:bg-brand-soft active:bg-[#dcebf7]',
  ghost: 'bg-transparent text-brand-dark hover:bg-brand-soft active:bg-[#dcebf7]',
  danger: 'bg-danger text-white hover:bg-[#9f1717] active:bg-[#8a1414]',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-5 text-base',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      // Defaulting to `button` prevents an accidental form submit — a real
      // hazard on the admission form, where the wrong default loses an entry.
      type={type}
      className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
