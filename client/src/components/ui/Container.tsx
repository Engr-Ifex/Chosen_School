import type { ReactNode } from 'react';

/**
 * The page container. One max-width and one horizontal padding for the whole
 * site, so sections cannot drift out of alignment with each other.
 *
 * `size` exists for long-form text (legal pages, FAQs), which should not run the
 * full width of a content grid.
 */
export interface ContainerProps {
  children: ReactNode;
  size?: 'default' | 'prose';
  className?: string;
}

const WIDTHS = {
  default: 'max-w-6xl',
  prose: 'max-w-3xl',
} as const;

export function Container({ children, size = 'default', className = '' }: ContainerProps) {
  return (
    <div className={`mx-auto w-full ${WIDTHS[size]} px-4 sm:px-6 lg:px-8 ${className}`}>
      {children}
    </div>
  );
}
