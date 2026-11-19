/*
 * What the Storefront sample scripts for the newer kinds, so the screens
 * offer only what a free demo can play. The scripts themselves are in
 * src/server/engine/sample-*.ts; a test keeps the two lists the same.
 */

/** Engine Out scenarios the sample plays, as "part:mode". */
export const SAMPLE_OUTAGES = [
  "cmp-billing:slow",
  "cmp-billing:down",
  "cmp-auth:down",
  "cmp-payments:down",
  "cmp-payments:slow",
];

/** Issues the sample scripts a Dogfight for. */
export const SAMPLE_DUELS = ["g-cat-sqli"];
