import { useSyncExternalStore } from 'react';

import { getJob, subscribeJobs, type ExtractionJob } from '../features/review/jobStore';

/**
 * One in-page extraction job, live (frontend spec §6). undefined when the id
 * names nothing: jobs are ephemeral, so a stale bookmark or a reload
 * degrades to the plain entry screen rather than a spinner with no engine
 * behind it.
 */
export function useExtractionJob(jobId: string | undefined): ExtractionJob | undefined {
  return useSyncExternalStore(
    subscribeJobs,
    () => (jobId === undefined ? undefined : getJob(jobId)),
    () => undefined
  );
}
