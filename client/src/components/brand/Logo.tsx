import monochromeLogo from '../../assets/brand/chosen-school-logo-monochrome.png';
import navyLogo from '../../assets/brand/chosen-school-logo-navy.png';
import blueLogo from '../../assets/brand/chosen-school-logo-blue.png';
import goldLogo from '../../assets/brand/chosen-school-logo-gold.png';
import reverseLogo from '../../assets/brand/chosen-school-logo-reverse.png';

/**
 * The official Chosen School crest.
 *
 * These files are the supplied artwork, recoloured — not redrawn. The geometry,
 * proportions and lettering are the school's; only the ink colour changes. See
 * docs/DESIGN.md §2.5 for how the variants were produced and why a two-tone
 * version is not among them.
 *
 * Pick the variant by background, never by preference:
 *   - `navy`       light backgrounds (cream, white) — the default
 *   - `blue`       where the crest should match a brand-blue surface
 *   - `reverse`    deep navy / brand blue backgrounds
 *   - `monochrome` documents, print, anything that must stay black
 *   - `gold`       decorative use only; not for primary branding
 */
export const LOGO_VARIANTS = ['navy', 'blue', 'reverse', 'monochrome', 'gold'] as const;
export type LogoVariant = (typeof LOGO_VARIANTS)[number];

const SOURCES: Record<LogoVariant, string> = {
  navy: navyLogo,
  blue: blueLogo,
  reverse: reverseLogo,
  monochrome: monochromeLogo,
  gold: goldLogo,
};

/** Intrinsic size of every variant, so the browser reserves space before load. */
const INTRINSIC = { width: 512, height: 523 } as const;

export interface LogoProps {
  variant?: LogoVariant;
  /** Rendered height in pixels. Width follows the intrinsic ratio. */
  height?: number;
  /**
   * Alt text. Pass `""` when the crest sits next to the school name as visible
   * text — otherwise a screen reader announces "Chosen School" twice.
   */
  alt?: string;
  className?: string;
}

export function Logo({ variant = 'navy', height = 48, alt = 'Chosen School', className }: LogoProps) {
  const width = Math.round((height * INTRINSIC.width) / INTRINSIC.height);

  return (
    <img
      src={SOURCES[variant]}
      width={width}
      height={height}
      alt={alt}
      // Decorative crests are common in footers; the empty alt above is the
      // accessible way to say so, and this keeps the rule explicit.
      aria-hidden={alt === '' ? true : undefined}
      decoding="async"
      className={className}
      style={{ height, width }}
    />
  );
}
