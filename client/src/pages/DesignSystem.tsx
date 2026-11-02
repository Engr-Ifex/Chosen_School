import type { ReactNode } from 'react';
import { Logo } from '../components/brand/Logo';
import { Button } from '../components/ui/Button';
import { Container } from '../components/ui/Container';
import { Field } from '../components/ui/Field';
import { StatusBadge } from '../components/ui/StatusBadge';

/**
 * Design-system preview.
 *
 * This is **not the public website**. It is a specimen sheet: it shows the
 * approved brand tokens and the shared primitives rendering with them, so the
 * palette can be reviewed in one place. The real pages — home, pathways,
 * admissions, admin — arrive in ROADMAP S04 onwards.
 *
 * Deliberately not a fake homepage: inventing page structure here would create
 * something that has to be deleted, and would pre-empt decisions DESIGN.md has
 * not made yet.
 */

interface Swatch {
  name: string;
  token: string;
  hex: string;
  /** Text colour that is readable on this swatch. */
  on: 'light' | 'dark';
}

const PALETTE: Array<{ group: string; swatches: Swatch[] }> = [
  {
    group: 'Brand',
    swatches: [
      { name: 'Primary Blue', token: 'brand', hex: '#1769AA', on: 'light' },
      { name: 'Blue Hover', token: 'brand-hover', hex: '#12558D', on: 'light' },
      { name: 'Deep Navy', token: 'brand-dark', hex: '#123B5D', on: 'light' },
      { name: 'Light Blue', token: 'brand-soft', hex: '#EAF3FA', on: 'dark' },
    ],
  },
  {
    group: 'Gold',
    swatches: [
      { name: 'Warm Gold', token: 'accent', hex: '#D99A32', on: 'dark' },
      { name: 'Deep Gold', token: 'accent-strong', hex: '#B77916', on: 'light' },
      { name: 'Pale Gold', token: 'accent-soft', hex: '#F8EBD2', on: 'dark' },
    ],
  },
  {
    group: 'Neutral',
    swatches: [
      { name: 'Warm Cream', token: 'page', hex: '#FFF8EA', on: 'dark' },
      { name: 'White', token: 'surface', hex: '#FFFFFF', on: 'dark' },
      { name: 'Dark Charcoal', token: 'ink', hex: '#263238', on: 'light' },
      { name: 'Muted Grey', token: 'muted', hex: '#64748B', on: 'light' },
    ],
  },
  {
    group: 'Status — outside the brand hues',
    swatches: [
      { name: 'Success', token: 'success', hex: '#15803D', on: 'light' },
      { name: 'Warning', token: 'warning', hex: '#C2410C', on: 'light' },
      { name: 'Danger', token: 'danger', hex: '#B91C1C', on: 'light' },
      { name: 'Info', token: 'info', hex: '#1769AA', on: 'light' },
    ],
  },
];

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-line py-12">
      <Container>
        <h2 className="text-xl font-semibold text-brand-dark">{title}</h2>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
        <div className="mt-6">{children}</div>
      </Container>
    </section>
  );
}

export default function DesignSystem() {
  return (
    <div className="min-h-screen bg-page">
      {/* Header specimen */}
      <header className="border-b border-line bg-surface">
        <Container>
          {/*
            `flex-wrap` and `min-w-0` are load-bearing: the crest, the school
            name and the CTA together are wider than a 390px phone. Without
            wrapping, the header forces the whole page wider than the viewport
            and every section inherits the horizontal scroll.
          */}
          <div className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <Logo height={44} alt="" />
              <div className="min-w-0 leading-tight">
                <p className="truncate text-lg font-semibold text-brand-dark">Chosen School</p>
                <p className="truncate text-xs text-muted">Primary &amp; Secondary</p>
              </div>
            </div>
            <Button size="sm" className="shrink-0">
              Apply for admission
            </Button>
          </div>
        </Container>
      </header>

      <main>
        <Container>
          <div className="py-10">
            <p className="text-xs font-semibold tracking-widest text-accent-ink uppercase">
              Design system preview
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-brand-dark">
              Royal Blue &amp; Warm Gold
            </h1>
            <p className="mt-3 max-w-2xl text-base text-ink">
              A specimen sheet for the approved brand tokens. This is not the public website —
              pages are built in ROADMAP S04 onwards. Everything below consumes the tokens defined
              in <code className="rounded bg-brand-soft px-1.5 py-0.5 text-sm">index.css</code>.
            </p>
          </div>
        </Container>

        <Section
          title="Colour tokens"
          description="Components reference these names, never raw hex values, so a palette change is one edit."
        >
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {PALETTE.map((group) => (
              <div key={group.group}>
                <h3 className="mb-3 text-xs font-semibold tracking-wider text-muted uppercase">
                  {group.group}
                </h3>
                <ul className="space-y-2">
                  {group.swatches.map((swatch) => (
                    <li
                      key={swatch.token}
                      className={`rounded-[var(--radius-control)] border border-line px-3 py-2 ${
                        swatch.on === 'light' ? 'text-white' : 'text-brand-dark'
                      }`}
                      style={{ backgroundColor: swatch.hex }}
                    >
                      <p className="text-sm font-medium">{swatch.name}</p>
                      <p className="font-mono text-xs opacity-80">
                        {swatch.hex} · {swatch.token}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="Logo variants"
          description="The supplied crest, recoloured — never redrawn. Choose by background, not by preference."
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                label: 'Navy — light backgrounds (default)',
                bg: 'bg-surface',
                variant: 'navy' as const,
              },
              { label: 'Blue — brand-blue surfaces', bg: 'bg-brand-soft', variant: 'blue' as const },
              { label: 'Reverse — deep navy', bg: 'bg-brand-dark', variant: 'reverse' as const },
              {
                label: 'Monochrome — print',
                bg: 'bg-surface',
                variant: 'monochrome' as const,
              },
            ].map((item) => (
              <div
                key={item.variant}
                className={`flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-line p-6 ${item.bg}`}
              >
                <Logo
                  variant={item.variant}
                  height={96}
                  alt={`Chosen School crest, ${item.variant} version`}
                />
                <p
                  className={`text-center text-xs ${
                    item.variant === 'reverse' ? 'text-white/80' : 'text-muted'
                  }`}
                >
                  {item.label}
                </p>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="Buttons"
          description="Warm gold carries navy text, not white: deep gold behind white measures 3.65:1, below the 4.5:1 needed for normal text. Warm gold with navy measures 4.76:1."
        >
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">Primary</Button>
            <Button variant="accent">Accent</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Delete</Button>
            <Button variant="primary" disabled>
              Disabled
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button size="sm" variant="primary">
              Small
            </Button>
            <Button size="sm" variant="secondary">
              Small secondary
            </Button>
          </div>
        </Section>

        <Section
          title="Status labels"
          description="Every badge carries a word. Colour alone never communicates status."
        >
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="success">Reviewed</StatusBadge>
            <StatusBadge tone="warning">Needs attention</StatusBadge>
            <StatusBadge tone="danger">Rejected</StatusBadge>
            <StatusBadge tone="info">New</StatusBadge>
            <StatusBadge tone="neutral">Draft</StatusBadge>
          </div>
        </Section>

        <Section
          title="Form fields"
          description="Labels are bound to inputs, hints and errors are announced, and errors are never carried by colour alone."
        >
          <div className="grid max-w-2xl gap-6 sm:grid-cols-2">
            <Field id="preview-name" label="Student surname" placeholder="e.g. Adeyemi" />
            <Field
              id="preview-phone"
              label="Parent or guardian phone"
              placeholder="0803 123 4567"
              hint="Digits only; 7 to 15 digits."
            />
            <Field
              id="preview-dob"
              label="Date of birth"
              type="date"
              error="Date of birth must be in the past."
            />
            <Field
              id="preview-disabled"
              label="Disabled field"
              defaultValue="Not editable"
              disabled
            />
          </div>
        </Section>
      </main>

      {/* Footer specimen */}
      <footer className="bg-brand-dark text-white">
        <Container>
          <div className="flex flex-col items-start gap-4 py-10 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Logo variant="reverse" height={48} alt="" />
              <div className="leading-tight">
                <p className="font-semibold">Chosen School</p>
                <p className="text-sm text-white/70">Primary &amp; Secondary</p>
              </div>
            </div>
            <p className="text-sm text-white/70">
              Design system preview. Contact details are added once the school supplies them.
            </p>
          </div>
        </Container>
      </footer>
    </div>
  );
}
