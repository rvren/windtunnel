/*
 * Pagination for every list in the app: which rows a page shows, and which
 * page numbers the pager offers. Pure, so one rule serves the server pages
 * (the page in the address) and the client lists (the page in state).
 */

/** Rows per page, unless a list asks for another size. */
export const PAGE_SIZE = 25;

export interface Page<T> {
  items: T[];
  /** The page shown, from 1, kept inside the pages there are. */
  page: number;
  pages: number;
  total: number;
  /** The rows shown, counting from 1: "26–50 of 152". 0 when empty. */
  from: number;
  to: number;
}

/** The page asked for, from the address or from state; 1 when unclear. */
export function pageParam(value: unknown): number {
  const text = Array.isArray(value) ? value[0] : value;
  const n = Number.parseInt(String(text ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function pageOf<T>(
  items: T[],
  asked: unknown,
  size = PAGE_SIZE,
): Page<T> {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(pageParam(asked), pages);
  const start = (page - 1) * size;
  const shown = items.slice(start, start + size);
  return {
    items: shown,
    page,
    pages,
    total,
    from: shown.length > 0 ? start + 1 : 0,
    to: start + shown.length,
  };
}

/**
 * The page numbers to offer: always the first and the last, the current
 * one and its neighbours, and a gap where pages are left out. Seven slots
 * at most, so the pager keeps its width.
 */
export function pageNumbers(page: number, pages: number): (number | "gap")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const start = Math.max(2, Math.min(page - 1, pages - 4));
  const end = Math.min(pages - 1, Math.max(page + 1, 5));
  return [
    1,
    ...(start > 2 ? ["gap" as const] : []),
    ...Array.from({ length: end - start + 1 }, (_, i) => start + i),
    ...(end < pages - 1 ? ["gap" as const] : []),
    pages,
  ];
}
