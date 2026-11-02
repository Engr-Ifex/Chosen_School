import { Outlet } from 'react-router-dom';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';

/**
 * The public site frame: header, page, footer.
 *
 * `flex min-h-screen` with `mt-auto` on the footer keeps the footer at the
 * bottom on a short page (the confirmation screen) without absolute
 * positioning.
 */
export function SiteLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-page">
      <SiteHeader />
      <main className="flex-1">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}
