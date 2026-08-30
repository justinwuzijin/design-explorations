import { Suspense, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * Full-bleed host for a React exploration. Supplies the html/body-level styling
 * each project used to get from its own standalone index.html, scoped to the
 * route so it can't reach the gallery.
 */
export default function Stage({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className={`stage stage-${name}`}>
      <Link to="/" className="stage-back">
        ← back
      </Link>
      <Suspense fallback={<div className="stage-loading">loading…</div>}>{children}</Suspense>
    </div>
  );
}
