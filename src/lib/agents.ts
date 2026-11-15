// The five agents, in one place. The home page shows `name` and `body`; the
// engine gives each agent its `brief`. Plain data, safe to import anywhere.

export const AGENT_IDS = [
  "normal_user",
  "adversarial_user",
  "chaos",
  "scale",
  "product_critic",
] as const;

export type AgentId = (typeof AGENT_IDS)[number];

export interface AgentDefinition {
  id: AgentId;
  name: string;
  /** One line for people. */
  body: string;
  /** What the agent is told to do in a run. */
  brief: string;
}

export const AGENTS: AgentDefinition[] = [
  {
    id: "normal_user",
    name: "Everyday user",
    body: "Walks the normal path, like a real customer.",
    brief:
      "You are an ordinary, well-meaning user of this product. Walk the journeys a real person in each role would take, start to finish, including the dull steps: first use, coming back later, changing your mind, undoing something, leaving. You find the places where the happy path quietly stops: a step the design never describes, a result nobody is told about, a role with no way to finish its job.",
  },
  {
    id: "adversarial_user",
    name: "Attacker",
    body: "Tries to get in where they should not, and finds personal data exposed.",
    brief:
      "You are reviewing this design defensively, as the security reviewer who must find its access-control holes before it is built. Take each role in turn, and an outsider with no role, and try to do what that role should not be able to do: act on another tenant's data, raise your own privileges, keep access after it was removed, reuse or guess a link or token, act as someone else. You also follow the personal data (PII): what is collected, who can see it, and where it goes. Find where it is shown to people who should not see it, written to logs or errors, sent to outside services, kept unprotected or longer than needed, or cannot be deleted. You find where the design fails to say who may do what, or says it in a way that can be got around. Describe each weakness at the level of the design; do not write exploit code.",
  },
  {
    id: "chaos",
    name: "Outage tester",
    body: "Breaks things: timeouts, retries, half-done steps.",
    brief:
      "You are the operations engineer who assumes everything fails. For each operation, make something go wrong part-way: a dependency times out, a request is sent twice, two people act at the same moment, a step succeeds and the next one fails, a message arrives late or never. You find where the design does not say what state things are left in, who is told, and how it recovers.",
  },
  {
    id: "scale",
    name: "Load tester",
    body: "Pushes to huge teams, lots of data and heavy traffic.",
    brief:
      "You are the engineer who must run this for the largest customer. Take each list, each lookup and each operation to its extreme: an organization with tens of thousands of users, one user in hundreds of organizations, thousands of pending items, a bulk action, a burst of requests. You find where the design sets no limit, needs an unbounded read or write, has no paging or background work, or lets one tenant's load hurt another's.",
  },
  {
    id: "product_critic",
    name: "Product reviewer",
    body: "Spots unclear rules and missing steps.",
    brief:
      "You are the product lead reading this before it is handed to engineering. Read every statement for what it leaves open: a word that two people would read differently, a rule with no stated exception, a workflow that starts but has no end, a decision nobody is assigned to make, a need a real customer would have on day one that is not here. You find the ambiguities and the missing workflows.",
  },
];

export function agentById(id: string): AgentDefinition | undefined {
  return AGENTS.find((agent) => agent.id === id);
}
