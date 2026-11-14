"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

/* Where a repository comes from: GitHub or a local folder. Used by the
   new-run form and by a project's workspace form. */

export interface RepoSource {
  origin: "github" | "local";
  url: string;
  branch: string;
  folder: string;
}

export const emptyRepoSource = (folders: string[]): RepoSource => ({
  origin: "github",
  url: "",
  branch: "",
  folder: folders[0] ?? "",
});

/** What the API takes, or the reason the fields are not complete. */
export function toOrigin(
  source: RepoSource,
): { ok: true; origin: Record<string, string> } | { ok: false; error: string } {
  if (source.origin === "github") {
    return source.url.trim()
      ? {
          ok: true,
          origin: {
            kind: "github",
            url: source.url.trim(),
            branch: source.branch.trim(),
          },
        }
      : { ok: false, error: "Enter the repository's GitHub address." };
  }
  return source.folder
    ? { ok: true, origin: { kind: "local", name: source.folder } }
    : { ok: false, error: "Choose a folder." };
}

export function RepoSourceFields({
  value,
  onChange,
  folders,
  githubToken,
  idPrefix,
}: {
  value: RepoSource;
  onChange: (next: RepoSource) => void;
  /** The local folders that may be read. */
  folders: string[];
  /** Whether the server has a GitHub token, for private repositories. */
  githubToken: boolean;
  /** Starts every id and test id, for example "run-form". */
  idPrefix: string;
}) {
  const set = (patch: Partial<RepoSource>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-4">
      <Tabs
        value={value.origin}
        onValueChange={(origin) =>
          set({ origin: origin as RepoSource["origin"] })
        }
      >
        <TabsList>
          <TabsTrigger value="github" data-testid={`${idPrefix}-origin-github`}>
            From GitHub
          </TabsTrigger>
          <TabsTrigger value="local" data-testid={`${idPrefix}-origin-local`}>
            Local folder
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {value.origin === "github" ? (
        <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
          <div className="space-y-2">
            <label
              htmlFor={`${idPrefix}-repo-url`}
              className="text-sm font-medium"
            >
              Repository address
            </label>
            <Input
              id={`${idPrefix}-repo-url`}
              data-testid={`${idPrefix}-repo-url`}
              value={value.url}
              onChange={(event) => set({ url: event.target.value })}
              placeholder="https://github.com/owner/name"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor={`${idPrefix}-repo-branch`}
              className="text-sm font-medium"
            >
              Branch
            </label>
            <Input
              id={`${idPrefix}-repo-branch`}
              data-testid={`${idPrefix}-repo-branch`}
              value={value.branch}
              onChange={(event) => set({ branch: event.target.value })}
              placeholder="Default branch"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            {githubToken
              ? "Private repositories work: the server has a GitHub token."
              : "Public repositories only. For private ones, add GITHUB_TOKEN to .env.local and restart the server."}
          </p>
        </div>
      ) : folders.length > 0 ? (
        <div className="max-w-sm space-y-2">
          <label
            htmlFor={`${idPrefix}-repo-folder`}
            className="text-sm font-medium"
          >
            Folder
          </label>
          <Select
            value={value.folder}
            onValueChange={(folder) => set({ folder: String(folder ?? "") })}
          >
            <SelectTrigger
              id={`${idPrefix}-repo-folder`}
              className="w-full"
              data-testid={`${idPrefix}-repo-folder`}
            >
              <SelectValue placeholder="Choose a folder" />
            </SelectTrigger>
            <SelectContent>
              {folders.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <p className="rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">
          No folders yet. Put a repository in the server&apos;s repositories
          folder (`repos/` in the Windtunnel project) and reload this page.
        </p>
      )}
    </div>
  );
}
