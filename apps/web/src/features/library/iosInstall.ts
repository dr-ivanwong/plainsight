/**
 * The iOS seven-day story (frontend spec §2): Safari deletes an origin's data
 * after seven days of non-use unless the app is added to the Home Screen.
 * iPadOS reports itself as a Mac, but a Mac with more than one touch point is
 * an iPad; jsdom has no matchMedia, so installation detection stays optional.
 */
export function isIos(nav: Navigator = navigator): boolean {
  return (
    /iPad|iPhone|iPod/.test(nav.userAgent) ||
    (nav.userAgent.includes('Macintosh') && nav.maxTouchPoints > 1)
  );
}

export function isInstalled(win: Window = window): boolean {
  const standalone = (win.navigator as Navigator & { standalone?: boolean }).standalone;
  return win.matchMedia?.('(display-mode: standalone)').matches === true || standalone === true;
}

/** True on an iOS browser that has not been added to the Home Screen. */
export function needsInstallExplainer(win: Window = window): boolean {
  return isIos(win.navigator) && !isInstalled(win);
}
