/**
 * Global styles: a minimal reset, the base typography, and the colour-scheme
 * wiring that keeps form controls and UA chrome in step with the active theme.
 * Everything here maps to tokens; components own the rest.
 */
import { globalStyle } from '@vanilla-extract/css';

import { colour, fontSize, fontStack, lineHeight } from './tokens.css';

// colour-scheme mirrors the theme application in tokens.css.ts: auto by
// default, pinned when Phase 1 forces a theme via data-theme on <html>.
globalStyle(':root', { colorScheme: 'light dark' });
globalStyle(':root[data-theme="light"]', { colorScheme: 'light' });
globalStyle(':root[data-theme="dark"]', { colorScheme: 'dark' });

// Minimal reset: box sizing, margins, and form-control font inheritance.
globalStyle('*, *::before, *::after', { boxSizing: 'border-box' });
globalStyle('html, body, h1, h2, h3, h4, p, figure', { margin: 0 });
globalStyle('button, input, select, textarea', { font: 'inherit' });

globalStyle('body', {
  backgroundColor: colour.background,
  color: colour.textPrimary,
  fontFamily: fontStack,
  fontSize: fontSize.body,
  lineHeight: lineHeight.body,
  WebkitFontSmoothing: 'antialiased',
  MozOsxFontSmoothing: 'grayscale',
});
