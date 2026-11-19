"use client";

import { useState } from "react";

import { PAGE_SIZE, pageOf, type Page } from "@/lib/paging";

/**
 * One page of a client list, and the way to turn it. `resetKey` stands for
 * the list's filters: when it changes, the list starts again at page 1.
 */
export function usePage<T>(
  items: T[],
  resetKey = "",
  size = PAGE_SIZE,
): Page<T> & { setPage: (page: number) => void } {
  const [state, setState] = useState({ key: resetKey, page: 1 });
  const asked = state.key === resetKey ? state.page : 1;
  return {
    ...pageOf(items, asked, size),
    setPage: (page: number) => setState({ key: resetKey, page }),
  };
}
