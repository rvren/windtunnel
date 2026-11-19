import {
  GitCompareArrows,
  Siren,
  Trophy,
  Unplug,
  Wind,
  type LucideIcon,
} from "lucide-react";

import type { RunKind } from "@/server/engine/schema";

/** The icon of each kind of run, wherever a kind is named. */
export const FEATURE_ICON: Record<RunKind, LucideIcon> = {
  audit: Wind,
  crosswind: GitCompareArrows,
  flyoff: Trophy,
  blackbox: Siren,
  engineout: Unplug,
};
