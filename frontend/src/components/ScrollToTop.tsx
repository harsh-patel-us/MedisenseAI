import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * React Router does not reset the scroll position on route changes by default.
 * Mount this component once inside <Router> so every navigation lands at the top.
 *
 * If the URL contains a hash (e.g. /contact#faq), scroll smoothly to that element
 * instead after a short delay so the target has time to mount.
 */
export default function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      const id = hash.slice(1);
      // Wait a tick so the destination page's DOM exists before scrolling.
      const t = window.setTimeout(() => {
        const el = document.getElementById(id);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
        }
      }, 40);
      return () => window.clearTimeout(t);
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname, hash]);

  return null;
}
