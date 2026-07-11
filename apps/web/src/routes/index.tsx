import { createFileRoute } from '@tanstack/react-router';

import { LibraryEmpty } from '../features/library/LibraryEmpty';

// S2 Library (frontend spec §1.1). Phase 0 renders only its true-empty state.
export const Route = createFileRoute('/')({
  component: LibraryEmpty,
});
