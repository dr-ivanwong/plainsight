import { describe, expect, it } from 'vitest';

import { isInstalled, isIos } from './iosInstall';

const nav = (userAgent: string, maxTouchPoints = 0): Navigator =>
  ({ userAgent, maxTouchPoints }) as Navigator;

describe('iOS detection', () => {
  it('recognises iPhones and iPads, including iPadOS posing as a Mac', () => {
    expect(isIos(nav('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'))).toBe(true);
    expect(isIos(nav('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)'))).toBe(true);
    expect(isIos(nav('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5))).toBe(true);
    expect(isIos(nav('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'))).toBe(false);
    expect(isIos(nav('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'))).toBe(false);
  });

  it('reads standalone display as installed, and absent matchMedia as not', () => {
    const win = (matches: boolean | undefined, standalone?: boolean): Window =>
      ({
        navigator: { standalone },
        matchMedia:
          matches === undefined ? undefined : () => ({ matches }) as MediaQueryList
      }) as unknown as Window;

    expect(isInstalled(win(true))).toBe(true);
    expect(isInstalled(win(false))).toBe(false);
    expect(isInstalled(win(undefined))).toBe(false);
    expect(isInstalled(win(false, true))).toBe(true);
  });
});
