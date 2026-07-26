---
name: annotate-screenshots
description: Capture or transform screenshots into honest, deterministic annotated images using matched raw PNGs plus Sharp-composited SVG labels, outlines, arrows, and callouts. Use for PR before/after comparisons, product-change evidence, UI walkthroughs, bug reports, or requests to highlight differences in screenshots without generative image editing.
---

# Annotate Screenshots

Create annotation layers without redrawing the underlying product UI. Capture an unmodified screenshot first, then build one SVG overlay and composite it with Sharp.

Never inject annotation HTML, CSS, SVG, or DOM nodes into the page being captured. Use browser tooling only to reach, frame, and capture the raw state. Render every label, outline, arrow, and callout afterward with `scripts/annotate-screenshot.mjs`.

## Workflow

1. Establish provenance before capturing.
   - Identify the exact route or app surface, source state, authentication state, and data state.
   - Treat a fixture, Storybook story, component harness, or mock as a fixture. Never present it as the actual route.
   - When the user names a real page, capture that real page unless they explicitly approve a fixture.
2. Match before and after.
   - Keep viewport, zoom, responsive breakpoint, theme, account, filters, date range, scroll framing, and sidebar state identical.
   - Capture the base branch or verified production state for “before” and the requested branch or local state for “after.”
   - Preserve honest empty, loading, unavailable, and privacy-filtered states. Do not inject representative data without labeling it.
3. Save unannotated captures as PNG.
   - Keep raw captures separate from final assets.
   - Frame the changed area consistently. Use element bounds when browser tooling exposes them.
   - Record the capture facts needed for the PR or report: route, source state, viewport, and any fixture/data caveat.
4. Annotate after capture with Sharp + SVG only.
   - Keep the original screenshot dimensions. Do not add a header or expand the canvas.
   - Put route, source-state, and fixture provenance in the surrounding PR or report copy.
   - Use a dashed outline for an area with no prior equivalent.
   - Use a solid outline for a new or changed region.
   - Use arrows or compact callouts only when the outline alone is ambiguous.
   - Keep labels factual and short. Describe what changed, not whether it is “better.”
5. Render with `scripts/annotate-screenshot.mjs`.
6. Inspect every final image at full size and verify dimensions, legibility, crop, and surrounding provenance wording.
7. If publishing to a PR, confirm the pushed image URLs resolve and say whether each image is a real route or a fixture.

## Render

The renderer checks the current project, the input image's parent project, and the skill directory for `sharp`. If none has it, install the bundled dependency manifest once:

```bash
npm install --prefix /absolute/path/to/annotate-screenshots
```

Then render:

```bash
node /absolute/path/to/annotate-screenshots/scripts/annotate-screenshot.mjs \
  --input /absolute/path/to/raw.png \
  --output /absolute/path/to/annotated.jpg \
  --spec /absolute/path/to/annotation.json
```

Coordinates in the spec are relative to the raw screenshot, and the output dimensions match the input.

Use a spec like:

```json
{
  "annotations": [
    {
      "type": "rect",
      "x": 187,
      "y": 471,
      "width": 1137,
      "height": 160,
      "style": "solid",
      "label": "NEW ON THIS BRANCH"
    }
  ],
  "output": {
    "quality": 92
  }
}
```

For a before image, use `"style": "dashed"` and label the absent region `"NO PRIOR EQUIVALENT"`.

Supported annotation types:

- `rect`: Require `x`, `y`, `width`, and `height`; optionally set `style`, `label`, `radius`, `strokeWidth`, `color`, and `labelPosition`.
- `arrow`: Require `from: [x, y]` and `to: [x, y]`; optionally set `bend`, `strokeWidth`, and `color`.
- `callout`: Require `x`, `y`, `width`, and `title`; optionally set `badge`, `body` as an array of lines, `target: [x, y]`, and colors.

Print a complete spec without rendering:

```bash
node /absolute/path/to/annotate-screenshots/scripts/annotate-screenshot.mjs --print-example
```

## Visual Rules

- Use bright red `#FF1F1F` for annotation outlines, labels, arrows, and callout targets.
- Use one accent color across a comparison pair.
- Keep provenance outside the image unless a compact callout is itself part of the requested evidence.
- Prefer one primary outline and at most one supporting callout per image.
- Keep a before/after pair at identical final dimensions.
- Export JPEG at quality 92 with 4:4:4 chroma for compact PR assets. Export PNG when exact pixel preservation matters.

## Validation

Before delivery:

- Confirm the raw and final image dimensions match.
- Confirm before and after dimensions match.
- Open the images at original detail; do not rely on thumbnails.
- Confirm annotations do not hide the changed UI.
- Confirm the raw route pixels came from the stated source.
- Confirm fixture or representative-data caveats appear in the surrounding PR or report copy.
- Keep raw PNGs until the final assets and remote URLs have been verified.

Do not use generative image editing for this workflow. If the request requires altering the screenshot’s product pixels rather than adding evidence overlays, stop and clarify that the result would no longer be a faithful capture.
