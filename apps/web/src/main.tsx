import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';

import { RouteErrorFallback } from './components/RegionBoundary';
import { routeTree } from './routeTree.gen';
import './styles/global.css';

// The offline shell: assets precache on first visit and updates apply on the
// next launch, with no update ceremony (calm over chrome).
registerSW({ immediate: true });

// The route-level backstop (frontend spec section 2): an uncaught render
// crash costs one screen, with retry and the export escape hatch, never a
// white page.
const router = createRouter({ routeTree, defaultErrorComponent: RouteErrorFallback });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('index.html must contain a #root element');
}

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
