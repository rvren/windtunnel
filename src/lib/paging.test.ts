import { describe, expect, it } from "vitest";

import { pageNumbers, pageOf, pageParam } from "./paging";

const rows = Array.from({ length: 52 }, (_, i) => i + 1);

describe("pageOf", () => {
  it("shows one page of rows and says which", () => {
    const page = pageOf(rows, "2");
    expect(page).toMatchObject({
      page: 2,
      pages: 3,
      total: 52,
      from: 26,
      to: 50,
    });
    expect(page.items[0]).toBe(26);
  });

  it("keeps a page asked for past the end, or nonsense, inside the pages", () => {
    expect(pageOf(rows, "9").page).toBe(3);
    expect(pageOf(rows, "9").items).toEqual([51, 52]);
    expect(pageOf(rows, "abc").page).toBe(1);
    expect(pageOf(rows, ["2", "3"]).page).toBe(2);
  });

  it("has one empty page for no rows", () => {
    expect(pageOf([], 1)).toEqual({
      items: [],
      page: 1,
      pages: 1,
      total: 0,
      from: 0,
      to: 0,
    });
  });
});

describe("pageParam", () => {
  it("reads a page number, and 1 for anything else", () => {
    expect(pageParam("4")).toBe(4);
    expect(pageParam("0")).toBe(1);
    expect(pageParam(undefined)).toBe(1);
  });
});

describe("pageNumbers", () => {
  it("lists every page when there are few", () => {
    expect(pageNumbers(1, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("keeps the ends and the pages around the current one", () => {
    expect(pageNumbers(1, 20)).toEqual([1, 2, 3, 4, 5, "gap", 20]);
    expect(pageNumbers(10, 20)).toEqual([1, "gap", 9, 10, 11, "gap", 20]);
    expect(pageNumbers(20, 20)).toEqual([1, "gap", 16, 17, 18, 19, 20]);
  });
});
