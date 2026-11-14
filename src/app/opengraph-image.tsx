import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

// The share card. 1280x640 is also the size GitHub wants for a repository's
// social preview, so brand/social-card.png is saved straight from this route.
export const alt = "Windtunnel — Break it before you build it";
export const size = { width: 1280, height: 640 };
export const contentType = "image/png";

const INK = "#0B0D10";
const PAPER = "#FAFAFC";
const VIOLET = "#7C5CFF";
const MUTED = "#9EA1B0";
// Width over height of brand/wordmark-dark.svg, from its viewBox.
const WORDMARK_RATIO = 616 / 114;

export default async function Image() {
  const [wordmark, barlow] = await Promise.all([
    readFile(join(process.cwd(), "brand/wordmark-dark.svg"), "base64"),
    readFile(
      join(
        process.cwd(),
        "node_modules/@fontsource/barlow/files/barlow-latin-500-normal.woff",
      ),
    ),
  ]);

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: INK,
        color: PAPER,
        fontFamily: "Barlow",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          padding: "84px 96px 0",
        }}
      >
        <img
          src={`data:image/svg+xml;base64,${wordmark}`}
          alt=""
          width={Math.round(72 * WORDMARK_RATIO)}
          height={72}
        />
        <div
          style={{
            marginTop: 64,
            fontSize: 68,
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
          }}
        >
          Break it before you build it.
        </div>
        <div style={{ marginTop: 22, fontSize: 30, color: MUTED }}>
          Simulate an application before it is built.
        </div>
      </div>
      <svg
        width="1280"
        height="180"
        viewBox="0 0 1280 180"
        fill="none"
        style={{ position: "absolute", left: 0, bottom: 36 }}
      >
        <path
          d="M-10 76H812C872 76 880 26 960 26S1048 76 1108 76H1290"
          stroke={PAPER}
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M-10 104H812C872 104 880 154 960 154S1048 104 1108 104H1290"
          stroke={VIOLET}
          strokeWidth="5"
          strokeLinecap="round"
        />
      </svg>
    </div>,
    {
      ...size,
      fonts: [{ name: "Barlow", data: barlow, weight: 500, style: "normal" }],
    },
  );
}
