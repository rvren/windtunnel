"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "motion/react";

import { EASE } from "@/components/motion";

const DURATION = 0.9;

/**
 * A whole number that counts to its value instead of jumping to it. The
 * real value is what is rendered first and what it always ends on: if the
 * browser is not drawing frames (a tab in the background), a timer sets it,
 * so a wrong number is never left on screen.
 */
export function CountUp({
  value,
  className,
  ...props
}: { value: number } & React.ComponentProps<"span">) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  // Where the next count starts: zero the first time, then the last value.
  const from = useRef(0);

  useEffect(() => {
    if (reduced || document.hidden || from.current === value) {
      from.current = value;
      // Not counting: show the value itself, on the next tick.
      const now = setTimeout(() => setShown(value), 0);
      return () => clearTimeout(now);
    }
    const controls = animate(from.current, value, {
      duration: DURATION,
      ease: EASE,
      onUpdate: (latest) => {
        from.current = latest;
        setShown(Math.round(latest));
      },
    });
    const settle = setTimeout(
      () => {
        from.current = value;
        setShown(value);
      },
      DURATION * 1000 + 200,
    );
    return () => {
      controls.stop();
      clearTimeout(settle);
    };
  }, [value, reduced]);

  return (
    <span className={className} {...props}>
      {reduced ? value : shown}
    </span>
  );
}
