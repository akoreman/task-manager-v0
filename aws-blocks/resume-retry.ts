import { DatabaseErrors, isBlocksError } from '@aws-blocks/blocks';

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
