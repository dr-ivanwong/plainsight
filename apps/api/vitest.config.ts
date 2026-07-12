import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts']
    // No blanket coverage threshold here: the mapping's enforcement is the
    // golden corpus (integer equality against the hand-verified fixtures for
    // five companies), and the handlers get behavioural tests per route. A
    // percentage would measure neither.
  }
});
