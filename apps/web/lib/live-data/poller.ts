export const LIVE_DATA_INTERVAL_MS = 15_000;
export const LIVE_DATA_MAX_BACKOFF_MS = 120_000;

type Scheduler = {
  set(callback: () => void, delay: number): unknown;
  clear(timer: unknown): void;
};

/** A single request at a time; aborted/late results never replace visible data. */
export function createDataPoller<T>({ request, onData, onError, isActive, scheduler = {
  set: (callback, delay) => setTimeout(callback, delay),
  clear: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
} }: {
  request: (signal: AbortSignal) => Promise<T>;
  onData: (data: T) => void;
  onError: () => void;
  isActive: () => boolean;
  scheduler?: Scheduler;
}) {
  let stopped = false;
  let timer: unknown;
  let current: AbortController | null = null;
  let failures = 0;
  let refreshAfterCurrent = false;

  function clear() {
    if (timer !== undefined) scheduler.clear(timer);
    timer = undefined;
  }
  function schedule(delay: number) {
    clear();
    if (!stopped && isActive()) timer = scheduler.set(() => { timer = undefined; void run(); }, delay);
  }
  async function run() {
    if (stopped || !isActive()) return;
    if (current) { refreshAfterCurrent = true; return; }
    const controller = new AbortController();
    current = controller;
    try {
      const data = await request(controller.signal);
      if (!stopped && !controller.signal.aborted && isActive()) {
        failures = 0;
        onData(data);
      }
    } catch {
      if (!stopped && !controller.signal.aborted && isActive()) {
        failures += 1;
        onError();
      }
    } finally {
      current = null;
      const immediate = refreshAfterCurrent;
      refreshAfterCurrent = false;
      schedule(immediate ? 0 : Math.min(LIVE_DATA_INTERVAL_MS * 2 ** Math.min(failures, 4), LIVE_DATA_MAX_BACKOFF_MS));
    }
  }
  return {
    start() { schedule(LIVE_DATA_INTERVAL_MS); },
    refresh() { clear(); void run(); },
    pause() { clear(); refreshAfterCurrent = false; current?.abort(); },
    stop() { stopped = true; clear(); current?.abort(); },
  };
}
