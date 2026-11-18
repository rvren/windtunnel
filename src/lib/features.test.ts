import { describe, expect, it } from "vitest";

import { RUN_KINDS } from "@/server/engine/schema";

import { FEATURES, featureOf, plainTitle } from "./features";

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
        "example",
      ] as const) {
        expect(feature[field].trim(), `${feature.kind}.${field}`).not.toBe("");
      }
      expect(feature.actors.length).toBeGreaterThan(0);
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
