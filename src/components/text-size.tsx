"use client";

import { useEffect, useState } from "react";
import { Check, Type } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/*
 * The app's text size: small (the default), medium, large or extra large.
 * It sets the root font size (html[data-text-size], rules in globals.css),
 * which every rem-based size follows. Kept in this browser. Only the app
 * uses it: TEXT_SIZE_SCRIPT applies it before the first paint of an /app
 * page, and AppTextSize while the app is open, removing it on the way out
 * so the site keeps its own size.
 */

export const TEXT_SIZES = ["small", "medium", "large", "xl"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];
export const DEFAULT_TEXT_SIZE: TextSize = "small";

const KEY = "windtunnel:text-size";

const LABEL: Record<TextSize, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
  xl: "Extra Large",
};

/** Runs in <head>, before anything is drawn. */
export const TEXT_SIZE_SCRIPT = `try{if(location.pathname.indexOf("/app")===0){var s=localStorage.getItem("${KEY}");document.documentElement.dataset.textSize=(s==="medium"||s==="large"||s==="xl")?s:"${"small"}"}}catch(e){}`;

function stored(): TextSize {
  try {
    const value = localStorage.getItem(KEY) as TextSize | null;
    return value && TEXT_SIZES.includes(value) ? value : DEFAULT_TEXT_SIZE;
  } catch {
    return DEFAULT_TEXT_SIZE;
  }
}

export function applyTextSize(size: TextSize) {
  document.documentElement.dataset.textSize = size;
  try {
    if (size === DEFAULT_TEXT_SIZE) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, size);
  } catch {
    // Storage blocked: the size holds until the page is reloaded.
  }
}

/** Holds the app's text size while the app is open. */
export function AppTextSize() {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.textSize = stored();
    return () => {
      delete root.dataset.textSize;
    };
  }, []);
  return null;
}

export function TextSizeControl() {
  const [size, setSize] = useState<TextSize>(DEFAULT_TEXT_SIZE);
  // The size in force, read when the menu opens (the head script may have
  // set it before React started).
  const read = () => {
    const now = document.documentElement.dataset.textSize as
      TextSize | undefined;
    setSize(now && TEXT_SIZES.includes(now) ? now : DEFAULT_TEXT_SIZE);
  };
  const pick = (next: TextSize) => {
    setSize(next);
    applyTextSize(next);
  };
  return (
    <Popover onOpenChange={(open) => open && read()}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Text size"
            title="Text size"
            data-testid="text-size"
          />
        }
      >
        <Type />
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-48 gap-0 p-1">
        <p className="px-2 py-1.5 text-xs text-muted-foreground">Text size</p>
        {TEXT_SIZES.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => pick(item)}
            aria-pressed={size === item}
            data-testid={`text-size-${item}`}
            className={cn(
              "flex items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
              size === item && "text-foreground",
            )}
          >
            <span
              className={cn(
                item === "small" && "text-xs",
                item === "large" && "text-base",
                item === "xl" && "text-lg",
              )}
            >
              {LABEL[item]}
            </span>
            {size === item ? (
              <Check className="size-3.5" aria-hidden="true" />
            ) : null}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
