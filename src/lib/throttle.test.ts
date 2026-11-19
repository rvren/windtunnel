import { describe, expect, it } from "vitest";

import { throttled } from "./throttle";

/** A clock the test moves by hand, with the timers it would fire. */
function fakeTimers() {
  let time = 0;
  let next = 1;
  const pending = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => time,
    setTimeout: (fn: () => void, ms: number) => {
      const id = next++;
      pending.set(id, { at: time + ms, fn });
      return id;
    },
    clearTimeout: (id: unknown) => {
      pending.delete(id as number);
    },
    advance(ms: number) {
      time += ms;
      for (const [id, timer] of [...pending]) {
        if (timer.at <= time) {
          pending.delete(id);
          timer.fn();
        }
      }
    },
    waiting: () => pending.size,
  };
}

describe("throttled", () => {
  it("runs at once when it has been quiet", () => {
    const timers = fakeTimers();
    let runs = 0;
    const call = throttled(() => runs++, 750, timers);
    call();
    expect(runs).toBe(1);
  });

  it("folds a burst into one call now and one at the end of the wait", () => {
    const timers = fakeTimers();
    let runs = 0;
    const call = throttled(() => runs++, 750, timers);
    for (let i = 0; i < 200; i += 1) call();
    expect(runs).toBe(1);
    expect(timers.waiting()).toBe(1);
    timers.advance(749);
    expect(runs).toBe(1);
    timers.advance(1);
    expect(runs).toBe(2);
    expect(timers.waiting()).toBe(0);
  });

  it("runs again at once after a quiet spell", () => {
    const timers = fakeTimers();
    let runs = 0;
    const call = throttled(() => runs++, 750, timers);
    call();
    timers.advance(1000);
    call();
    expect(runs).toBe(2);
  });

  it("drops the waiting call when cancelled", () => {
    const timers = fakeTimers();
    let runs = 0;
    const call = throttled(() => runs++, 750, timers);
    call();
    call();
    call.cancel();
    timers.advance(2000);
    expect(runs).toBe(1);
  });
});
