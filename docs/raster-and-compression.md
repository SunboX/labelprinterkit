# Raster And Compression

## Bitmap Shape

Pages are represented as 1-bit raster data:

- `width` in dots
- `length` in dots
- `bitmap` as row-major bytes (`bytesPerLine(width) * length`)

`Page.lines()` splits bitmap into per-row byte arrays for printer transmission.

## PackBits

`packbitsEncode(bytes)` in `src/packbits.mjs` applies minimal PackBits encoding:

- Repeated runs are emitted as run markers.
- Non-repeating runs are emitted as literals.

The printer line encoder (`encodeLine(...)`) uses this compressed output and prefixes each line with its compressed payload length (little-endian).

## Why It Matters

Raster + PackBits reduces transfer size and follows the Brother raster protocol expected by the printer firmware.
