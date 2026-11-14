"use client";

import { useEffect, useState } from "react";

/*
 * Holds content in a box of fixed size: centred when it is smaller, scaled
 * down (never below 70%) when it is taller, and scrolled inside the box if
 * it is taller still. Keeps every view of the cockpit's stage one height.
 */

const MIN_SCALE = 0.7;

export function FitBox({
  width,
  height,
  children,
}: {
  width: number;
  height: number;
  children: React.ReactNode;
}) {
  const [inner, setInner] = useState<HTMLDivElement | null>(null);
  const [natural, setNatural] = useState(0);
  useEffect(() => {
    if (!inner) return;
    const observer = new ResizeObserver(([entry]) =>
      setNatural(Math.round(entry.contentRect.height)),
    );
    observer.observe(inner);
    return () => observer.disconnect();
  }, [inner]);
  const scale = natural > height ? Math.max(MIN_SCALE, height / natural) : 1;
  return (
    <div
      className="flex items-center justify-center overflow-auto"
      style={{ width, height }}
      data-testid="fit-box"
    >
      <div
        ref={setInner}
        className="w-full origin-center"
        style={{ transform: scale < 1 ? `scale(${scale})` : undefined }}
      >
        {children}
      </div>
    </div>
  );
}
