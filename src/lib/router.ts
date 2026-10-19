import type { View } from '../types';

export function parseHash(hash: string): View {
  const clean = hash.replace(/^#\/?/, '').trim();
  if (!clean) return { kind: 'today' };
  const [kind, ...rest] = clean.split('/');
  const id = decodeURIComponent(rest.join('/') || '');
  switch (kind) {
    case 'today':
    case 'next7':
    case 'all':
    case 'completed':
    case 'abandoned':
    case 'trash':
    case 'calendar':
      return { kind } as View;
    case 'tag':
      return id ? { kind: 'tag', name: id } : { kind: 'all' };
    case 'filter':
      return id ? { kind: 'filter', id } : { kind: 'all' };
    default:
      return { kind: 'today' };
  }
}

export function viewHash(view: View): string {
  switch (view.kind) {
    case 'list':
      return `#/list/${encodeURIComponent(view.id)}`;
    case 'tag':
      return `#/tag/${encodeURIComponent(view.name)}`;
    case 'filter':
      return `#/filter/${encodeURIComponent(view.id)}`;
    default:
      return `#/${view.kind}`;
  }
}

export function navigate(view: View) {
  const hash = viewHash(view);
  if (window.location.hash !== hash) window.history.pushState(null, '', hash);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}