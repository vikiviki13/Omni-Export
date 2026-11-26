# Omni Export — PSD, Illustrator and HTML

A Figma plugin that exports selected frames, components, groups or layers to:

1. **Layered Photoshop PSD** (real `.psd`, generated locally with `ag-psd`)
2. **SVG for Illustrator** and **PDF for Illustrator** (no fake `.ai` files)
3. **Single-file HTML** with inline CSS and JavaScript (optional ZIP project)

Everything runs on your computer. No servers, no APIs, no analytics.

## Installation

```bash
npm install
npm run build
```

Then:

1. Open **Figma desktop** and a design file
2. Go to **Plugins → Development → Import plugin from manifest…**
3. Choose `manifest.json` from this folder
4. Run **Plugins → Development → Omni Export — PSD, Illustrator and HTML**

`manifest.json` ships with the placeholder id `REPLACE_WITH_FIGMA_PLUGIN_ID`. If Figma complains, create any new plugin once
(_Plugins → Development → New plugin…_), copy its generated `id` and paste it into `manifest.json`.

The build produces `dist/code.js` (Figma sandbox) and `dist/ui.html` (UI with JS/CSS inlined). No local server is needed.

## Development

```bash
npm run dev        # watch mode: rebuilds dist/ui.html and dist/code.js on change
npm run build      # clean production build
npm run typecheck  # tsc --noEmit
npm run lint
npm run format
npm test           # vitest unit tests
```

After a rebuild, close and re-run the plugin in Figma (_Plugins → Development → Run last plugin_, or ⌥⌘P / Ctrl+Alt+P).

### Project layout

```
src/plugin   Figma sandbox: selection reading, node serializer, image/font readers, exportAsync handlers
src/ui       React UI + exporters (psd, svg, pdf, html, css, javascript, zip) + utilities
src/shared   Types shared by both sides (typed message contracts), constants, colour/font helpers
tests        Unit tests
```

Sandbox ↔ UI communication uses typed messages (`src/shared/types.ts`); only serialisable data (including `Uint8Array`) crosses the boundary.

## How it works

- **Scope:** current selection, current page, or all pages (pages are loaded explicitly). _Include hidden layers_ is global.
- **PSD, high fidelity (default):** the Figma hierarchy becomes PSD folders. Each visual leaf is exported with `exportAsync` as a transparent PNG and placed at
  `localLeft = childAbsoluteX − rootAbsoluteX` (using render bounds, so strokes/effects are not shifted). Frames with their own fill/stroke/shadow get a
  separate "… background" layer. Ancestor clipping is applied by cropping. A flattened composite and thumbnail are generated.
- **PSD, editable:** supported text (including mixed-style runs), solid or linear fills on square-cornered rectangles and ellipses, solid shape strokes, and drop/inner shadows become native Photoshop text/shape layers with pixel previews. Other artwork remains in named raster layers so the visual result is retained. One failing layer never cancels the export.
- **Illustrator:** SVG comes from Figma's SVG export, then ids are sanitised/de-duplicated and the file is validated and optionally optimised. PDF is Figma's PDF export.
  Multiple frames can be separate files, a ZIP package, or one combined SVG with artboards side by side.
- **HTML:** semantic tags are inferred from layer/component names (`Button/Primary` → `<button>`, `Heading/H1` → `<h1>`, `Navigation/Header` → `<header><nav>`,
  `Input/Email` → `<input type="email">`, `Card/Product` → `<article>`, …). _Pixel-perfect_ uses absolute positioning; _Responsive_ maps Auto Layout to Flexbox and constraints to
  positioning, with breakpoints. Repeated colours, font sizes, radii, shadows and spacing become CSS custom properties. Images are Base64, vectors are inline SVG.
- **Interactions:** prototype click reactions (navigate, overlay open/close, back, URL, scroll-to), tabs, accordion, dropdown, menu toggle, modal close, form submit
  prevention. Name conventions: `Tabs` (children `Tab` + `Panel`), `Accordion` (items: first child = header), `Dropdown` (first child trigger, second menu),
  `Menu toggle`/`Hamburger` + `Menu`/`Drawer`, `Modal`/`Dialog` + `Close`. JavaScript is only emitted when needed and never uses `eval`.
- **Exports clone temporarily:** for "background only" or hidden-layer renders the plugin clones a node, exports it and removes the clone. The document ends unchanged, but
  Figma's undo history may show the temporary edits.

## Manual test checklist

Create each case in Figma, select it and export in the relevant tab:

1. Basic frame · 2. Nested groups · 3. Auto Layout · 4. Text · 5. Mixed-style text · 6. Images · 7. SVG icons · 8. Gradients · 9. Masks · 10. Blur effects ·
2. Component instances · 12. Multiple frames (ZIP) · 13. Large frame (try 3× to see the size warning) · 14. Hidden layers (toggle _Include hidden layers_) ·
3. Rotated layers · 16. Negative-position layers

Check PSDs in Photoshop, Photopea or Affinity Photo (folders, names, order, positions), SVG/PDF in Illustrator, and HTML by opening the file with the network disconnected.

## Limitations

- PSD is RGB, 8 bits per channel. Complex effects, masks, boolean operations, multi-paint fills, non-solid strokes, and vector geometry beyond simple rectangles and ellipses remain raster layers; editable text depends on fonts being available in Photoshop.
- Layer opacity is baked into exported PNG pixels (PSD layer opacity stays 100 % on raster layers); group opacity is kept on folders.
- Experimental PSD text layers may not match Photoshop exactly (PostScript names are derived from Figma font names).
- **Native `.ai` output is not generated.** Open the SVG or PDF in Illustrator.
- Figma Auto Layout and components do not stay functional in Illustrator.
- Background blur and noise/texture effects are not representable in SVG; use "Rasterize frames with unsupported effects" if needed.
- Prototype conversion supports only the basic interactions listed above.
- Generated HTML is a faithful starting point and may need manual production refinement (custom fonts are not embedded; fallback stacks are used).

## Privacy

Files are processed locally. No design data is uploaded, no external API is used, no analytics are included, and the manifest sets
`networkAccess.allowedDomains` to `["none"]`. Only UI preferences (format, scale, toggles, file-name pattern) are stored in Figma client storage.
