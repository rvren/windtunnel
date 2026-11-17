"use client";

import { useState } from "react";
import { Check, Type } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/*
 * The text size: small, default, large or extra large. It sets the root font
 * size (html[data-text-size], rules in globals.css), which every rem-based
 * size follows. Kept in this browser; TEXT_SIZE_SCRIPT applies it before the
 * first paint so a page never jumps.
 */

export const TEXT_SIZES = ["small", "default", "large", "xl"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

const KEY = "windtunnel:text-size";

const LABEL: Record<TextSize, string> = {
  small: "Small",
  default: "Default",
  large: "Large",
  xl: "Extra Large",
};

/** Runs in <head>, before anything is drawn. */
export const TEXT_SIZE_SCRIPT = `try{var s=localStorage.getItem("${KEY}");if(s==="small"||s==="large"||s==="xl")document.documentElement.dataset.textSize=s}catch(e){}`;

export function applyTextSize(size: TextSize) {
  const root = document.documentElement;
  if (size === "default") delete root.dataset.textSize;
  else root.dataset.textSize = size;
  try {
    if (size === "default") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, size);
  } catch {
    // Storage blocked: the size holds until the page is reloaded.
  }
}

export function TextSizeControl() {
  const [size, setSize] = useState<TextSize>("default");
  // The size in force, read when the menu opens (the head script may have
  // set it before React started).
  const read = () => {
    const now = document.documentElement.dataset.textSize as
      TextSize | undefined;
    setSize(now && TEXT_SIZES.includes(now) ? now : "default");
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
