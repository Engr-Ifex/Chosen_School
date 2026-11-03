import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { SiteLayout } from './components/site/SiteLayout';
import { Container } from './components/ui/Container';
import { SessionGate } from './components/admin/SessionGate';
import Admissions from './pages/Admissions';
import AdminApplicationDetail from './pages/admin/AdminApplicationDetail';
import AdminApplications from './pages/admin/AdminApplications';
import AdminLogin from './pages/admin/AdminLogin';
import AdminTrash from './pages/admin/AdminTrash';
import DesignSystem from './pages/DesignSystem';
import Home from './pages/Home';

/**
 * Application routes.
 *
 * Only pages that exist are routed. `/design` is the brand specimen from the
 * design-system work — kept because it is the fastest way to review tokens and
 * components, and removed when the real pages supersede it.
 *
 * `BrowserRouter` rather than hash routing: Vercel's catch-all rewrite already
 * serves `index.html` for unknown paths, so deep links work in production
 * (client/vercel.json).
 */

function NotFound() {
  return (
    <Container size="prose">
      <div className="py-16">
        <h1 className="text-2xl font-semibold text-brand-dark">Page not found</h1>
        <p className="mt-2 text-base text-ink">The page you were looking for does not exist.</p>
        <p className="mt-6">
          <Link to="/" className="font-medium text-brand underline hover:text-brand-hover">
            Return to Homepage
          </Link>
        </p>
      </div>
    </Container>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* The specimen carries its own header and footer as examples. */}
        <Route path="/design" element={<DesignSystem />} />

        <Route element={<SiteLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/admissions" element={<Admissions />} />
        </Route>

        {/* Admin: sign-in is public, everything else sits behind the gate. */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route element={<SessionGate />}>
          <Route path="/admin/applications" element={<AdminApplications />} />
          <Route path="/admin/applications/:id" element={<AdminApplicationDetail />} />
          <Route path="/admin/trash" element={<AdminTrash />} />
        </Route>

        <Route element={<SiteLayout />}>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
