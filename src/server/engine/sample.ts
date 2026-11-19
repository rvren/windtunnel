import { AGENTS, type AgentId } from "@/lib/agents";

import {
  RunError,
  runTool,
  type AgentCall,
  type LlmCall,
  type LlmClient,
  type LlmResult,
} from "./llm";
import {
  Architecture,
  Blueprint,
  AttackAnswer,
  CascadeAnswer,
  ChainAnswer,
  Critique,
  FlyoffVerdict,
  HopReport,
  ImpactAnswer,
  LineReport,
  TriageAnswer,
  type AgentReport,
  type Challenges,
  type DesignModel,
  RemediationAnswer,
  type Usage,
  type Verdict,
  type WorkOrders,
} from "./schema";
import {
  SAMPLE_BLUEPRINTS,
  SAMPLE_CRITIQUE,
  SAMPLE_IMPACT,
  SAMPLE_FLYOFF_VERDICT,
} from "./sample-kinds";

/*
 * A stand-in for the model, and a small hand-written run to feed it.
 *
 * Two uses, neither of them the product:
 *   - unit tests, which must not touch the network;
 *   - the development sample mode (WINDTUNNEL_SAMPLE_RUN=1), for working on
 *     the screens without spending. Runs made that way are marked as samples.
 *
 * Nothing here is model output. Do not present it as a result.
 */

type Scripted<T> =
  | { kind: "ok"; value: T }
  | { kind: "declined"; category: string | null }
  | { kind: "error"; message: string };

export interface Script {
  model: Scripted<DesignModel>;
  /** For repository runs: the architecture the model stage returns. */
  architecture?: Architecture;
  agents: Record<AgentId, Scripted<AgentReport>>;
  /**
   * For repository runs: the tool calls each tool-using stage makes before it
   * answers, keyed by "model" or an agent id.
   */
  tools?: Partial<
    Record<"model" | AgentId | string, { tool: string; input: unknown }[]>
  >;
  /** Remediations for security findings, by group id. */
  remediations?: Record<string, Scripted<RemediationAnswer>>;
  /** What each agent says about the others' findings. Default: nothing. */
  challenges?: Partial<Record<AgentId, Scripted<Challenges>>>;
  judge: Scripted<Verdict>;
  work_orders: Scripted<WorkOrders>;
  /** The newer kinds of run; sample answers stand in when left out. */
  kinds?: {
    impact?: ImpactAnswer;
    triage?: TriageAnswer;
    /** Flutter's attack chains. None when left out. */
    chains?: ChainAnswer;
    /** Engine Out's judge, by scenario ("part:mode"). */
    cascades?: Record<string, CascadeAnswer>;
    /** Dogfight rounds, by the id of the issue defended; round 1 first. */
    duels?: Record<
      string,
      { defence: RemediationAnswer; attack: AttackAnswer }[]
    >;
  };
}

const SCRIPT_USAGE: Usage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export class ScriptedLlm implements LlmClient {
  /** Every call in the order it was made: "model", an agent id, "judge", … */
  readonly calls: string[] = [];

  constructor(
    private readonly script: Script,
    private readonly options: {
      /** Pause before the answer starts and between its pieces. */
      delayMs?: number;
      /** Lets a test hold a call just before its first byte. */
      beforeStart?: (key: string) => Promise<void>;
    } = {},
  ) {}

  private entryFor(request: LlmCall<unknown>): [string, Scripted<unknown>] {
    const { stage } = request;
    // The newer kinds of run are told apart by what they ask for.
    const kinds = this.script.kinds ?? {};
    if (request.schema === ImpactAnswer) {
      return ["impact", { kind: "ok", value: kinds.impact ?? SAMPLE_IMPACT }];
    }
    if (request.schema === Architecture && stage === "impact") {
      return [
        "impact:after",
        {
          kind: "ok",
          value: this.script.architecture ?? {
            components: [],
            connections: [],
          },
        },
      ];
    }
    if (request.schema === Blueprint) {
      const name =
        Object.keys(SAMPLE_BLUEPRINTS).find((item) =>
          request.prompt.includes(`You are the designer "${item}"`),
        ) ?? "Pragmatist";
      return [
        `proposal:${name}`,
        { kind: "ok", value: SAMPLE_BLUEPRINTS[name] },
      ];
    }
    if (request.schema === Critique) {
      return ["critique", { kind: "ok", value: SAMPLE_CRITIQUE }];
    }
    if (request.schema === FlyoffVerdict) {
      return ["judge", { kind: "ok", value: SAMPLE_FLYOFF_VERDICT }];
    }
    // Preflight: each agent's lines, by the agent named in its brief.
    if (request.schema === LineReport) {
      const agent =
        AGENTS.find((item) =>
          request.system.includes(`You are the agent "${item.name}"`),
        )?.id ?? "product_critic";
      return [
        `preflight:${agent}`,
        {
          kind: "ok",
          value: { summary: "Checked each line against the code." },
        },
      ];
    }
    // A Dogfight's rounds: the issue and the round are named in the prompt.
    const fought = /<target id="([^"]+)"/.exec(request.prompt)?.[1] ?? "";
    const round = Number(/<round n="(\d+)"/.exec(request.prompt)?.[1] ?? "1");
    const scripted = kinds.duels?.[fought]?.[round - 1];
    if (request.schema === AttackAnswer) {
      return [
        `duel:${fought}:${round}:attack`,
        {
          kind: "ok",
          value: scripted?.attack ?? {
            verdict: "held",
            title: "No way past the fix",
            how: "The sample scripts no further attack.",
            path: null,
            startLine: null,
            endLine: null,
          },
        },
      ];
    }
    if (request.schema === RemediationAnswer && stage === "duel") {
      return [
        `duel:${fought}:${round}:defence`,
        scripted
          ? { kind: "ok", value: scripted.defence }
          : { kind: "error", message: "No fix was scripted for this round." },
      ];
    }
    // Engine Out: the scenario is the cut part and mode named in the prompt.
    const cut = /<cut part="([^"]+)" mode="(down|slow)"/.exec(request.prompt);
    const scenario = cut ? `${cut[1]}:${cut[2]}` : "";
    if (request.schema === HopReport) {
      const actor = request.system.includes('You are the agent "Outage tester"')
        ? "outage"
        : "journeys";
      return [
        `engineout:${scenario}:${actor}`,
        { kind: "ok", value: { summary: "Followed the failure outward." } },
      ];
    }
    if (request.schema === CascadeAnswer) {
      const answer = kinds.cascades?.[scenario];
      return [
        `engineout:${scenario}:cascade`,
        answer
          ? { kind: "ok", value: answer }
          : {
              kind: "error",
              message:
                "This part is not scripted in the sample. Try billing, auth or the payment gateway.",
            },
      ];
    }
    if (request.schema === Architecture && stage === "map") {
      return [
        "map",
        {
          kind: "ok",
          value: this.script.architecture ?? {
            components: [],
            connections: [],
          },
        },
      ];
    }
    if (request.schema === ChainAnswer) {
      return ["chains", { kind: "ok", value: kinds.chains ?? { chains: [] } }];
    }
    if (request.schema === TriageAnswer) {
      return [
        "triage",
        kinds.triage
          ? { kind: "ok", value: kinds.triage }
          : { kind: "error", message: "No triage was scripted." },
      ];
    }
    if (stage === "model" || stage === "judge" || stage === "work_orders") {
      return [stage, this.script[stage]];
    }
    if (stage === "remediation") {
      const id = /<finding id="([^"]+)">/.exec(request.prompt)?.[1] ?? "";
      return [
        `remediation:${id}`,
        this.script.remediations?.[id] ?? {
          kind: "error",
          message: "No remediation was scripted for this finding.",
        },
      ];
    }
    const agent = AGENTS.find((item) =>
      request.prompt.includes(`You are the agent "${item.name}"`),
    );
    if (!agent) throw new Error("ScriptedLlm: no agent named in the prompt.");
    if (stage === "challenge") {
      return [
        `challenge:${agent.id}`,
        this.script.challenges?.[agent.id] ?? {
          kind: "ok",
          value: { challenges: [] },
        },
      ];
    }
    return [agent.id, this.script.agents[agent.id]];
  }

  /** What each scripted tool call came back with, in order. */
  readonly toolResults: {
    key: string;
    tool: string;
    failed: boolean;
    text: string;
  }[] = [];

  async agent<T>(request: AgentCall<T>): Promise<LlmResult<T>> {
    const [key] = this.entryFor(request as LlmCall<unknown>);
    const byName = new Map(request.tools.map((tool) => [tool.name, tool]));
    const stepDelay = this.options.delayMs ?? 0;
    // Make the scripted tool calls first, as a model would, then answer.
    const answer = async () => {
      for (const step of this.script.tools?.[key] ?? []) {
        if (stepDelay) await pause(stepDelay);
        const result = await runTool(byName.get(step.tool), step.input);
        this.toolResults.push({ key, tool: step.tool, ...result });
      }
    };
    if (request.stage === "agents") {
      this.calls.push(key);
      await this.options.beforeStart?.(key);
      request.onStart?.();
      const entry = this.script.agents[key as AgentId];
      if (entry.kind === "error") throw new RunError(entry.message);
      if (entry.kind === "declined") {
        return {
          kind: "declined",
          category: entry.category,
          usage: SCRIPT_USAGE,
        };
      }
      await answer();
      return {
        kind: "ok",
        value: request.schema.parse({
          summary: "Checked what the brief calls for.",
        }),
        usage: SCRIPT_USAGE,
      };
    }
    await answer();
    return this.call(request);
  }

  async call<T>(request: LlmCall<T>): Promise<LlmResult<T>> {
    const [key, entry] = this.entryFor(request);
    this.calls.push(key);
    const delay = this.options.delayMs ?? 0;

    await this.options.beforeStart?.(key);
    if (delay) await pause(delay);
    request.onStart?.();

    if (entry.kind === "error") throw new RunError(entry.message);
    if (entry.kind === "declined") {
      return {
        kind: "declined",
        category: entry.category,
        usage: SCRIPT_USAGE,
      };
    }

    // Arrive in pieces, as a real answer does.
    const text = JSON.stringify(entry.value);
    for (const part of [0.35, 0.7, 1]) {
      if (delay) await pause(delay);
      request.onText?.(text.slice(0, Math.ceil(text.length * part)));
    }

    // A repository run asks the model stage a second question: the
    // architecture. It is answered from the script's architecture.
    const architecture =
      key === "model" && this.script.architecture
        ? request.schema.safeParse(this.script.architecture)
        : null;
    const value = architecture?.success
      ? this.script.architecture
      : entry.value;
    const parsed = request.schema.safeParse(value);
    if (!parsed.success) {
      throw new RunError(
        "The model's answer did not match the expected shape.",
      );
    }
    return { kind: "ok", value: parsed.data, usage: SCRIPT_USAGE };
  }
}

// ── The sample run ──────────────────────────────────────────────────────────
// Written by hand for the example requirement: "Build a multi-tenant dashboard
// where organization admins can invite users and manage permissions."

const SAMPLE_MODEL: DesignModel = {
  summary:
    "A dashboard used by many organizations. In each organization, admins invite users by email and set what each user may do.",
  roles: [
    {
      id: "role-org-admin",
      name: "Organization admin",
      description: "Invites users and manages permissions in one organization.",
      source: "stated",
    },
    {
      id: "role-member",
      name: "Member",
      description: "A user of an organization with no admin rights.",
      source: "assumed",
    },
    {
      id: "role-outsider",
      name: "Outsider",
      description: "Someone with no account in the organization.",
      source: "assumed",
    },
  ],
  entities: [
    {
      id: "ent-organization",
      name: "organizations",
      description: "A tenant. Everything else belongs to one.",
      fields: ["name"],
      limit: null,
      source: "stated",
    },
    {
      id: "ent-user",
      name: "users",
      description: "A person in an organization, with a set of permissions.",
      fields: ["email", "permissions"],
      limit: null,
      source: "stated",
    },
    {
      id: "ent-invitation",
      name: "invitations",
      description:
        "An offer to join an organization, sent to an email address.",
      fields: ["email", "status"],
      limit: null,
      source: "assumed",
    },
  ],
  operations: [
    {
      id: "op-invite-user",
      name: "invite a user",
      description: "Send an invitation to an email address.",
      entityIds: ["ent-invitation"],
      preconditions: [],
      effects: ["An invitation exists for that email address."],
      failureBehaviour: null,
      source: "stated",
    },
    {
      id: "op-accept-invitation",
      name: "accept an invitation",
      description: "Join the organization the invitation is for.",
      entityIds: ["ent-invitation", "ent-user"],
      preconditions: ["The invitation exists."],
      effects: ["A user exists in the organization."],
      failureBehaviour: null,
      source: "assumed",
    },
    {
      id: "op-change-permissions",
      name: "change a user's permissions",
      description: "Set what a user of the organization may do.",
      entityIds: ["ent-user"],
      preconditions: [],
      effects: ["The user's permissions are replaced."],
      failureBehaviour: null,
      source: "stated",
    },
    {
      id: "op-view-dashboard",
      name: "view the dashboard",
      description: "See the organization's dashboard.",
      entityIds: ["ent-organization"],
      preconditions: [],
      effects: [],
      failureBehaviour: null,
      source: "stated",
    },
  ],
  permissions: [
    {
      operationId: "op-invite-user",
      roleId: "role-org-admin",
      effect: "allow",
      condition: null,
      source: "stated",
    },
    {
      operationId: "op-change-permissions",
      roleId: "role-org-admin",
      effect: "allow",
      condition: null,
      source: "stated",
    },
  ],
  rules: [
    {
      id: "rule-tenant-isolation",
      kind: "security",
      statement: "Data of one organization is not visible to another.",
      source: "assumed",
    },
  ],
  journeys: [
    {
      id: "jrn-invite",
      name: "An admin brings a colleague in",
      roleId: "role-org-admin",
      operationIds: ["op-invite-user", "op-accept-invitation"],
      source: "stated",
    },
  ],
};

const report = (
  scenario: AgentReport["scenarios"][number],
  findings: AgentReport["findings"],
): AgentReport => ({ scenarios: [scenario], findings });

const SAMPLE_AGENTS: Record<AgentId, AgentReport> = {
  normal_user: report(
    {
      id: "s1",
      title: "An admin invites a colleague who never answers",
      roleId: "role-org-admin",
      intent: "Bring a colleague into the organization.",
      steps: [
        {
          action: "The admin invites a colleague by email.",
          operationId: "op-invite-user",
          outcome: "defined",
          detail: "An invitation is created for that address.",
          refs: ["op-invite-user"],
        },
        {
          action: "The colleague does nothing for a month.",
          operationId: null,
          outcome: "undefined",
          detail: "The design does not say whether an invitation expires.",
          refs: ["ent-invitation"],
        },
        {
          action: "The admin tries to withdraw the invitation.",
          operationId: null,
          outcome: "undefined",
          detail: "There is no operation to withdraw or resend an invitation.",
          refs: ["ent-invitation"],
        },
      ],
    },
    [
      {
        id: "f1",
        type: "unhandled_journey",
        title: "A pending invitation can never be withdrawn or resent",
        description:
          "An admin who invites the wrong address, or whose colleague lost the email, has no way forward.",
        severity: "medium",
        evidence: [
          { scenarioId: "s1", step: 2 },
          { scenarioId: "s1", step: 3 },
        ],
        refs: ["ent-invitation", "op-invite-user"],
        suggestion:
          "Decide how long an invitation lasts and add withdraw and resend.",
      },
    ],
  ),
  adversarial_user: report(
    {
      id: "s1",
      title: "A member raises their own permissions",
      roleId: "role-member",
      intent: "Gain admin rights without being given them.",
      steps: [
        {
          action: "A member changes their own permissions.",
          operationId: "op-change-permissions",
          outcome: "undefined",
          detail:
            "The design gives no rule for a member changing permissions, and none for a user changing their own.",
          refs: ["op-change-permissions", "role-member"],
        },
        {
          action: "An admin of one organization changes a user of another.",
          operationId: "op-change-permissions",
          outcome: "undefined",
          detail:
            "Nothing states that the operation is limited to the admin's own organization.",
          refs: ["op-change-permissions", "rule-tenant-isolation"],
        },
      ],
    },
    [
      {
        id: "f1",
        type: "security_vulnerability",
        title: "Nothing stops a member from changing their own permissions",
        description:
          "The design says admins may change permissions and is silent about everyone else.",
        severity: "critical",
        evidence: [{ scenarioId: "s1", step: 1 }],
        refs: ["op-change-permissions", "role-member"],
        suggestion: "State that only admins may change permissions.",
      },
      {
        id: "f2",
        type: "security_vulnerability",
        title:
          "Permission changes are not limited to the admin's own organization",
        description: "An admin could act on a user of another organization.",
        severity: "critical",
        evidence: [{ scenarioId: "s1", step: 2 }],
        refs: ["op-change-permissions", "rule-tenant-isolation"],
        suggestion: "Scope every admin operation to the admin's organization.",
      },
    ],
  ),
  chaos: report(
    {
      id: "s1",
      title: "The invitation email is never delivered",
      roleId: "role-org-admin",
      intent: "See what state an invitation is left in when sending fails.",
      steps: [
        {
          action: "The admin invites a user and the email provider times out.",
          operationId: "op-invite-user",
          outcome: "undefined",
          detail:
            "The design does not say whether the invitation exists if the email was not sent.",
          refs: ["op-invite-user", "gap-5"],
        },
      ],
    },
    [
      {
        id: "f1",
        type: "architecture_weakness",
        title: "An invitation can exist without its email having been sent",
        description:
          "Creating the invitation and sending the email are not tied together.",
        severity: "high",
        evidence: [{ scenarioId: "s1", step: 1 }],
        refs: ["op-invite-user"],
        suggestion:
          "Record the delivery state on the invitation and retry sending.",
      },
    ],
  ),
  scale: report(
    {
      id: "s1",
      title: "An organization invites ten thousand users at once",
      roleId: "role-org-admin",
      intent: "Find the limits on invitations.",
      steps: [
        {
          action: "The admin invites ten thousand addresses in one go.",
          operationId: "op-invite-user",
          outcome: "undefined",
          detail:
            "The design sets no limit on invitations and has no bulk path.",
          refs: ["ent-invitation"],
        },
      ],
    },
    [
      {
        id: "f1",
        type: "architecture_weakness",
        title: "No limit on pending invitations",
        description:
          "One organization can create an unbounded number of invitations and emails.",
        severity: "medium",
        evidence: [{ scenarioId: "s1", step: 1 }],
        refs: ["ent-invitation"],
        suggestion: "Set a cap per organization and a rate limit.",
      },
    ],
  ),
  product_critic: report(
    {
      id: "s1",
      title: 'What does "manage permissions" mean?',
      roleId: null,
      intent: "Read the requirement for what it leaves open.",
      steps: [
        {
          action: 'Read "manage permissions".',
          operationId: "op-change-permissions",
          outcome: "undefined",
          detail:
            "The requirement names no permissions, so nobody can say what an admin grants or who else may grant it.",
          refs: ["op-change-permissions"],
        },
      ],
    },
    [
      {
        id: "f1",
        type: "missing_requirement",
        title: "The set of permissions is never defined",
        description:
          '"Manage permissions" has no list of permissions and no statement of who may change them.',
        severity: "high",
        evidence: [{ scenarioId: "s1", step: 1 }],
        refs: ["op-change-permissions"],
        suggestion: "List the permissions and who may grant each.",
      },
      {
        id: "f2",
        type: "missing_requirement",
        title: "The product should have good documentation",
        description: "Documentation helps users.",
        severity: "low",
        evidence: [{ scenarioId: "s1", step: 1 }],
        refs: [],
        suggestion: "Write documentation.",
      },
    ],
  ),
};

const SAMPLE_VERDICT: Verdict = {
  groups: [
    {
      id: "g1",
      title: "Who may change permissions is not stated",
      type: "security_vulnerability",
      severity: "critical",
      summary:
        "The design allows admins to change permissions and says nothing about anyone else, or about which permissions exist. As it stands a member could raise their own rights.",
      findingIds: ["adversarial_user/f1", "product_critic/f1"],
    },
    {
      id: "g2",
      title: "Admin operations are not scoped to the admin's organization",
      type: "security_vulnerability",
      severity: "critical",
      summary:
        "Nothing limits a permission change to users of the admin's own organization.",
      findingIds: ["adversarial_user/f2"],
    },
    {
      id: "g3",
      title: "An invitation can exist without its email",
      type: "architecture_weakness",
      severity: "high",
      summary:
        "If sending fails, the design does not say what state the invitation is in.",
      findingIds: ["chaos/f1"],
    },
    {
      id: "g4",
      title: "Invitations have no lifetime, withdrawal or limit",
      type: "unhandled_journey",
      severity: "medium",
      summary:
        "A pending invitation cannot expire, be withdrawn or be resent, and there is no cap on how many exist.",
      findingIds: ["normal_user/f1", "scale/f1"],
    },
  ],
  rejected: [
    {
      findingId: "product_critic/f2",
      reason: "General advice that would fit any product.",
    },
  ],
};

const SAMPLE_WORK_ORDERS: WorkOrders = {
  workOrders: [
    {
      id: "wo-1",
      title: "Define the permissions and who may grant them",
      priority: "p0",
      description:
        "List every permission the dashboard has and state which role may grant or remove each one.",
      acceptanceCriteria: [
        "The requirement lists every permission by name.",
        "Given a member, when they try to change any user's permissions, then the request is refused.",
      ],
      groupIds: ["g1"],
    },
    {
      id: "wo-2",
      title: "Scope every admin operation to one organization",
      priority: "p0",
      description:
        "State that an admin acts only on users and invitations of their own organization.",
      acceptanceCriteria: [
        "Given an admin of organization A, when they try to change a user of organization B, then the request is refused.",
      ],
      groupIds: ["g2"],
    },
    {
      id: "wo-3",
      title: "Decide the life of an invitation",
      priority: "p1",
      description:
        "Decide how long an invitation lasts, how it is withdrawn and resent, what happens when the email fails, and how many may be pending.",
      acceptanceCriteria: [
        "The requirement states when an invitation expires.",
        "An admin can withdraw and resend a pending invitation.",
        "The requirement states the most invitations an organization may have pending.",
      ],
      groupIds: ["g3", "g4"],
    },
  ],
};

export const SAMPLE_SCRIPT: Script = {
  model: { kind: "ok", value: SAMPLE_MODEL },
  // A requirement run has no code: steps and the mapping, no edits.
  remediations: {
    g1: {
      kind: "ok",
      value: {
        summary:
          "The design never says who may change a user's permissions, so the first build will most likely let any signed-in user call the permission endpoints. Any member could then make themselves an admin.",
        steps: [
          "State in the requirement that only organization admins may change permissions, and only within their own organization.",
          "Enforce it on the server for every permission change, not only by hiding the button.",
          "Record every permission change with who made it and when.",
        ],
        cwe: "CWE-862",
        owasp: "A01:2021 Broken Access Control",
        edits: [],
        notes: [
          "Decide whether an admin may remove their own admin role, and what happens to the last admin.",
        ],
      },
    },
    g2: {
      kind: "ok",
      value: {
        summary:
          "Admin operations take a user id without checking the user's organization. An admin of one organization can change users of another by guessing their ids.",
        steps: [
          "Scope every admin query to the admin's organization on the server.",
          "Look users up by organization and id together, never by id alone.",
          "Add a test: an admin of organization A changing a user of organization B is refused.",
        ],
        cwe: "CWE-639",
        owasp: "A01:2021 Broken Access Control",
        edits: [],
        notes: [],
      },
    },
  },
  agents: Object.fromEntries(
    Object.entries(SAMPLE_AGENTS).map(([id, value]) => [
      id,
      { kind: "ok", value },
    ]),
  ) as Script["agents"],
  challenges: {
    chaos: {
      kind: "ok",
      value: {
        challenges: [
          {
            findingId: "product_critic/f2",
            stance: "dispute",
            reason:
              "Documentation is general advice. Nothing in this design makes it a flaw.",
          },
        ],
      },
    },
    scale: {
      kind: "ok",
      value: {
        challenges: [
          {
            findingId: "adversarial_user/f2",
            stance: "support",
            reason:
              "At many organizations this is also a load problem: one admin could act on every tenant's users.",
          },
        ],
      },
    },
  },
  judge: { kind: "ok", value: SAMPLE_VERDICT },
  work_orders: { kind: "ok", value: SAMPLE_WORK_ORDERS },
};
