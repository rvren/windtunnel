/*
 * The eval of the agents on code. See evals/agents-on-code/PLAN.md.
 *
 *   pnpm eval:agents --check                 grader check on the answer keys (free)
 *   pnpm eval:agents --sample                the whole harness on the scripted model (free)
 *   pnpm eval:agents --cases sf-catalog --reps 1     a paid pilot
 *   pnpm eval:agents --reps 3                the full baseline (paid)
 *
 * Every case runs the real engine (executeRun) on a fresh copy of the code,
 * with the fix and work-order stages left out. Results go to
 * .claude/hillclimb/agents-on-code/<variant>/: results.jsonl (one row per
 * case and repeat, written as it finishes), traces/, runs/ (the whole run
 * record) and errors.jsonl (runs that failed for reasons other than the
 * agents). A run started again skips what is already written.
 *
 * Paid runs bill ANTHROPIC_API_KEY. The script refuses to start them until
 * the harness is approved (--approve-harness), and again whenever the
 * runner, the grader or a key changes.
 */

import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import {
  appendFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { DEFAULT_MODELS } from "../../src/server/engine/config";
import { AnthropicLlm, type MessageRecord } from "../../src/server/engine/llm";
import { executeRun, newRun } from "../../src/server/engine/run";
import { ScriptedLlm } from "../../src/server/engine/sample";
import {
  sampleProjectScript,
  sampleServiceOf,
} from "../../src/server/engine/sample-project";
import type { RunRecord, Usage } from "../../src/server/engine/schema";
import { MemoryRunStore } from "../../src/server/engine/store";
import {
  candidatesOf,
  matchInCode,
  score,
  type CaseKey,
  type Verdict,
} from "../../src/server/eval/grade";
import { judgeLeftovers, MATCH_MODEL } from "../../src/server/eval/judge";

const run = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, "../..");
const KEYS = path.join(ROOT, "evals/agents-on-code/key");
const FLOW = path.join(ROOT, ".claude/hillclimb/agents-on-code");
const STOREFRONT = path.join(ROOT, "samples/storefront");
const SERVICES = [
  "auth",
  "billing",
  "catalog",
  "gateway",
  "notifications",
  "orders",
  "web",
];

// ── Arguments ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string, fallback: string) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};
const sample = flag("sample");
const variant = value("variant", sample ? "sample" : "baseline");
const reps = Number(value("reps", "3"));
const timeoutMs = Number(value("timeout-min", "40")) * 60_000;
const parallel = Number(value("parallel", "2"));

// ── Keys and code ───────────────────────────────────────────────────────────

interface DvnaKey extends CaseKey {
  repository: string;
  commit: string;
}

async function loadKeys(): Promise<CaseKey[]> {
  const files = (await readdir(KEYS)).filter((name) => name.endsWith(".json"));
  const keys = await Promise.all(
    files.map(
      async (name) =>
        JSON.parse(await readFile(path.join(KEYS, name), "utf8")) as CaseKey,
    ),
  );
  return keys.sort((a, b) => a.case.localeCompare(b.case));
}

/** The services a case reads, as workspace names. */
const servicesOf = (name: string) =>
  name === "sf-project"
    ? SERVICES
    : name.startsWith("sf-")
      ? [name.slice(3)]
      : ["dvna"];

let dvnaSource: Promise<string> | null = null;

/** DVNA at the key's commit, cloned once; nothing in it is ever run. */
function dvnaClone(key: DvnaKey, work: string): Promise<string> {
  dvnaSource ??= (async () => {
    const dir = path.join(work, "_dvna-source");
    await mkdir(dir, { recursive: true });
    await run("git", ["init", "-q"], { cwd: dir });
    await run(
      "git",
      ["fetch", "-q", "--depth", "1", key.repository, key.commit],
      {
        cwd: dir,
      },
    );
    await run("git", ["checkout", "-q", "FETCH_HEAD"], { cwd: dir });
    await rm(path.join(dir, ".git"), { recursive: true, force: true });
    return dir;
  })();
  return dvnaSource;
}

/**
 * A fresh copy of the case's code under the work folder, with every file
 * that explains the flaws removed. Returns the folder per workspace.
 */
async function prepareCode(
  key: CaseKey,
  rep: number,
  work: string,
): Promise<{ name: string; folder: string }[]> {
  const base = path.join(work, `${key.case}-rep${rep}`);
  await rm(base, { recursive: true, force: true });
  const out: { name: string; folder: string }[] = [];
  for (const name of servicesOf(key.case)) {
    const target = path.join(base, name);
    const source =
      key.case === "dvna"
        ? await dvnaClone(key as DvnaKey, work)
        : path.join(STOREFRONT, name);
    await cp(source, target, { recursive: true });
    for (const hidden of key.hidden_from_agents ?? []) {
      await rm(path.join(target, hidden), { recursive: true, force: true });
    }
    out.push({ name, folder: path.relative(work, target) });
  }
  return out;
}

// ── The grader check (free) ─────────────────────────────────────────────────

/** Every key entry points at real lines, and the key grades itself 100%. */
async function check(keys: CaseKey[]) {
  const work = await mkdtemp(path.join(os.tmpdir(), "windtunnel-eval-check-"));
  let problems = 0;
  try {
    for (const key of keys) {
      const folders = await prepareCode(key, 0, work);
      const single = folders.length === 1;
      for (const flaw of key.flaws) {
        for (const place of [
          { file: flaw.file, lines: flaw.lines },
          ...(flaw.files ?? []),
        ]) {
          const file = single
            ? path.join(work, folders[0].folder, place.file)
            : path.join(work, path.dirname(folders[0].folder), place.file);
          try {
            const count = (await readFile(file, "utf8")).split("\n").length;
            if (
              place.lines[0] < 1 ||
              place.lines[1] > count ||
              place.lines[0] > place.lines[1]
            ) {
              problems += 1;
              console.log(
                `  ${flaw.id}: lines ${place.lines.join("-")} outside ${place.file} (${count} lines)`,
              );
            }
          } catch {
            problems += 1;
            console.log(
              `  ${flaw.id}: ${place.file} is not in the code the agents read`,
            );
          }
        }
      }
      // The oracle: the key itself, filed as findings.
      const oracle = key.flaws.map((flaw, index) => ({
        uid: `oracle/${index}`,
        agentId: "adversarial_user" as const,
        title: flaw.title,
        description: flaw.why,
        kind: flaw.kind,
        severity: flaw.severity,
        place: { file: flaw.file, lines: flaw.lines },
        accepted: true,
      }));
      const { verdicts, leftovers } = matchInCode(key, oracle);
      // An entry sharing its exact lines with another is left to the judge;
      // what code does match must be the right entry.
      const wrong = oracle.filter((item, index) => {
        const found = verdicts.get(item.uid);
        return found?.kind === "match" && found.flawId !== key.flaws[index].id;
      });
      const full = score(key, oracle, verdicts);
      const none = score(key, [], new Map());
      const ok = wrong.length === 0 && none.recallReported === 0;
      if (!ok) problems += 1;
      console.log(
        `${ok ? "ok  " : "FAIL"} ${key.case}: ${key.flaws.length} flaws; code matches ${verdicts.size} to the right entry${wrong.length ? `, ${wrong.length} to the wrong one` : ""}, ${leftovers.length} left to the judge (${leftovers.map((item) => key.flaws[oracle.findIndex((other) => other.uid === item.uid)].id).join(", ") || "none"}); key scores at least ${pct(full.recallReported)}, no findings ${pct(none.recallReported)}`,
      );
    }
  } finally {
    await rm(work, { recursive: true, force: true });
  }
  console.log(
    problems
      ? `\n${problems} problem(s).`
      : "\nThe keys and the grader check out.",
  );
  process.exitCode = problems ? 1 : 0;
}

// ── Harness approval ────────────────────────────────────────────────────────

const HARNESS = [
  "scripts/eval/agents-on-code.ts",
  "src/server/eval/grade.ts",
  "src/server/eval/judge.ts",
];

async function harnessSha(): Promise<string> {
  const hash = createHash("sha256");
  const keys = (await readdir(KEYS))
    .sort()
    .map((name) => path.join("evals/agents-on-code/key", name));
  for (const file of [...HARNESS, ...keys]) {
    hash.update(file);
    hash.update(await readFile(path.join(ROOT, file)));
  }
  return hash.digest("hex");
}

const STATE = path.join(FLOW, "_state.json");

async function readState(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(STATE, "utf8"));
  } catch {
    return {};
  }
}

const METRICS = [
  { id: "recall_reported", label: "Recall", kind: "continuous" },
  { id: "serious_reported", label: "Crit+high", kind: "continuous" },
  { id: "precision_reported", label: "Precision", kind: "continuous" },
  { id: "recall_any", label: "Found (any)", kind: "continuous" },
  { id: "judge_kept", label: "Judge kept", kind: "continuous" },
  { id: "judge_dropped", label: "Judge drop", kind: "continuous" },
];

// ── One case ────────────────────────────────────────────────────────────────

const ZERO: Usage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};
const add = (a: Usage, b: Usage): Usage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
  cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
});
const apiUsage = (usage: Usage) => ({
  input_tokens: usage.inputTokens,
  output_tokens: usage.outputTokens,
  cache_read_input_tokens: usage.cacheReadTokens,
  cache_creation_input_tokens: usage.cacheWriteTokens,
});
const pct = (n: number | null) =>
  n === null ? "—" : `${Math.round(n * 100)}%`;

/** A model answered that was not the one asked (beyond a dated snapshot). */
const substituted = (record: MessageRecord) =>
  !record.served.startsWith(record.requested);

async function runCase(key: CaseKey, rep: number, work: string, dir: string) {
  const started = Date.now();
  const folders = await prepareCode(key, rep, work);
  const records: MessageRecord[] = [];
  const llm = sample
    ? new ScriptedLlm(
        sampleProjectScript(
          folders.map((item) => ({
            name: item.name,
            service: sampleServiceOf({ kind: "local", name: item.name }),
          })),
        ),
      )
    : new AnthropicLlm((record) => records.push(record));
  const fresh = newRun(
    randomUUID(),
    {
      requirement: "",
      documents: [],
      project: {
        id: `eval-${key.case}`,
        name: key.case,
        workspaces: folders.map((item) => ({
          name: item.name,
          origin: { kind: "local" as const, name: item.folder },
        })),
      },
    },
    DEFAULT_MODELS,
    new Date(),
    sample,
  );
  const done: RunRecord = await executeRun(
    {
      llm,
      store: new MemoryRunStore(),
      publish: () => {},
      now: () => new Date(),
      skip: ["chains", "remediation", "work_orders"],
    },
    fresh,
  );
  if (done.status !== "completed") {
    throw Object.assign(new Error(done.error ?? "The run did not complete."), {
      failure: "run_failed",
      usage: records.reduce((sum, item) => add(sum, item.usage), ZERO),
    });
  }

  // Grade: code first, then the matching judge for the rest.
  const candidates = candidatesOf(done);
  const inCode = matchInCode(key, candidates);
  const judgeRecords: MessageRecord[] = [];
  const judged = sample
    ? { verdicts: new Map<string, Verdict>(), usage: null }
    : await judgeLeftovers(
        new AnthropicLlm((record) => judgeRecords.push(record)),
        key,
        inCode.leftovers,
      );
  const verdicts = new Map([...inCode.verdicts, ...judged.verdicts]);
  const result = score(key, candidates, verdicts);

  const usage = records.reduce((sum, item) => add(sum, item.usage), ZERO);
  const judgeUsage = judgeRecords.reduce(
    (sum, item) => add(sum, item.usage),
    ZERO,
  );
  const fallbacks = records.filter(substituted).map((item) => ({
    stage: item.stage,
    requested: item.requested,
    served: item.served,
  }));

  const id = `${key.case}_rep${rep}`;
  await writeFile(
    path.join(dir, "runs", `${id}.json`),
    JSON.stringify(done, null, 2),
  );
  const verdictOf = (uid: string) => verdicts.get(uid);
  const trace = [
    {
      role: "system",
      content: `Windtunnel run of ${key.case} (${servicesOf(key.case).join(", ")}), key version ${key.version}. Agents ${DEFAULT_MODELS.agents}, reasoning ${DEFAULT_MODELS.reasoning}.`,
    },
    ...done.agents.map((agent) => ({
      role: "assistant",
      name: agent.agentId,
      content: agent.findings.length
        ? agent.findings
            .map((finding) => {
              const found = verdictOf(finding.uid);
              const mark = !found
                ? "undecided"
                : found.kind === "match"
                  ? `matches ${found.flawId}`
                  : found.kind;
              const kept = candidates.find((item) => item.uid === finding.uid)
                ?.accepted
                ? "kept"
                : "dropped by the judge";
              return `- [${finding.severity}] ${finding.title} (${finding.location?.path ?? "no file"}:${finding.location?.startLine ?? "?"}) → ${mark}, ${kept}`;
            })
            .join("\n")
        : `No findings (${agent.status}${agent.error ? `: ${agent.error}` : ""}).`,
    })),
    {
      role: "tool_result",
      content: `Known flaws missed by the report:\n${
        key.flaws
          .filter(
            (flaw) =>
              !candidates.some(
                (item) =>
                  item.accepted &&
                  verdictOf(item.uid)?.kind === "match" &&
                  (verdictOf(item.uid) as { flawId: string }).flawId ===
                    flaw.id,
              ),
          )
          .map(
            (flaw) =>
              `- ${flaw.id} [${flaw.severity}] ${flaw.title} (${flaw.file}:${flaw.lines.join("-")})`,
          )
          .join("\n") || "none"
      }`,
    },
  ];
  await writeFile(
    path.join(dir, "traces", `${id}.json`),
    JSON.stringify(trace, null, 2),
  );

  return {
    prompt_id: key.case,
    rep,
    prompt: `${key.case}: ${servicesOf(key.case).join(", ")}`,
    tags: [
      key.case === "dvna" ? "dvna" : "storefront",
      `${key.flaws.length} flaws`,
    ],
    status: "ok",
    stop_reason: "end_turn",
    grade: {
      recall_reported: result.recallReported ?? 0,
      serious_reported: result.seriousReported ?? 0,
      precision_reported: result.precisionReported ?? 0,
      recall_any: result.recall ?? 0,
      judge_kept: result.judgeKept ?? 0,
      judge_dropped: result.judgeDropped ?? 0,
    },
    model:
      records.find((item) => item.requested === DEFAULT_MODELS.agents)
        ?.served ?? DEFAULT_MODELS.agents,
    usage: apiUsage(usage),
    judge_model: MATCH_MODEL,
    judge_usage: apiUsage(judgeUsage),
    latency_s: Math.round((Date.now() - started) / 1000),
    meta: {
      key_version: key.version,
      agents: result.agents,
      unlisted: candidates
        .filter((item) => verdictOf(item.uid)?.kind === "unlisted")
        .map((item) => ({
          uid: item.uid,
          title: item.title,
          place: item.place,
        })),
      undecided: candidates.filter((item) => !verdictOf(item.uid)).length,
      fallbacks,
      calls: records.length,
      usage_by_model: Object.fromEntries(
        [...new Set(records.map((item) => item.served))].map((model) => [
          model,
          apiUsage(
            records
              .filter((item) => item.served === model)
              .reduce((sum, item) => add(sum, item.usage), ZERO),
          ),
        ]),
      ),
    },
  };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function exists(file: string) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const keys = await loadKeys();
  if (flag("check")) return check(keys);

  const wanted = value("cases", "").split(",").filter(Boolean);
  const cases = wanted.length
    ? keys.filter((key) => wanted.includes(key.case))
    : keys;
  const chosen = sample ? cases.filter((key) => key.case !== "dvna") : cases;
  if (chosen.length === 0) throw new Error("No such case.");

  await mkdir(FLOW, { recursive: true });
  const state = await readState();
  const sha = await harnessSha();
  if (!sample) {
    if (!process.env.ANTHROPIC_API_KEY)
      throw new Error("ANTHROPIC_API_KEY is not set.");
    if (flag("approve-harness")) {
      state.harness_sha = sha;
    } else if (state.harness_sha !== sha) {
      console.error(
        "The runner, the grader or a key changed since the harness was approved.\nRead the change, then run again with --approve-harness.",
      );
      process.exitCode = 2;
      return;
    }
  }
  state.metrics = METRICS;
  state.perf_fields = ["latency_s", "usage"];
  state.harness_paths = [...HARNESS, "evals/agents-on-code/key/"];
  await writeFile(STATE, JSON.stringify(state, null, 2));

  const dir = path.join(FLOW, variant);
  await mkdir(path.join(dir, "traces"), { recursive: true });
  await mkdir(path.join(dir, "runs"), { recursive: true });
  const resultsFile = path.join(dir, "results.jsonl");
  const done = new Set(
    (await exists(resultsFile))
      ? (await readFile(resultsFile, "utf8"))
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line) as { prompt_id: string; rep: number })
          .map((row) => `${row.prompt_id}#${row.rep}`)
      : [],
  );

  const work = await mkdtemp(path.join(os.tmpdir(), "windtunnel-eval-"));
  process.env.WINDTUNNEL_REPOS_DIR = work;
  const queue = chosen.flatMap((key) =>
    Array.from({ length: reps }, (_, rep) => ({ key, rep })).filter(
      (item) => !done.has(`${item.key.case}#${item.rep}`),
    ),
  );
  console.log(
    `${variant}: ${queue.length} run(s) to go (${chosen.length} case(s) × ${reps} repeat(s), ${done.size} already done)${sample ? ", scripted model, free" : ""}.`,
  );

  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const { key, rep } = item;
      const label = `${key.case} #${rep}`;
      try {
        let timer: NodeJS.Timeout | undefined;
        const row = await Promise.race([
          runCase(key, rep, work, dir),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () =>
                reject(
                  Object.assign(new Error("Out of time."), {
                    failure: "timeout",
                  }),
                ),
              timeoutMs,
            );
          }),
        ]).finally(() => clearTimeout(timer));
        await appendFile(resultsFile, `${JSON.stringify(row)}\n`);
        console.log(
          `  ${label}: recall ${pct(row.grade.recall_reported)}, critical+high ${pct(row.grade.serious_reported)}, precision ${pct(row.grade.precision_reported)}, ${row.latency_s}s${row.meta.fallbacks.length ? `, ${row.meta.fallbacks.length} fallback(s)` : ""}`,
        );
      } catch (error) {
        const failure =
          (error as { failure?: string }).failure ?? "harness_error";
        await appendFile(
          path.join(dir, "errors.jsonl"),
          `${JSON.stringify({
            prompt_id: key.case,
            rep,
            failure,
            error: error instanceof Error ? error.message : String(error),
            usage: (error as { usage?: Usage }).usage
              ? apiUsage((error as { usage: Usage }).usage)
              : null,
            at: new Date().toISOString(),
          })}\n`,
        );
        console.log(
          `  ${label}: ${failure}: ${error instanceof Error ? error.message : error}`,
        );
      } finally {
        await rm(path.join(work, `${key.case}-rep${rep}`), {
          recursive: true,
          force: true,
        });
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.max(1, parallel) }, worker));
  } finally {
    await rm(work, { recursive: true, force: true });
  }
  console.log(`Results: ${path.relative(ROOT, resultsFile)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
