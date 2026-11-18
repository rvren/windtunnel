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

/**
 * Page content and tab panels. They are shown at once, never started
 * hidden: an animation that does not run (a background tab, a paused
 * frame) must not leave a page blank. `delay` is kept for callers.
 */
export function FadeIn(props: SectionProps) {
  const { delay, ...rest } = props;
  void delay;
  return <motion.section initial={false} {...rest} />;
}

/** Fades and rises in the first time it scrolls into view. */
export function Reveal({ delay = 0, ...props }: SectionProps) {
  const reduced = useReducedMotion();
  return (
    <motion.section
      initial={reduced ? false : hidden}
      whileInView={shown}
      viewport={{ once: true, margin: "0px 0px -80px 0px" }}
      transition={{ duration: 0.7, ease: EASE, delay }}
      {...props}
    />
  );
}

/** A list row that eases in as it is added, and makes room smoothly. */
export function FadeInItem(props: HTMLMotionProps<"li">) {
  const reduced = useReducedMotion();
  return (
    <motion.li
      layout="position"
      initial={reduced ? false : { opacity: 0, y: 6 }}
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
  width = 5,
  dash = 46,
  className,
}: {
  d: string;
  stroke: string;
  duration: number;
  delay?: number;
  width?: number;
  /** The length of the bright dash, out of 1000 for the whole line. */
  dash?: number;
  className?: string;
}) {
  if (useReducedMotion()) return null;
  return (
    <motion.path
      d={d}
      fill="none"
      strokeLinecap="round"
      className={className}
      pathLength={1000}
      stroke={stroke}
      strokeWidth={width}
      strokeDasharray={`${dash} ${1000 - dash}`}
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

/*
 * Live work. These move only while something is being worked on, which the
 * design rules allow, and are not drawn at all under reduced motion: the
 * still picture says the same.
 */

/**
 * A light that travels once from one point to another and fades: a
 * finding leaving the agent that filed it. Give it a new key for each.
 */
export function Spark({
  from,
  to,
  fill,
  r = 4,
  duration = 1.2,
}: {
  from: [number, number];
  to: [number, number];
  fill: string;
  r?: number;
  duration?: number;
}) {
  if (useReducedMotion()) return null;
  return (
    <motion.circle
      r={r}
      fill={fill}
      className="glow"
      initial={{ cx: from[0], cy: from[1], opacity: 1 }}
      animate={{ cx: to[0], cy: to[1], opacity: [1, 1, 0] }}
      transition={{ duration, ease: EASE }}
    />
  );
}

/**
 * A line that draws itself once, start to end: a run's outcome reaching
 * the end of each line. Drawn whole at once under reduced motion. Laid over
 * a plain line, so nothing is missing if the animation does not run.
 */
export function DrawLine({
  d,
  className,
  delay = 0,
  width = 1.75,
  stroke,
  opacity,
  transform,
  filter,
}: {
  d: string;
  className?: string;
  delay?: number;
  width?: number;
  stroke?: string;
  opacity?: number;
  /** An SVG transform, such as a small offset for a shadow or a sheen. */
  transform?: string;
  filter?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.path
      d={d}
      fill="none"
      strokeWidth={width}
      strokeLinecap="round"
      className={className}
      stroke={stroke}
      opacity={opacity}
      transform={transform}
      filter={filter}
      initial={reduced ? false : { pathLength: 0 }}
      animate={{ pathLength: 1 }}
      transition={{ duration: 1.2, ease: EASE, delay }}
    />
  );
}

/**
 * Something that grows into place once, from part size: the head of an
 * arrow arriving. Starts visible (at part size), so a paused frame still
 * shows it; under reduced motion it is simply there.
 */
export function GrowIn({
  delay = 0,
  children,
}: {
  delay?: number;
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.g
      style={{ transformBox: "fill-box", transformOrigin: "center" }}
      initial={reduced ? false : { scale: 0.55 }}
      animate={{ scale: 1 }}
      transition={{ duration: 0.5, ease: EASE, delay }}
    >
      {children}
    </motion.g>
  );
}
