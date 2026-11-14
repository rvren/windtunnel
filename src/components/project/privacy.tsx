import { KeyRound } from "lucide-react";

import { Panel } from "@/components/panel";
import type { DataSink, PiiCategory } from "@/server/engine/schema";
import type { CockpitPrivacy } from "@/server/projects/cockpit";

/*
 * The cockpit's Data and privacy section: which kinds of personal data the
 * code handles, where they reach logs, outside calls, storage and responses,
 * and the secrets written into the code. Found by name, so it says so.
 */

const CATEGORY: Record<PiiCategory, string> = {
  contact: "Contact details",
  identity: "Identity",
  financial: "Financial",
  location: "Location",
  health: "Health",
  credentials: "Credentials",
  online: "Online identifiers",
};

const SINK: Record<DataSink, string> = {
  log: "Logs",
  outside: "Outside calls",
  storage: "Storage",
  response: "Responses",
};

export function PrivacyView({ privacy }: { privacy: CockpitPrivacy }) {
  if (privacy.categories.length === 0 && privacy.secrets.length === 0) {
    return null;
  }
  return (
    <section data-testid="cockpit-privacy">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-lg font-medium">Data and privacy</h2>
        <p className="text-xs text-muted-foreground">
          Found by name in {privacy.filesScanned} files
          {privacy.truncated ? " (stopped at the limit)" : ""}. It may include
          false positives.
        </p>
      </div>

      {privacy.secrets.length > 0 ? (
        <Panel className="mb-3 px-4 py-3" data-testid="privacy-secrets">
          <p className="flex items-center gap-2 text-sm font-medium">
            <KeyRound className="size-4 text-sev-critical" aria-hidden="true" />
            {privacy.secrets.length}{" "}
            {privacy.secrets.length === 1 ? "secret" : "secrets"} written into
            the code
          </p>
          <ul className="mt-2 space-y-1 font-mono text-xs text-muted-foreground">
            {privacy.secrets.map((secret) => (
              <li key={`${secret.path}:${secret.line}`}>
                {secret.kind} · {secret.path}:{secret.line}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Each is a critical security issue with its remediation above. The
            values are never stored or shown.
          </p>
        </Panel>
      ) : null}

      {privacy.categories.length > 0 ? (
        <Panel className="overflow-x-auto">
          <table
            className="w-full text-left text-sm"
            data-testid="privacy-table"
          >
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-normal">Personal data</th>
                <th className="px-4 py-2.5 text-right font-normal">Places</th>
                {(Object.keys(SINK) as DataSink[]).map((sink) => (
                  <th key={sink} className="px-4 py-2.5 text-right font-normal">
                    {SINK[sink]}
                  </th>
                ))}
                <th className="px-4 py-2.5 font-normal">Where it leaves</th>
              </tr>
            </thead>
            <tbody>
              {privacy.categories.map((item) => (
                <tr
                  key={item.category}
                  className="border-b last:border-b-0 align-top"
                >
                  <td className="px-4 py-3">
                    <span className="font-medium">
                      {CATEGORY[item.category]}
                    </span>
                    {item.workspaces.length > 0 ? (
                      <span className="mt-0.5 block font-mono text-xs text-muted-foreground">
                        {item.workspaces.join(", ")}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {item.places}
                  </td>
                  {(Object.keys(SINK) as DataSink[]).map((sink) => (
                    <td
                      key={sink}
                      className={
                        item.sinks[sink] > 0 &&
                        (sink === "log" || sink === "outside")
                          ? "px-4 py-3 text-right font-mono text-sev-high"
                          : "px-4 py-3 text-right font-mono text-muted-foreground"
                      }
                    >
                      {item.sinks[sink] || "—"}
                    </td>
                  ))}
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {item.examples.length > 0
                      ? item.examples
                          .slice(0, 3)
                          .map((place) => `${place.path}:${place.line}`)
                          .join(", ")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      ) : null}
    </section>
  );
}
