"use client";

import {
  MotionConfig,
  motion,
  useReducedMotion,
  type HTMLMotionProps,
} from "motion/react";

/*
 * Every animation in the product goes through this file, built on Motion
 * (https://motion.dev). The feel is calm: things ease in over a short
 * distance and settle, nothing bounces or overshoots, and nothing moves for
 * people who ask their system for reduced motion.
 */

/** A long, soft ease-out: quick to start, slow to settle. */
export const EASE = [0.22, 1, 0.36, 1] as const;
export const DURATION = 0.5;
/** How far, in pixels, something travels as it appears. */
const RISE = 10;

const hidden = { opacity: 0, y: RISE };
const shown = { opacity: 1, y: 0 };

/** Sets the shared timing, and honours the reduced-motion setting. */
export function MotionRoot({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ duration: DURATION, ease: EASE }}
    >
      {children}
    </MotionConfig>
  );
}

type SectionProps = HTMLMotionProps<"section"> & { delay?: number };

/** Fades and rises in when it mounts. For page content and tab panels. */
export function FadeIn({ delay = 0, ...props }: SectionProps) {
  return (
    <motion.section
      initial={hidden}
      animate={shown}
      transition={{ duration: DURATION, ease: EASE, delay }}
      {...props}
    />
  );
}

/** Fades and rises in the first time it scrolls into view. */
export function Reveal({ delay = 0, ...props }: SectionProps) {
  return (
    <motion.section
      initial={hidden}
      whileInView={shown}
      viewport={{ once: true, margin: "0px 0px -80px 0px" }}
      transition={{ duration: 0.7, ease: EASE, delay }}
      {...props}
    />
  );
}

/** A list row that eases in as it is added, and makes room smoothly. */
export function FadeInItem(props: HTMLMotionProps<"li">) {
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={shown}
      transition={{ duration: 0.4, ease: EASE }}
      {...props}
    />
  );
}

/** A block whose size changes ease instead of jumping. */
export function Smooth(props: HTMLMotionProps<"div">) {
  return (
    <motion.div layout transition={{ duration: 0.4, ease: EASE }} {...props} />
  );
}

/**
 * A bright dash that travels along a line, for the hero art. The path must
 * be given pathLength="1000" semantics: one loop is one trip. It is not
 * drawn at all under reduced motion.
 */
export function FlowDash({
  d,
  stroke,
  duration,
  delay = 0,
}: {
  d: string;
  stroke: string;
  duration: number;
  delay?: number;
}) {
  if (useReducedMotion()) return null;
  return (
    <motion.path
      d={d}
      pathLength={1000}
      stroke={stroke}
      strokeWidth={5}
      strokeDasharray="46 954"
      initial={{ strokeDashoffset: 0, opacity: 0 }}
      animate={{ strokeDashoffset: -1000, opacity: 1 }}
      transition={{
        strokeDashoffset: {
          duration,
          ease: "linear",
          repeat: Infinity,
          delay,
        },
        opacity: { duration: 1.2, delay },
      }}
    />
  );
}
