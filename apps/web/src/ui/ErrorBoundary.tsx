import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { i18next } from '../i18n';

interface State {
  readonly failed: boolean;
}

/**
 * The last line of defence: if drawing the interface throws, say so plainly and offer a reload
 * instead of leaving a blank page. The user's original files are never touched, so a reload is safe.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Only to the local console: nothing leaves the device.
    console.error(error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="crash" role="alert">
        <h1>{i18next.t('crash.title')}</h1>
        <p>{i18next.t('crash.body')}</p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            window.location.reload();
          }}
        >
          {i18next.t('crash.reload')}
        </button>
      </main>
    );
  }
}
