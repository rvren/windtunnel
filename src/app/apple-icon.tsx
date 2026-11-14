import { ImageResponse } from "next/og";

// Home-screen icon. iOS rounds the corners itself, so the tile is a full
// square. Same drawing as brand/icon.svg.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
        background: "#7C5CFF",
      }}
    >
      <svg width="144" height="144" viewBox="0 0 64 64" fill="none">
        <path
          d="M6 25H9C17 25 18 13 28 13S39 25 47 25H58"
          stroke="#FFFFFF"
          strokeWidth="7.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M6 39H9C17 39 18 51 28 51S39 39 47 39H58"
          stroke="#0B0D10"
          strokeWidth="7.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>,
    size,
  );
}
