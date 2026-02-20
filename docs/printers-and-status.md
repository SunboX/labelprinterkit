# Printers And Status

## Printer Classes

- `BasePrinter`: shared backend holder.
- `GenericPrinter`: full raster protocol implementation.
- `P700`, `P750W`: `GenericPrinter` aliases.
- `H500`: low-resolution-only variant (no half-cut support).
- `E500`, `E550W`: aliases for `H500`/`P750W`.

## Print Lifecycle

`GenericPrinter.print(job, options?)` does:

1. Validate job media/resolution support.
2. Request pre-flight status and fail early on printer/media errors.
3. Reset printer and send raster commands/page lines.
4. Send final print command.
5. Request post-print status and fail on late errors.

`options.encodedPages` can be provided to skip inline per-line compression:

- `encodedPages[i].lines` should contain prebuilt line payloads from `encodeLine(...)`.
- When present, printer transmission uses those payloads directly.

Status requests use `_requestStatus(...)`; for non-custom backends this sends `ESC i S` and parses a 32-byte response.

## Status Object

`new Status(data)` parses:

- `errors` (bit flags from two bytes)
- `mediaWidth`, `mediaType`, derived `media`
- `status`, `notification`
- `tapeColor`, `textColor`

Helpers:

- `status.ready()`: true when no error flags are set.
- `status.media`: resolved media profile via `getMedia(...)`.

## User-Facing Errors

Media and printer conditions are mapped to readable messages (for example media mismatch, no media, cover open, overheating).

See `printer-status-errors.md` for the full message mapping.

## Raster Helpers

- `encodeLine(bitmapLine, padding)`: packs one page line into protocol payload (PackBits-compressed and length-prefixed).
