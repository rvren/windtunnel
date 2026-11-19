/*
 * Calls `run` at most once every `ms`: at once when it has been quiet, and
 * once more at the end of the wait when calls came in during it, so the
 * last call is never lost. The run page fetches the saved run this way: a
 * replayed run sends hundreds of events in a burst, and each one would
 * otherwise fetch it again.
 */

export interface Throttled {
  (): void;
  /** Drops a waiting call; nothing runs after this. */
  cancel: () => void;
}

export function throttled(
  run: () => void,
  ms: number,
  timers: {
    now: () => number;
    setTimeout: (fn: () => void, ms: number) => unknown;
    clearTimeout: (handle: unknown) => void;
  } = {
    now: () => Date.now(),
    setTimeout: (fn, wait) => setTimeout(fn, wait),
    clearTimeout: (handle) =>
      clearTimeout(handle as ReturnType<typeof setTimeout>),
  },
): Throttled {
  let last = -Infinity;
  let waiting: unknown = null;
  const fire = () => {
    waiting = null;
    last = timers.now();
    run();
  };
  const call = (() => {
    if (waiting !== null) return;
    const wait = last + ms - timers.now();
    if (wait <= 0) fire();
    else waiting = timers.setTimeout(fire, wait);
  }) as Throttled;
  call.cancel = () => {
    if (waiting !== null) timers.clearTimeout(waiting);
    waiting = null;
  };
  return call;
}
