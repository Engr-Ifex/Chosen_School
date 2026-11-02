import { Logo } from '../brand/Logo';
import { Container } from '../ui/Container';

/**
 * Site footer.
 *
 * No contact details, no social links, no quick-link columns yet: every one of
 * those is school-supplied content that has not arrived, and inventing a phone
 * number or address would be worse than an honest placeholder. The structure
 * is here so S10 can fill it in.
 */
export function SiteFooter() {
  return (
    <footer className="mt-auto bg-brand-dark text-white">
      <Container>
        <div className="flex flex-col items-start gap-4 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Logo variant="reverse" height={44} alt="" />
            <div className="leading-tight">
              <p className="font-semibold">Chosen School</p>
              <p className="text-sm text-white/70">Primary &amp; Secondary</p>
            </div>
          </div>
          <p className="text-sm text-white/70">
            School contact details are added once the school supplies them.
          </p>
        </div>
      </Container>
    </footer>
  );
}
