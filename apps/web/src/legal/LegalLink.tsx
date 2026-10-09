import type { ReactNode } from 'react';
import { navigate, pathOf } from './route';
import type { LegalPage } from './route';

interface LegalLinkProps {
  readonly page: LegalPage;
  readonly children: ReactNode;
  readonly current?: boolean;
}

/**
 * A real link (it can be opened in a new tab and works with the keyboard) that, on a plain click,
 * switches page without reloading, so the loaded files are not lost.
 */
export function LegalLink({ page, children, current }: LegalLinkProps) {
  return (
    <a
      href={pathOf(page)}
      aria-current={current === true ? 'page' : undefined}
      onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
          return;
        event.preventDefault();
        navigate(page);
      }}
    >
      {children}
    </a>
  );
}
