/**
 * The sync cadence as one deterministic policy (main plan §12.9: reads go
 * behind the API; IndexedDB is the cache the app renders while it
 * revalidates, and the queue it drains until the server accepts every
 * write). The scheduler owns every trigger: revalidation on launch,
 * reconnect, focus and sign-in, the fallback interval, and the pending-write
 * drain with exponential backoff while the server is unreachable. Runs are
 * single-flight; triggers arriving mid-run collapse into one follow-up run.
 * Timers and the runner inject, so the whole policy tests hermetically.
 */

export type SyncRunOutcome = 'ok' | 'failed' | 'signed_out';

export type SyncTrigger = 'launch' | 'online' | 'focus' | 'interval' | 'sign-in';

export interface SchedulerDeps {
  run(): Promise<SyncRunOutcome>;
  setTimer(handler: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  now(): number;
}

export interface SyncSnapshot {
  running: boolean;
  /** True once any run has completed since the app booted. */
  settled: boolean;
}

/** A burst of edits becomes one push shortly after the burst begins. */
export const DRAIN_DEBOUNCE_MS = 3_000;
export const RETRY_BASE_MS = 30_000;
export const RETRY_CAP_MS = 300_000;
/** Focus events arrive in flurries; one revalidation per floor is plenty. */
export const FOCUS_FLOOR_MS = 15_000;

export class SyncScheduler {
  private readonly deps: SchedulerDeps;
  private running = false;
  private rerunWanted = false;
  private settled = false;
  /** Null until the first report, so boot state never reads as an edge. */
  private signedIn: boolean | null = null;
  private pendingWrites = 0;
  private failures = 0;
  private drainTimer: unknown = null;
  private retryTimer: unknown = null;
  private lastFocusAt = Number.NEGATIVE_INFINITY;
  private generation = 0;
  private snapshot: SyncSnapshot = { running: false, settled: false };
  private readonly listeners = new Set<() => void>();

  constructor(deps: SchedulerDeps) {
    this.deps = deps;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): SyncSnapshot {
    return this.snapshot;
  }

  /** A read wants fresh state: run now (focus flurries excepted). */
  revalidate(trigger: SyncTrigger): void {
    if (trigger === 'focus') {
      if (this.deps.now() - this.lastFocusAt < FOCUS_FLOOR_MS) return;
      this.lastFocusAt = this.deps.now();
    }
    if (trigger === 'online') {
      // A fresh network is a fresh start; forget the unreachable-server past.
      this.failures = 0;
      this.clearRetry();
    }
    this.attempt();
  }

  /**
   * The queue watcher reports here on every change: how many local writes
   * still await the server, and whether a session exists at all.
   */
  notePending(pendingWrites: number, signedIn: boolean): void {
    const signInEdge = this.signedIn === false && signedIn;
    this.signedIn = signedIn;
    this.pendingWrites = pendingWrites;
    if (!signedIn) {
      // Signed out, nothing runs and nothing waits; the queue keeps locally.
      this.clearDrain();
      this.clearRetry();
      this.failures = 0;
      return;
    }
    if (signInEdge) {
      this.revalidate('sign-in');
      return;
    }
    if (pendingWrites === 0) {
      this.clearDrain();
      return;
    }
    // While the server is unreachable the retry timer owns the cadence;
    // fresh writes join the queue and ride the next retry.
    if (this.failures > 0 || this.drainTimer !== null) return;
    this.drainTimer = this.deps.setTimer(() => {
      this.drainTimer = null;
      this.attempt();
    }, DRAIN_DEBOUNCE_MS);
  }

  dispose(): void {
    this.clearDrain();
    this.clearRetry();
    this.listeners.clear();
  }

  /**
   * Back to boot state, in-flight runs disowned. The app never calls this;
   * tests do between mounts, because the app-wide instance outlives them.
   */
  reset(): void {
    this.generation += 1;
    this.clearDrain();
    this.clearRetry();
    this.running = false;
    this.rerunWanted = false;
    this.settled = false;
    this.signedIn = null;
    this.pendingWrites = 0;
    this.failures = 0;
    this.lastFocusAt = Number.NEGATIVE_INFINITY;
    this.publish();
  }

  private attempt(): void {
    if (this.running) {
      this.rerunWanted = true;
      return;
    }
    this.running = true;
    this.clearDrain();
    this.publish();
    const generation = this.generation;
    void this.deps.run().then(
      (outcome) => {
        if (generation === this.generation) this.settle(outcome);
      },
      () => {
        if (generation === this.generation) this.settle('failed');
      }
    );
  }

  private settle(outcome: SyncRunOutcome): void {
    this.running = false;
    this.settled = true;
    if (outcome === 'failed') {
      this.failures += 1;
      if (this.signedIn === true && this.pendingWrites > 0 && this.retryTimer === null) {
        const wait = Math.min(RETRY_BASE_MS * 2 ** (this.failures - 1), RETRY_CAP_MS);
        this.retryTimer = this.deps.setTimer(() => {
          this.retryTimer = null;
          this.attempt();
        }, wait);
      }
    } else {
      this.failures = 0;
      this.clearRetry();
    }
    this.publish();
    if (this.rerunWanted) {
      this.rerunWanted = false;
      this.attempt();
    }
  }

  private publish(): void {
    this.snapshot = { running: this.running, settled: this.settled };
    for (const listener of this.listeners) listener();
  }

  private clearDrain(): void {
    if (this.drainTimer !== null) {
      this.deps.clearTimer(this.drainTimer);
      this.drainTimer = null;
    }
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) {
      this.deps.clearTimer(this.retryTimer);
      this.retryTimer = null;
    }
  }
}
