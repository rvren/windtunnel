# Windtunnel brand

Open [preview.html](preview.html) in a browser to see everything on one sheet.

## The mark: Parting

The app under test is not built yet, so it is not drawn. Two lines of air run
side by side, part around the space where it will be, and close up again. One
line takes the colour of the text, the other is the brand violet. Nothing else.

It is two strokes, so it holds at 16 px.

## Files

| File                | Use                                                   |
| ------------------- | ----------------------------------------------------- |
| `mark.svg`          | The mark, for light grounds                           |
| `mark-dark.svg`     | The mark, for dark grounds                            |
| `wordmark.svg`      | Mark and name, for light grounds                      |
| `wordmark-dark.svg` | Mark and name, for dark grounds                       |
| `icon.svg`          | App icon: the mark on a violet tile                   |
| `social-card.png`   | 1280×640 share card, also the GitHub social preview   |
| `preview.html`      | Contact sheet: sizes, both grounds, app icon, colours |

In the app, use the `Mark` and `Logo` components from
`src/components/brand/logo.tsx`. They follow the theme. `src/app/icon.svg` is a
copy of `icon.svg`.

## Colours

| Name   | Value     | Use                                     |
| ------ | --------- | --------------------------------------- |
| Violet | `#7C5CFF` | The brand colour: the logo and graphics |
| Ink    | `#0B0D10` | Text on light, and the dark ground      |
| Paper  | `#FAFAFC` | Text on dark, and the light ground      |

The interface is nearly monochrome: the main action is a white pill on dark and
an ink pill on light, and violet is kept for the logo, progress and links.
Violet on its own does not give small text enough contrast, so links use a
tuned step of it (`--link`): `#6A48F2` in the light theme and `#A594FF` in the
dark theme. The tokens are in `src/app/globals.css`.

## The name

Always lowercase in the logo: `windtunnel`. In running text it is a proper
noun: Windtunnel. One word, no space, no capital T.

## Type

| Typeface   | Use                                            |
| ---------- | ---------------------------------------------- |
| Geist Sans | Everything people read in the app and the deck |
| Geist Mono | Labels, numbers and code                       |
| Barlow     | The wordmark and the share card                |

The app is set in Geist Sans: quiet, dense and neutral, for a clean, minimal
console. Barlow, a DIN-style face, stays in the wordmark. All three typefaces
are licensed under the SIL Open Font License.

The wordmark is Barlow SemiBold with tracking of -0.01em, converted to outlines so
it renders the same everywhere.

## Geometry

The mark sits in a 64-unit square. Both lines have a 6-unit stroke with round
caps and joins.

```
upper  M6 25 H9 C17 25 18 13 28 13 S39 25 47 25 H58
lower  M6 39 H9 C17 39 18 51 28 51 S39 39 47 39 H58
```

The opening sits left of centre on purpose: the air comes from the left, parts
quickly and takes longer to settle.

## Rules

- Keep clear space around the logo equal to the height of the opening.
- The upper line is ink on light grounds and paper on dark grounds. The lower
  line is always violet. On the violet tile the lines are white over ink.
- Do not recolour, outline, tilt or stretch the mark, and do not put anything
  inside the opening. The empty space is the idea.
- Do not set the name in another typeface or weight.
