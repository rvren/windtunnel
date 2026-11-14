"use client";

import { useEffect, useState } from "react";

/*
 * Holds content in a box of fixed size: centred when it is smaller, scaled
 * down (never below 70%) when it is taller, and scrolled inside the box if
 * it is taller still. Keeps every view of the cockpit's stage one height.
 *
 * Centring uses auto margins, not flex centring, so content taller than the
 * box can still be scrolled to its top; the scaled content takes the room
 * it is drawn in, so the scroll ends where the content does.
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
      className="flex flex-col overflow-auto"
      style={{ width, height }}
      data-testid="fit-box"
      data-scale={scale.toFixed(2)}
    >
      <div
        className="my-auto shrink-0"
        style={{ height: natural ? natural * scale : undefined }}
      >
        <div
          ref={setInner}
          style={{
            width: width / scale,
            transform: scale < 1 ? `scale(${scale})` : undefined,
            transformOrigin: "top left",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
