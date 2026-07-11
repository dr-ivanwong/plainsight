// Registers the jest-dom matchers (toBeVisible and friends) with Vitest's
// expect. Testing Library's automatic cleanup between tests relies on the
// global afterEach that `test.globals: true` provides (vitest.config.ts).
import '@testing-library/jest-dom/vitest';
