/**
 * Single source of truth for the gallery.
 *
 * Replaces the old hand-numbered <li> list in index.html — including the two
 * entries that were commented out rather than filtered. Set `hidden: true` to
 * drop something from the listing while keeping it reachable at its URL.
 *
 * kind 'static' — a vanilla HTML/WebGL sketch living in public/. Linked with a
 *   real <a href>, because it is a separate document, not a React route.
 * kind 'route'  — a React exploration mounted in this app and code-split, so
 *   three.js et al. are only fetched when you actually open it.
 */
export type Project = {
  index: string;
  name: string;
  /** Path as it appears in the URL bar. Static sketches keep their trailing slash. */
  href: string;
  date: string;
  kind: 'static' | 'route';
  hidden?: boolean;
};

export const projects: Project[] = [
  { index: '01', name: 'grass', href: '/grass-fluid/', date: '04.11.26', kind: 'static' },
  { index: '02', name: 'water', href: '/water-surface/', date: '04.12.26', kind: 'static', hidden: true },
  { index: '03', name: 'lock', href: '/combination-lock/', date: '06.4.26', kind: 'static' },
  { index: '04', name: 'watercolor', href: '/watercolor/', date: '06.10.26', kind: 'static' },
  { index: '05', name: 'oil pastel', href: '/oil-pastel/', date: '06.10.26', kind: 'static' },
  { index: '06', name: 'flipbook', href: '/flipbook/', date: '06.22.26', kind: 'static' },
  { index: '07', name: 'clocks in chungking', href: '/clocks-in-chungking/', date: '06.27.26', kind: 'static', hidden: true },
  { index: '08', name: 'breadboard', href: '/breadboard/', date: '07.04.26', kind: 'static' },
  { index: '09', name: 'soccer curve', href: '/soccer-curve', date: '07.22.26', kind: 'route' },
  { index: '10', name: 'design tiles', href: '/design-tiles', date: '07.21.26', kind: 'route' },
  // Still the stock Vite starter template, so it stays out of the listing.
  { index: '11', name: 'envelope', href: '/envelope', date: '08.15.26', kind: 'route', hidden: true },
];

export const visibleProjects = projects.filter((p) => !p.hidden);
