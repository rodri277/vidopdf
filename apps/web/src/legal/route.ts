import { useSyncExternalStore } from 'react';

/** The pages that live at their own address. Everything else is the workspace at `/`. */
export const LEGAL_PAGES = ['privacy', 'legal', 'terms', 'licenses'] as const;
export type LegalPage = (typeof LEGAL_PAGES)[number];

/** Which legal page an address shows, if any. A trailing slash is ignored. */
export function pageAt(pathname: string): LegalPage | undefined {
  const name = pathname.replace(/\/+$/, '').replace(/^\//, '');
  return LEGAL_PAGES.find((page) => page === name);
}

export const pathOf = (page: LegalPage): string => `/${page}`;

const CHANGED = 'vidopdf:navigate';

function subscribe(listener: () => void): () => void {
  window.addEventListener('popstate', listener);
  window.addEventListener(CHANGED, listener);
  return () => {
    window.removeEventListener('popstate', listener);
    window.removeEventListener(CHANGED, listener);
  };
}

/** The legal page being shown, or undefined for the workspace. */
export function useLegalPage(): LegalPage | undefined {
  return useSyncExternalStore(
    subscribe,
    () => pageAt(window.location.pathname),
    () => undefined,
  );
}

/**
 * Moves between the workspace and a legal page without reloading, so the files that are loaded
 * stay where they are. Pass nothing to go back to the workspace.
 */
export function navigate(page?: LegalPage): void {
  const path = page === undefined ? '/' : pathOf(page);
  if (window.location.pathname === path) return;
  window.history.pushState(null, '', path);
  window.dispatchEvent(new Event(CHANGED));
}
