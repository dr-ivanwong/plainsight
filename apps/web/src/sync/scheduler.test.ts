// The cadence policy, hermetically (main plan §12.9): reads revalidate on
// launch, reconnect, focus and sign-in; queued writes drain soon after they
// land and retry with backoff until the server accepts them. Timers are
// injected, so every scenario runs on a hand-cranked clock.
import { describe, expect, it } from 'vitest';

import {
  DRAIN_DEBOUNCE_MS,
  FOCUS_FLOOR_MS,
  RETRY_BASE_MS,
  SyncScheduler,
  type SchedulerDeps,
  type SyncRunOutcome
} from './scheduler';

/** Far past every backoff the scheduler could arm. */
const RETRY_CAP_TEST_HORIZON = 3_600_000;

class Harness {
  time = 0;
  runs = 0;
  private timers: Array<{ id: number; at: number; handler: () => void }> = [];
  private nextId = 1;
  private resolvers: Array<(outcome: SyncRunOutcome) => void> = [];

  readonly deps: SchedulerDeps = {
    run: () => {
      this.runs += 1;
      return new Promise<SyncRunOutcome>((resolve) => this.resolvers.push(resolve));
    },
    setTimer: (handler, ms) => {
      const id = (this.nextId += 1);
      this.timers.push({ id, at: this.time + ms, handler });
      return id;
    },
    clearTimer: (handle) => {
      this.timers = this.timers.filter((timer) => timer.id !== handle);
    },
    now: () => this.time
  };

  /** Completes the oldest in-flight run and lets its continuation settle. */
  async settle(outcome: SyncRunOutcome): Promise<void> {
    const resolve = this.resolvers.shift();
    if (resolve === undefined) throw new Error('no run in flight');
    resolve(outcome);
    await Promise.resolve();
    await Promise.resolve();
  }

  advance(ms: number): void {
    this.time += ms;
    const due = this.timers
      .filter((timer) => timer.at <= this.time)
      .sort((a, b) => a.at - b.at);
    this.timers = this.timers.filter((timer) => timer.at > this.time);
    for (const timer of due) timer.handler();
  }

  get armedTimers(): number {
    return this.timers.length;
  }
}

describe('the sync scheduler', () => {
  it('a queued write drains soon after it lands', async () => {
    const harness = new Harness();
    const scheduler = new SyncScheduler(harness.deps);

    scheduler.notePending(1, true);
    expect(harness.runs).toBe(0);
    harness.advance(DRAIN_DEBOUNCE_MS);
    expect(harness.runs).toBe(1);
    await harness.settle('ok');
    scheduler.notePending(0, true);
    expect(harness.armedTimers).toBe(0);
  });

  it('drain failures back off exponentially and retry until accepted', async () => {
    const harness = new Harness();
    const scheduler = new SyncScheduler(harness.deps);

    scheduler.notePending(1, true);
    harness.advance(DRAIN_DEBOUNCE_MS);
    await harness.settle('failed');

    harness.advance(RETRY_BASE_MS - 1);
    expect(harness.runs).toBe(1);
    harness.advance(1);
    expect(harness.runs).toBe(2);
    await harness.settle('failed');

    harness.advance(RETRY_BASE_MS * 2 - 1);
    expect(harness.runs).toBe(2);
    harness.advance(1);
    expect(harness.runs).toBe(3);
    await harness.settle('ok');
    scheduler.notePending(0, true);
    expect(harness.armedTimers).toBe(0);
  });

  it('fresh writes while failing ride the retry, never a hot loop', async () => {
    const harness = new Harness();
    const scheduler = new SyncScheduler(harness.deps);

    scheduler.notePending(1, true);
    harness.advance(DRAIN_DEBOUNCE_MS);
    await harness.settle('failed');

    scheduler.notePending(2, true);
    scheduler.notePending(3, true);
    harness.advance(DRAIN_DEBOUNCE_MS);
    expect(harness.runs).toBe(1);
    harness.advance(RETRY_BASE_MS);
    expect(harness.runs).toBe(2);
    await harness.settle('ok');
  });

  it('reconnecting retries now and forgets the backoff', async () => {
    const harness = new Harness();
    const scheduler = new SyncScheduler(harness.deps);

    scheduler.notePending(1, true);
    harness.advance(DRAIN_DEBOUNCE_MS);
    await harness.settle('failed');
    expect(harness.armedTimers).toBe(1);

    scheduler.revalidate('online');
    expect(harness.runs).toBe(2);
    expect(harness.armedTimers).toBe(0);
    await harness.settle('failed');
    // Backoff restarts from the base after the reset, not doubled onward.
    harness.advance(RETRY_BASE_MS);
    expect(harness.runs).toBe(3);
    await harness.settle('ok');
  });

  it('triggers arriving mid-run collapse into one follow-up run', async () => {
    const harness = new Harness();
    const scheduler = new SyncScheduler(harness.deps);

    scheduler.revalidate('launch');
    expect(harness.runs).toBe(1);
    scheduler.revalidate('online');
    scheduler.revalidate('interval');
    expect(harness.runs).toBe(1);
    await harness.settle('ok');
    expect(harness.runs).toBe(2);
    await harness.settle('ok');
    expect(harness.runs).toBe(2);
  });

  it('signed out, nothing runs and nothing waits', () => {
    const harness = new Harness();
    const scheduler = new SyncScheduler(harness.deps);

    scheduler.notePending(3, false);
    harness.advance(RETRY_CAP_TEST_HORIZON);
    expect(harness.runs).toBe(0);
    expect(harness.armedTimers).toBe(0);
  });

  it('signing in triggers the first catch-up without a debounce', async () => {
    const harness = new Harness();
    const scheduler = new SyncScheduler(harness.deps);

    scheduler.notePending(0, false);
    scheduler.notePending(0, true);
    expect(harness.runs).toBe(1);
    await harness.settle('ok');
  });

  it('focus flurries revalidate once per floor, and boot counts as focus', async () => {
    const harness = new Harness();
    const scheduler = new SyncScheduler(harness.deps);

    // The load-time flurry collapses into the launch run: no focus run yet.
    scheduler.revalidate('focus');
    expect(harness.runs).toBe(0);
    harness.advance(FOCUS_FLOOR_MS);
    scheduler.revalidate('focus');
    expect(harness.runs).toBe(1);
    await harness.settle('ok');
    scheduler.revalidate('focus');
    expect(harness.runs).toBe(1);
    harness.advance(FOCUS_FLOOR_MS);
    scheduler.revalidate('focus');
    expect(harness.runs).toBe(2);
    await harness.settle('ok');
  });

  it('a failed run swallows its queued rerun instead of hammering', async () => {
    const harness = new Harness();
    const scheduler = new SyncScheduler(harness.deps);

    scheduler.revalidate('launch');
    scheduler.revalidate('interval');
    expect(harness.runs).toBe(1);
    await harness.settle('failed');
    expect(harness.runs).toBe(1);
    expect(harness.armedTimers).toBe(0);
  });

  it('the snapshot reports running and settled for the read gate', async () => {
    const harness = new Harness();
    const scheduler = new SyncScheduler(harness.deps);
    const seen: Array<{ running: boolean; settled: boolean }> = [];
    scheduler.subscribe(() => seen.push(scheduler.getSnapshot()));

    expect(scheduler.getSnapshot()).toEqual({ running: false, settled: false });
    scheduler.revalidate('launch');
    expect(scheduler.getSnapshot()).toEqual({ running: true, settled: false });
    await harness.settle('failed');
    expect(scheduler.getSnapshot()).toEqual({ running: false, settled: true });
    expect(seen).toEqual([
      { running: true, settled: false },
      { running: false, settled: true }
    ]);
  });
});
