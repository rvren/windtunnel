/*
 * The 3D tunnel's colours, read from the theme. Each is a CSS custom
 * property on the drawing (set per theme in wind-tunnel-3d.tsx, most of
 * them the app's own tokens), turned into the 0–1 sRGB numbers three.js
 * takes by painting one pixel: that reads any colour the browser knows,
 * whatever syntax the token is written in.
 */

export type Rgb = [number, number, number];

export interface Palette {
  dark: boolean;
  /** The panel behind the drawing: the scene's background. */
  bg: Rgb;
  /** Text drawn into the scene: the parts' names, the application's. */
  ink: Rgb;
  /** The streams and the fine lines of the drawing. */
  line: Rgb;
  /** The turbine, matte: its blades, its cowl and lip, its vanes. */
  blade: Rgb;
  metal: Rgb;
  frame: Rgb;
  brand: Rgb;
  ok: Rgb;
  danger: Rgb;
  warning: Rgb;
  muted: Rgb;
}

const TOKENS: Record<Exclude<keyof Palette, "dark">, string> = {
  bg: "--wt-bg",
  ink: "--wt-ink",
  line: "--wt-line",
  blade: "--wt-blade",
  metal: "--wt-metal",
  frame: "--wt-frame",
  brand: "--brand",
  ok: "--ok",
  danger: "--sev-critical",
  warning: "--sev-high",
  muted: "--sev-low",
};

export function readPalette(element: HTMLElement, dark: boolean): Palette {
  const style = getComputedStyle(element);
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const rgb = (token: string): Rgb => {
    const value = style.getPropertyValue(token).trim();
    if (!context || !value) return [0.5, 0.5, 0.5];
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = "#808080";
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
    return [r / 255, g / 255, b / 255];
  };
  const palette = { dark } as Palette;
  for (const [key, token] of Object.entries(TOKENS)) {
    palette[key as keyof typeof TOKENS] = rgb(token);
  }
  return palette;
}

/** A colour as CSS, for the canvas text drawn into the scene. */
export const css = ([r, g, b]: Rgb) =>
  `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;
