import { ProgressBar } from "@/components/tuff/progress-bar";
import type { Chapter } from "@/lib/viz/story";

/**
 * A run's stages as one line: how far it is, and the stage under way.
 * The whole of the stages while a run is going; the rail takes over, with
 * each stage's time, once it has ended.
 */
export function StageProgress({ chapters }: { chapters: Chapter[] }) {
  const total = chapters.length;
  const done = chapters.filter((chapter) => chapter.state === "done").length;
  const current = chapters.find((chapter) => chapter.state === "running");
  const at = Math.min(done + 1, total);
  return (
    <div className="px-5 pt-2 pb-6 md:px-6" data-testid="run-progress">
      <ProgressBar
        // Half a step for the stage under way, so the line moves as each
        // stage starts and again as it ends.
        value={done + (current ? 0.5 : 0)}
        max={total}
        label="Stages"
        valueText={`Stage ${at} of ${total}${current ? `: ${current.label}` : ""}`}
        className="h-1"
      />
      <p className="mt-2.5 text-xs text-muted-foreground">
        <span className="text-foreground">{current?.label ?? "Starting"}</span>{" "}
        · stage {at} of {total}
      </p>
    </div>
  );
}
