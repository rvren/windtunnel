import type { OutageHop, RunRecord } from "./schema";

/*
 * Saved runs, mended as they are read. A run saved before a fix keeps what
 * the bug wrote; this mends what can be mended without changing anything
 * the run found. Pure; the store applies it to every run it returns.
 */

export function repairRun(run: RunRecord): RunRecord {
  return repairHopIds(run);
}

/**
 * Engine Out runs saved before hops were numbered as they were filed may
 * hold one id more than once: the model filed several hops at once, and
 * each took the same number. The first keeps its id; each later one gets
 * its own (`outage-1-2`), and the finding made from that hop takes the
 * same new id, so lists, the map and the tunnel can tell them apart.
 */
function repairHopIds(run: RunRecord): RunRecord {
  const hops = run.outage?.hops;
  if (!run.outage || !hops) return run;
  if (new Set(hops.map((hop) => hop.id)).size === hops.length) return run;

  const taken = new Set(hops.map((hop) => hop.id));
  const seen = new Map<string, number>();
  const mended: OutageHop[] = hops.map((hop) => {
    const count = (seen.get(hop.id) ?? 0) + 1;
    seen.set(hop.id, count);
    if (count === 1) return hop;
    let next = count;
    while (taken.has(`${hop.id}-${next}`)) next += 1;
    const id = `${hop.id}-${next}`;
    taken.add(id);
    return { ...hop, id };
  });

  // A hop's finding has its id, its effect and its lines: match each
  // finding to the first hop not yet matched that has all three.
  const used = new Set<number>();
  const groups = run.groups.map((group) => {
    const index = hops.findIndex(
      (hop, at) =>
        !used.has(at) &&
        hop.id === group.id &&
        hop.effect === group.summary &&
        hop.location.path === group.location?.path &&
        hop.location.startLine === group.location?.startLine,
    );
    if (index < 0) return group;
    used.add(index);
    const id = mended[index].id;
    return id === group.id ? group : { ...group, id };
  });

  return { ...run, outage: { ...run.outage, hops: mended }, groups };
}
