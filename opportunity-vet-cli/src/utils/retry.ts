export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  retryableStatuses?: number[];
}

const DEFAULT_RETRYABLE = [429, 500, 502, 503];

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 1000,
    retryableStatuses = DEFAULT_RETRYABLE,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;

      const status = getErrorStatus(error);
      const isRetryable =
        status !== undefined && retryableStatuses.includes(status);
      const isNetworkError = isNetworkLikeError(error);

      if (!isRetryable && !isNetworkError) {
        throw error;
      }

      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(3, attempt - 1);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

function getErrorStatus(error: unknown): number | undefined {
  if (error && typeof error === "object" && "status" in error) {
    return (error as { status: number }).status;
  }
  return undefined;
}

function isNetworkLikeError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("timeout") ||
      msg.includes("econnreset") ||
      msg.includes("econnrefused") ||
      msg.includes("fetch failed")
    );
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
