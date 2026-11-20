import { describe, expect, it } from "vitest";

import { RUN_KINDS } from "@/server/engine/schema";

import { FEATURES, JOBS, featureOf, plainTitle } from "./features";

describe("FEATURES", () => {
  it("describes every kind of run once, with every field filled", () => {
    expect(FEATURES.map((feature) => feature.kind).sort()).toEqual(
      [...RUN_KINDS].sort(),
    );
    for (const feature of FEATURES) {
      for (const field of [
        "name",
        "start",
        "promise",
        "question",
        "input",
        "output",
        "team",
        "example",
      ] as const) {
        expect(feature[field].trim(), `${feature.kind}.${field}`).not.toBe("");
      }
      expect(feature.actors.length).toBeGreaterThan(0);
    }
  });

  it("groups every kind under exactly one job, with its words", () => {
    const grouped = JOBS.flatMap((job) => job.kinds);
    expect([...grouped].sort()).toEqual([...RUN_KINDS].sort());
    for (const job of JOBS) {
      expect(job.title.trim(), job.id).not.toBe("");
      expect(job.lead.trim(), job.id).not.toBe("");
      expect(job.kinds.length, job.id).toBeGreaterThan(0);
    }
  });

  it("finds a feature by its kind", () => {
    expect(featureOf("flyoff").name).toBe("Fly-off");
  });
});

describe("plainTitle", () => {
  it("drops the kind the engine put in front", () => {
    expect(plainTitle("Crosswind: Move sessions")).toBe("Move sessions");
    expect(plainTitle("Black box: 500 on GET /")).toBe("500 on GET /");
    expect(plainTitle("Storefront")).toBe("Storefront");
  });
});
