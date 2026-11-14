import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function AppNotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-medium tracking-[-0.02em]">
        Nothing at this address
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The run may have been removed, or the link is wrong.
      </p>
      <Link
        href="/app"
        data-testid="not-found-runs"
        className={buttonVariants({ variant: "outline", className: "mt-6" })}
      >
        Back To Runs
      </Link>
    </div>
  );
}
