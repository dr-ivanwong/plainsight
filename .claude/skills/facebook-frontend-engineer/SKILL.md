---
name: facebook-frontend-engineer
description: Meta/Facebook-calibre frontend engineering principles — component architecture, state management, rendering performance, type safety, and client resilience. Use this skill for ANY work on client-side application code — writing or reviewing React components, hooks, state stores, data fetching, forms, routing, bundle size or re-render performance, component tests, or error handling in the UI. Trigger even when the user doesn't say "frontend" but the task touches .tsx/.jsx files, components, hooks, or anything that renders in a browser or app shell.
---

# Facebook Frontend Engineer

Apply these principles as the default standard for all frontend work. They are deliberately general: when a project's recorded decision (an ADR or design spec) deviates from them, follow the recorded decision — but a deviation that isn't recorded is a gap, not a decision. Propose recording it when you need to deviate.

## The component model — UI is a function of state

- **Data flows one way.** State lives somewhere definite; the view is derived from it; events flow back up to change it. The moment rendering mutates state, or two copies of the same fact exist, you've bought a class of bugs that one-way flow exists to make impossible. Derive, don't duplicate — store the minimal source of truth and compute everything else.
- **Composition over configuration.** Build small components that combine, not big components with mode flags. Separate the *what* from the *how*: presentational components are pure functions of props (no fetching, no store access); data access lives in container hooks that own queries and expose typed results. This split is what makes both halves testable and reusable.
- **Props are contracts.** Keep them small, typed, and honest. A component crossing ~8 props is usually two components wearing one name — treat it as a design signal, not a lint nuisance. When several pieces genuinely share implicit state (tabs, comparison columns), reach for compound components rather than prop-drilling a control panel through the tree.

## State discipline

- **Server cache is not app state.** Data fetched from a server (with its staleness, retries, invalidation) and UI state (selection, toggles, drafts) have different lifecycles — manage them with different tools, or the cache's problems become the UI's problems.
- **Colocate state as close to its use as possible,** lifting it only when genuinely shared. Global stores are for genuinely global facts; everything else in a global store is a re-render subscription you didn't need and a coupling you'll pay for.
- **The URL is state.** Anything the user should be able to bookmark, share, or dismiss with the back button — open sheets, selected tabs, active filters — belongs in the route or query params, not in memory. Back-button correctness is a launch requirement, not polish.
- **Make illegal states unrepresentable.** Model with discriminated unions so `loading`/`error`/`data` can't coexist wrongly; a type system that permits `{ isLoading: true, data: X }` will eventually render it.

## Performance is architecture, not an afterthought

- **Set budgets and enforce them in CI** — initial bundle size, time-to-interactive on a mid-range device — because unbudgeted performance only ever degrades. Code-split by route so the first paint pays only for the first screen; heavy libraries (charts, editors, parsers) load with the feature that uses them, never in the shell.
- **The render tree is the performance model.** A keystroke must never re-render the world: colocate volatile state (form fields hold local state, commit on blur/debounce) so high-frequency updates stay in a leaf. Prefer restructuring state over sprinkling memoization — `memo`/`useMemo` are targeted tools applied after measuring, not incantations applied everywhere.
- **Measure before optimizing, virtualize when measured.** Long lists get virtualization when profiling says so; speculative optimization buys complexity with no receipt.

## Type safety, end to end

TypeScript strict mode, no unexplained `any`. Types flow from a single schema source: validate at every boundary — API responses, storage reads, form input — and *infer* the static types from those schemas rather than writing them twice, so the compile-time picture can't drift from the runtime check. External data is untrusted input even when you wrote the server, because versions skew and caches outlive deploys.

## Resilience in the client

- **Error boundaries per feature region**, not one global catch-all: a crashed chart must never take down the form holding unsaved input. Each boundary offers a human explanation and a way forward (retry, escape hatch).
- **Optimistic UI with rollback** where latency would otherwise block the user — apply the change locally, reconcile with the server, and be able to undo cleanly on failure.
- **Never lose user work.** Autosave drafts continuously; treat storage quota and write failures as designed-for states with a visible recovery path, not exceptions.

## Testing — behavior, not implementation

Test components the way a user experiences them: query by role and label, assert on visible outcomes, and avoid reaching into internals — tests coupled to implementation detail punish refactoring, which is exactly when you need them most. Component tests carry most of the load; a few end-to-end tests cover the journeys that matter; visual regression belongs on the design-system layer where a pixel change is meaningful. Snapshot dumps of whole trees assert everything and therefore nothing — prefer explicit assertions.

## Ship discipline

Semantic HTML is the free correctness-and-accessibility layer — use real buttons, labels, and headings before reaching for ARIA and divs. Gate risky work behind feature flags and roll out incrementally; a flag that has fully shipped is dead code, and dead code gets deleted the day it dies (version control remembers). Every dependency is a liability — bundle bytes, upgrade churn, supply chain — priced before adoption, and the bar rises for anything that ships to every user on every page load.
