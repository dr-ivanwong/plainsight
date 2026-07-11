# @plainsight/web

The web app for Plainsight, a local-first financial statement analyser. Stack: React 19 with TypeScript strict, Vite, TanStack Router (file-based routes), and Vanilla Extract for typed design tokens. The build contracts live in [docs/plan/plainsight-frontend.md](../../docs/plan/plainsight-frontend.md) (routes, screens, states, folder structure) and [docs/plan/plainsight.md](../../docs/plan/plainsight.md) §4 and §5 (design language and frontend architecture); read those before changing anything here.

Phase 0 ships the design-token system only: `src/styles/palette.ts` (raw colour data for both themes), `src/styles/tokens.css.ts` (theme contract plus type, spacing, radius, and motion tokens), a CI-enforced WCAG contrast test over both palettes, and a placeholder Library route rendering the S2 true-empty state. Real screens, Dexie persistence, and the PWA shell arrive in Phase 1. Scripts: `pnpm dev`, `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm preview`.
