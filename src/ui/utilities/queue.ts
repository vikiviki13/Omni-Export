export class CancelledError extends Error {
  constructor() {
    super('Export cancelled');
    this.name = 'CancelledError';
  }
}

export class CancelToken {
  private _cancelled = false;
  readonly sessionId = Math.floor(Math.random() * 1e9);
  private listeners: Array<() => void> = [];
  get cancelled() {
    return this._cancelled;
  }
  cancel() {
    this._cancelled = true;
    this.listeners.forEach((l) => l());
  }
  onCancel(fn: () => void) {
    this.listeners.push(fn);
  }
  throwIfCancelled() {
    if (this._cancelled) throw new CancelledError();
  }
}

export const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

/** Runs `worker` over items with at most `limit` in flight; results keep input order. */
export async function runQueue<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  token?: CancelToken,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      token?.throwIfCancelled();
      const i = next++;
      results[i] = await worker(items[i], i);
      await yieldToUi();
    }
  };
  const lanes = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane);
  await Promise.all(lanes);
  return results;
}
