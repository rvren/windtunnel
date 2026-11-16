import { describe, expect, it } from "vitest";

import { followingRun, mayStart, monthStart, nextRunAt } from "./plan";

const at = (text: string) => new Date(text);

describe("when a scheduled run is due", () => {
  it("runs at the next time the clock reaches the hour", () => {
    expect(nextRunAt("daily", 6, at("2026-11-16T05:30:00"))).toEqual(
      at("2026-11-16T06:00:00"),
    );
    // Past the hour today: tomorrow.
    expect(nextRunAt("daily", 6, at("2026-11-16T06:00:00"))).toEqual(
      at("2026-11-17T06:00:00"),
    );
    expect(nextRunAt("off", 6, at("2026-11-16T05:00:00"))).toBeNull();
  });

  it("comes back a day or a week after a run", () => {
    const ran = at("2026-11-16T06:00:30");
    expect(followingRun("daily", 6, ran)).toEqual(at("2026-11-17T06:00:00"));
    expect(followingRun("weekly", 6, ran)).toEqual(at("2026-11-23T06:00:00"));
  });

  it("counts spending from the first of the month", () => {
    expect(monthStart(at("2026-11-16T10:00:00"))).toEqual(
      at("2026-11-01T00:00:00"),
    );
  });
});

describe("whether a scheduled run may start", () => {
  it("stops before the next run would pass the cap", () => {
    expect(
      mayStart({ capUsd: 10, spentUsd: 6, lastRunUsd: 3, free: false }),
    ).toEqual({ ok: true });
    const refused = mayStart({
      capUsd: 10,
      spentUsd: 8,
      lastRunUsd: 3,
      free: false,
    });
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.note).toContain("cap of $10.00");
  });

  it("lets a free run or an uncapped schedule through", () => {
    expect(
      mayStart({ capUsd: 1, spentUsd: 5, lastRunUsd: 3, free: true }).ok,
    ).toBe(true);
    expect(
      mayStart({ capUsd: null, spentUsd: 500, lastRunUsd: 3, free: false }).ok,
    ).toBe(true);
  });
});
