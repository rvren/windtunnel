import { describe, expect, it } from "vitest";

import type { Crew, CrewMember } from "./crew";
import type { TunnelScene } from "./tunnel-scene";
import { tipKey, tipOf } from "./tunnel-tips";

const member = (over: Partial<CrewMember>): CrewMember => ({
  id: "adversarial_user",
  name: "Attacker",
  role: "Tries to break in.",
  status: "done",
  findings: 2,
  doing: null,
  note: "2 findings",
  latest: null,
  progress: 1,
  ...over,
});

const crew = (members: CrewMember[], ended = true): Crew => ({
  members,
  stage: null,
  sentence: "",
  findings: 0,
  found: [],
  outcome: ended ? "completed" : null,
  ended,
});

const scene = (over: Partial<TunnelScene>): TunnelScene => ({
  kind: "audit",
  parts: [{ id: "cmp-catalog", name: "Catalog", plate: "services" }],
  pins: [],
  arcs: [],
  lit: [],
  cut: [],
  beacon: null,
  duel: null,
  spec: null,
  designs: null,
  critiques: [],
  crosswind: false,
  ...over,
});

describe("tipOf", () => {
  it("names a finding by its severity, who filed it, and where it is", () => {
    const tip = tipOf(
      tipKey("finding", "f1"),
      scene({
        pins: [
          {
            uid: "f1",
            by: "adversarial_user",
            part: "cmp-catalog",
            plate: "services",
            tone: "danger",
            title: "The search box can run SQL",
            severity: "critical",
            at: "catalog/search.py:4",
          },
        ],
      }),
      crew([member({})]),
    );
    expect(tip).toEqual({
      eyebrow: "Critical · Attacker",
      title: "The search box can run SQL",
      detail: null,
      mono: "catalog/search.py:4",
      tone: "danger",
    });
  });

  it("says what a worker is doing while it works, and what it came to", () => {
    const live = tipOf(
      tipKey("worker", "adversarial_user"),
      scene({}),
      crew(
        [member({ status: "running", doing: "catalog/search.py", note: null })],
        false,
      ),
    );
    expect(live).toMatchObject({
      eyebrow: "At work",
      title: "Attacker",
      detail: "catalog/search.py",
      mono: "2 findings",
      tone: "brand",
    });
    const done = tipOf(
      tipKey("worker", "adversarial_user"),
      scene({}),
      crew([member({})]),
    );
    expect(done).toMatchObject({ eyebrow: "Done", detail: "2 findings" });
  });

  it("says why a part is lit, in the words of the run's kind", () => {
    const cut = tipOf(
      tipKey("part", "cmp-catalog"),
      scene({ kind: "engineout", cut: ["cmp-catalog"] }),
      crew([]),
    );
    expect(cut).toMatchObject({
      eyebrow: "Services",
      title: "Catalog",
      detail: "Cut: the part this run takes away",
      tone: "danger",
    });
    const broken = tipOf(
      tipKey("part", "cmp-catalog"),
      scene({
        kind: "engineout",
        lit: [{ part: "cmp-catalog", tone: "danger", strength: 0.9 }],
      }),
      crew([]),
    );
    expect(broken?.detail).toBe("The failure breaks it");
  });

  it("gives a spec line its status, its words and the note", () => {
    const tip = tipOf(
      tipKey("line", "line-2"),
      scene({
        kind: "preflight",
        spec: [
          {
            id: "line-2",
            status: "contradicted",
            text: "Sessions expire after 30 minutes.",
            note: "Tokens never expire.",
          },
        ],
      }),
      crew([]),
    );
    expect(tip).toEqual({
      eyebrow: "Contradicted",
      title: "Sessions expire after 30 minutes.",
      detail: "Tokens never expire.",
      mono: null,
      tone: "danger",
    });
  });

  it("tells a duel's beacon by the last round", () => {
    const tip = tipOf(
      tipKey("beacon"),
      scene({
        kind: "dogfight",
        beacon: {
          part: "cmp-catalog",
          tone: "ok",
          label: "The search box can run SQL",
        },
        duel: {
          rounds: [
            { n: 1, verdict: "through" },
            { n: 2, verdict: "held" },
          ],
          max: 3,
          held: true,
        },
      }),
      crew([]),
    );
    expect(tip).toEqual({
      eyebrow: "Held in round 2",
      title: "The search box can run SQL",
      detail: "Round 2: the attacker found no way through",
      mono: "Catalog",
      tone: "ok",
    });
  });

  it("knows the design the judge picked", () => {
    const tip = tipOf(
      tipKey("design", "p2"),
      scene({
        kind: "flyoff",
        designs: [
          {
            id: "p2",
            name: "Scaler",
            state: "done",
            flown: true,
            picked: true,
          },
        ],
      }),
      crew([]),
    );
    expect(tip).toMatchObject({
      eyebrow: "Picked by the judge",
      title: "Scaler's design",
      detail: "Flown in the tunnel",
      tone: "ok",
    });
  });

  it("returns nothing for a thing that is no longer there", () => {
    expect(tipOf(tipKey("finding", "gone"), scene({}), crew([]))).toBeNull();
  });
});
