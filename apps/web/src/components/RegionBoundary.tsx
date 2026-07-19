/**
 * The per-feature-region error boundary the frontend spec section 2 pins: a
 * crash stays inside its region with a friendly message, a retry that
 * remounts it, and the export escape hatch, the same download the data
 * screen serves. A crashed chart must never take down a grid holding
 * unsaved keystrokes; this is the mechanism. The route-level backstop
 * (RouteErrorFallback below) rides the router's defaultErrorComponent, so
 * the widest possible blast radius is one screen, never a white page.
 */
import type { ErrorComponentProps } from '@tanstack/react-router';
import {
  Component,
  Fragment,
  useEffect,
  useState,
  type ErrorInfo,
  type ReactElement,
  type ReactNode
} from 'react';

import { downloadLibraryExport } from '../db';
import * as buttons from '../styles/buttons.css';
import * as placeholder from './placeholder.css';
import * as styles from './regionBoundary.css';

type ExportRun = () => Promise<void>;

const libraryExport: ExportRun = () => downloadLibraryExport(__APP_VERSION__);

/**
 * The escape hatch (frontend spec section 2): the whole library as a file,
 * from inside the fallback, no navigation required.
 */
function ExportButton({ run = libraryExport }: { run?: ExportRun }): ReactElement {
  const [note, setNote] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className={buttons.secondaryAction}
        onClick={() => {
          run().then(
            () => setNote('Exported.'),
            () =>
              setNote(
                'Could not build the export. Settings, then Data & storage, offers the same download.'
              )
          );
        }}
      >
        Export my data
      </button>
      {note === null ? null : (
        <span role="status" className={styles.note}>
          {note}
        </span>
      )}
    </>
  );
}

export interface RegionBoundaryProps {
  /** Names the region in the fallback copy: 'The chart', 'Review mode', 'This sheet'. */
  region: string;
  children: ReactNode;
  /** Tests inject; the default downloads the real library export. */
  exportRun?: ExportRun;
}

interface RegionBoundaryState {
  failed: boolean;
  attempt: number;
}

export class RegionBoundary extends Component<RegionBoundaryProps, RegionBoundaryState> {
  override state: RegionBoundaryState = { failed: false, attempt: 0 };

  static getDerivedStateFromError(): Partial<RegionBoundaryState> {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    // The console is the telemetry (main plan section 7): one line names the
    // region, and the browser carries the stack beneath it.
    console.error(`${this.props.region} crashed:`, error, info.componentStack ?? '');
  }

  private readonly retry = (): void => {
    // A fresh key remounts the region whole, so recovery is a clean start
    // rather than a re-render of whatever half-state just threw.
    this.setState((state) => ({ failed: false, attempt: state.attempt + 1 }));
  };

  override render(): ReactNode {
    if (this.state.failed) {
      return (
        <div role="alert" className={styles.fallback}>
          <p className={styles.message}>
            <strong className={styles.region}>{this.props.region} hit a problem.</strong> Nothing
            you entered was touched.
          </p>
          <div className={styles.actions}>
            <button type="button" className={buttons.secondaryAction} onClick={this.retry}>
              Try again
            </button>
            <ExportButton run={this.props.exportRun} />
          </div>
        </div>
      );
    }
    return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
  }
}

/**
 * The route-level backstop, wired as the router's defaultErrorComponent. The
 * way home is a plain anchor on purpose: a full document load is the most
 * dependency-free recovery a broken tree can offer.
 */
export function RouteErrorFallback({ error, reset }: ErrorComponentProps): ReactElement {
  useEffect(() => {
    console.error('This screen crashed:', error);
  }, [error]);
  return (
    <section role="alert" className={placeholder.wrap}>
      <h1 className={placeholder.title}>This screen hit a problem</h1>
      <p className={placeholder.note}>
        The rest of the app is unaffected, and nothing you entered was touched. Try again, or
        export your library first if you would rather be safe.
      </p>
      <div className={styles.actions}>
        <button type="button" className={buttons.secondaryAction} onClick={reset}>
          Try again
        </button>
        <ExportButton />
        <a className={placeholder.link} href="/">
          Back to the library
        </a>
      </div>
    </section>
  );
}
