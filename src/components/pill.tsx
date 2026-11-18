import { cn } from "@/lib/utils";

/*
 * A pill: one of a row of small buttons or links where the current one is
 * a soft filled chip, as in the header of a detail page. For rows that are
 * not tabs (links, or a section and its parts).
 */
export function pillClass(on: boolean, small = false): string {
  return cn(
    "inline-flex items-center gap-1.5 rounded-control border whitespace-nowrap transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4 [&_svg]:shrink-0",
    small ? "h-7 px-2.5 text-[0.8125rem]" : "h-8 px-3 text-sm",
    on
      ? "border-border bg-secondary text-foreground"
      : "border-transparent text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
  );
}
