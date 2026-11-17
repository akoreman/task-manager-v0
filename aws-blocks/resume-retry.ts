import { DatabaseErrors, isBlocksError } from '@aws-blocks/blocks';

// A retry starts only if a call failing as slowly as the last would still end by the handler's deadline.
// With the usual ~4 s failures and a 27 s deadline, attempts land about every 4.5 s, the last by about 22 s.
export async function withResumeRetry<T>(fn: () => Promise<T>, deadline: number): Promise<T> {
  for (;;) {
    const called = Date.now();
    try {
      return await fn();
    } catch (e) {
      const resuming = isBlocksError(e, DatabaseErrors.ConnectionFailed)
        && (e as { cause?: { name?: string } }).cause?.name === 'DatabaseResumingException';
      const now = Date.now();
      const fits = now + 500 + (now - called) <= deadline;
      if (!resuming || !fits) throw e;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}
