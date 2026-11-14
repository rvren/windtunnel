import { cn } from "@/lib/utils";

/* A raised surface: hairline border and a faint fill. Used in both areas. */
export function Panel({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("rounded-md border bg-card", className)} {...props} />
  );
}
