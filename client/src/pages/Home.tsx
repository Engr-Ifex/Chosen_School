import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Container } from '../components/ui/Container';

/**
 * Home page — a deliberate placeholder.
 *
 * The real home page (docs/DESIGN.md §4.1) needs hero copy, an introduction and
 * school content that has not been supplied. Rather than invent it, this page
 * does the one thing it can do honestly: point a parent at the admission form.
 */
export default function Home() {
  return (
    <Container size="prose">
      <div className="py-16">
        <p className="text-xs font-semibold tracking-widest text-accent-ink uppercase">
          Chosen School
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-brand-dark">Primary &amp; Secondary</h1>

        <p className="mt-4 text-base text-ink">
          Applications for admission are open. You can complete the application form online — no
          account is needed.
        </p>

        <div className="mt-8">
          <Link to="/admissions">
            <Button>Apply for admission</Button>
          </Link>
        </div>

        <p className="mt-10 text-sm text-muted">
          The remaining pages — About, Academics, News &amp; Events, Gallery and Contact — are built
          in later slices once the school supplies its content.
        </p>
      </div>
    </Container>
  );
}
