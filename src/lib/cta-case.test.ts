import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/*
 * Every call to action starts each word with a capital ("Open The Cockpit").
 * This reads the plain text inside every <Button>, <DialogClose> and
 * button-styled <Link> in the app and checks it. Text built from data at
 * run time is not seen here; its words are written in title case where
 * they are made (see home.ts and termsFor).
 */

const ROOT = path.resolve(import.meta.dirname, "..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      return name === "ui" ? [] : files(full);
    }
    return full.endsWith(".tsx") ? [full] : [];
  });
}

const TAGS = ["Button", "DialogClose", "Link", "a"];

/** Removes `{…}` expressions, nested ones included. */
function withoutExpressions(text: string): string {
  let depth = 0;
  let out = "";
  for (const char of text) {
    if (char === "{") depth += 1;
    else if (char === "}") depth = Math.max(0, depth - 1);
    else if (depth === 0) out += char;
  }
  return out;
}

/**
 * Each call to action in a file: its attributes and the body up to its
 * closing tag. Attributes are read with braces counted, so an arrow
 * function's ">" does not end them.
 */
function blocks(source: string): { attrs: string; body: string }[] {
  const found: { attrs: string; body: string }[] = [];
  for (const tag of TAGS) {
    const open = new RegExp(`<${tag}\\b`, "g");
    for (const match of source.matchAll(open)) {
      let at = match.index! + tag.length + 1;
      let depth = 0;
      for (; at < source.length; at += 1) {
        const char = source[at];
        if (char === "{") depth += 1;
        else if (char === "}") depth -= 1;
        else if (char === ">" && depth === 0) break;
      }
      const attrs = source.slice(match.index!, at);
      if (attrs.endsWith("/")) continue;
      const close = source.indexOf(`</${tag}>`, at);
      if (close === -1) continue;
      found.push({ attrs, body: source.slice(at + 1, close) });
    }
  }
  return found;
}

/** The plain text lines of a block: no tags, no expressions. */
function plainText(body: string): string[] {
  return withoutExpressions(body)
    .replace(/<[^>]+>/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /[A-Za-z]{2,}/.test(line));
}

const lowerWord = (text: string) =>
  text.match(/(?:^|\s)([a-z][a-z']*)/)?.[1] ?? null;

describe("calls to action", () => {
  it("start every word with a capital", () => {
    const wrong: string[] = [];
    for (const file of files(ROOT)) {
      const source = readFileSync(file, "utf8");
      for (const { attrs, body } of blocks(source)) {
        // Links count only when they look like a button.
        if (
          (attrs.startsWith("<Link") || attrs.startsWith("<a")) &&
          !attrs.includes("buttonVariants")
        ) {
          continue;
        }
        for (const text of plainText(body)) {
          const word = lowerWord(text);
          if (word) {
            wrong.push(`${path.relative(ROOT, file)}: "${text}" ("${word}")`);
          }
        }
      }
    }
    expect(wrong).toEqual([]);
  });
});
