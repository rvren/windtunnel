"use client";

import { pillClass } from "@/components/pill";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { OutageMode } from "@/server/engine/schema";

/*
 * Engine Out's one input: the part to cut, and whether it goes down or
 * slow. The parts are the project's map from its latest code run; a
 * project never run gets a name box instead. On a sample project only the
 * parts with a scripted outage can be picked, so the demo stays free.
 */

export interface PickPart {
  id: string;
  name: string;
  kind: string;
}

const CODE = new Set(["frontend", "service", "library", "other"]);

export function PartPicker({
  parts,
  scripted,
  value,
  onChange,
  example,
}: {
  parts: PickPart[] | null;
  /** "part:mode" pairs a sample project can play; null when any part can. */
  scripted: string[] | null;
  value: { part: string; mode: OutageMode; label: string };
  onChange: (next: { part: string; mode: OutageMode; label: string }) => void;
  example: React.ReactNode;
}) {
  const playable = (id: string, mode: OutageMode) =>
    !scripted || scripted.includes(`${id}:${mode}`);
  const groups = parts
    ? [
        {
          title: "Services",
          items: parts.filter((part) => CODE.has(part.kind)),
        },
        {
          title: "Data and outside systems",
          items: parts.filter((part) => !CODE.has(part.kind)),
        },
      ].filter((group) => group.items.length > 0)
    : [];
  const setMode = (mode: OutageMode) =>
    onChange(
      playable(value.part, mode)
        ? { ...value, mode }
        : { part: "", label: "", mode },
    );

  return (
    <div className="space-y-5" data-testid="start-parts">
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">How it fails</p>
        <Tabs
          value={value.mode}
          onValueChange={(next) => setMode(next as OutageMode)}
        >
          <TabsList variant="pill">
            <TabsTrigger value="down" data-testid="start-mode-down">
              Down
            </TabsTrigger>
            <TabsTrigger value="slow" data-testid="start-mode-slow">
              Slow
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <p className="text-xs text-muted-foreground">
          {value.mode === "down"
            ? "Every call to it is refused at once."
            : "Every call to it is answered, but late, long after any normal wait."}
        </p>
      </div>

      {parts ? (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.title} className="space-y-2">
              <p className="text-xs text-muted-foreground">{group.title}</p>
              <div className="flex flex-wrap gap-1.5">
                {group.items.map((part) => {
                  const ok = playable(part.id, value.mode);
                  const on = value.part === part.id;
                  return (
                    <button
                      key={part.id}
                      type="button"
                      className={cn(
                        pillClass(on),
                        "disabled:cursor-not-allowed disabled:opacity-35",
                      )}
                      aria-pressed={on}
                      disabled={!ok}
                      title={
                        ok ? undefined : "Not scripted in the sample project"
                      }
                      onClick={() =>
                        onChange({ ...value, part: part.id, label: part.name })
                      }
                      data-testid={`start-part-${part.id}`}
                    >
                      {part.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {scripted ? (
            <p className="text-xs text-muted-foreground">
              A sample project: only the parts with a scripted outage can be
              cut, so the run stays free.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="max-w-sm space-y-2">
          <Input
            value={value.label}
            onChange={(event) =>
              onChange({
                ...value,
                part: event.target.value,
                label: event.target.value,
              })
            }
            placeholder="Billing service"
            aria-label="The part to cut"
            data-testid="start-part-name"
          />
          <p className="text-xs text-muted-foreground">
            This project&apos;s code has not been run yet, so there is no map to
            pick from. Name the part as the code does; the run draws the map
            first.
          </p>
        </div>
      )}
      {example}
    </div>
  );
}
