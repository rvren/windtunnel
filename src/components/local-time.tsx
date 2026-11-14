"use client";

import { useEffect, useState } from "react";

const format = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

/**
 * A moment in the reader's own time zone.
 *
 * The server does not know the reader's time zone, so it sends the time in
 * UTC, and the browser swaps in the local time just after the first paint.
 * Formatting it during that first paint would make the browser's markup
 * differ from the server's.
 */
export function LocalTime({
  iso,
  className,
}: {
  iso: string;
  className?: string;
}) {
  const [local, setLocal] = useState<string | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setLocal(format(iso)));
    return () => cancelAnimationFrame(frame);
  }, [iso]);

  return (
    <time dateTime={iso} className={className}>
      {local ?? `${iso.slice(0, 16).replace("T", " ")} UTC`}
    </time>
  );
}
