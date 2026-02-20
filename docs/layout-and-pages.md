# Layout And Pages

## Core Classes

- `Padding(left, top, bottom, right)`: spacing for text rendering.
- `TextItem(height, text, font, padding, fontSize)`: renders one text block into canvas.
- `BoxItem(height, items, { vertical, leftPadding })`: composes items horizontally or vertically.
- `Label(resolution, ...items)`: combines rows/items into a printable bitmap page.
- `Page(bitmap, width, length, resolution)`: low-level page from raw bitmap bytes.

Both `Label` and `Page` are printable page objects exposing:

- `width` (dots)
- `length` (dots)
- `resolution`
- `lines()` (returns raster lines as byte slices)

## Rendering Pipeline

`Label` converts canvas image data using `imageDataToBitmap(...)`:

1. Read RGBA pixels.
2. Threshold by luminance.
3. Rotate/flip into printer-oriented raster layout.
4. Pack into 1-bit bitmap lines.

Use `bitmapToImageData(...)` to visualize a bitmap in browser debugging flows.

## Frontend Worker Rendering

The editor demo at `examples/complex_label_with_frontend/` uses a dedicated preview worker (`preview-render.worker.mjs`) for:

- text measurement and font fitting
- QR matrix rasterization
- preview canvas generation

If worker/offscreen rendering is unavailable, the UI falls back to main-thread canvas rendering.

## Utility Functions

- `bytesPerLine(width)`: returns `Math.ceil(width / 8)`.
- `imageDataToBitmap(imageData)`: returns `{ bitmap, width, length }`.
- `bitmapToImageData(bitmap, width, length)`: converts back to browser `ImageData`.

## Examples

Create a label from layout items:

```js
const label = new Label(Resolution.LOW, row1, row2, row3)
```

Create a page directly from `ImageData`:

```js
const page = Page.fromImageData(imageData, Resolution.LOW)
```
