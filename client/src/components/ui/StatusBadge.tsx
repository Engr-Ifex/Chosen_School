import type { ReactNode } from 'react';

/**
 * Status labels for records and content.
 *
 * Two rules, both from docs/DESIGN.md §2.3:
 *
 *  1. **Colour is never the only signal.** Every badge carries a word. A parent
 *     with colour-vision deficiency, or a black-and-white printout, still reads
 *     the status.
 *  2. **Status colours are outside the brand hue family.** If "warning" were
 *     warm gold, it would read as brand decoration rather than a problem.
 */
export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONES: Record<StatusTone, string> = {
  success: 'bg-success-soft text-success border-success/30',
  warning: 'bg-warning-soft text-warning border-warning/30',
  danger: 'bg-danger-soft text-danger border-danger/30',
  info: 'bg-info-soft text-info border-info/30',
  neutral: 'bg-brand-soft text-brand-dark border-line',
};

export interface StatusBadgeProps {
  tone?: StatusTone;
  children: ReactNode;
}

export function StatusBadge({ tone = 'neutral', children }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
