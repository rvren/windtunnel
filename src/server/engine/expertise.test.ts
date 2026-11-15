import { describe, expect, it } from "vitest";

import { agentById } from "@/lib/agents";

import { loadExpertise } from "./expertise";
import { agentPrompt, repoAgentPrompt } from "./prompts";

describe("the Attacker's personal-data checks", () => {
  it("are in its brief and its notes, for requirement and code runs", async () => {
    const notes = (await loadExpertise()).adversarial_user;
    const attacker = agentById("adversarial_user")!;
    expect(attacker.brief).toMatch(/personal data \(PII\)/);
    for (const prompt of [
      agentPrompt(attacker, notes),
      repoAgentPrompt(attacker, notes),
    ]) {
      expect(prompt).toContain("## Personal data (PII)");
      // The leads code finds, and the CWEs a finding maps to.
      expect(prompt).toContain("data inventory");
      for (const cwe of ["CWE-359", "CWE-532", "CWE-312"]) {
        expect(prompt).toContain(cwe);
      }
    }
  });
});
