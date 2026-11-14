"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "motion/react";

import { EASE } from "@/components/motion";

/** A whole number that counts to its value instead of jumping to it. */
export function CountUp({
  value,
  className,
  ...props
}: { value: number } & React.ComponentProps<"span">) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    if (reduced) return;
    const controls = animate(from.current, value, {
      duration: 0.9,
      ease: EASE,
      onUpdate: (latest) => {
        from.current = latest;
        setShown(Math.round(latest));
      },
    });
    return () => controls.stop();
  }, [value, reduced]);

  return (
    <span className={className} {...props}>
      {reduced ? value : shown}
    </span>
  );
}
