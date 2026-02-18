# Printer Status And Media Errors

This project now checks printer status before and after each print job and throws user-facing error messages when the printer reports an issue.

## What Is Checked

`GenericPrinter.print(job)` performs:

1. A pre-flight status request before sending raster data.
2. A post-print status request after sending the final print command.

If either status response reports an error, printing fails with a descriptive `Error`.

## User-Facing Error Messages

The printer status flags are mapped to friendly messages, including:

- `REPLACE_MEDIA`:
  - Example: `Loaded media mismatch: printer has 24mm tape, but this job expects 9mm tape. Load 9mm tape and retry.`
- `NO_MEDIA`:
  - `No tape is loaded. Insert a tape cassette and try again.`
- `COVER_OPEN`:
  - `Printer cover is open. Close the cover and try again.`
- `CUTTER_JAM`:
  - `Printer cutter jam detected. Clear the jam and try again.`
- `OVERHEATING`:
  - `Printer is overheating. Let it cool down, then try again.`
- `WEAK_BATTERY`:
  - `Printer battery is low. Charge or power the printer and try again.`

There is also a media-width/type mismatch check against the expected job media, even when a specific media error flag is not set.

## Where It Is Implemented

- Status parsing and message mapping: `src/printers.mjs`
- Status constants: `src/constants.mjs`
- Coverage tests: `test/printers.test.mjs`

## UI Behavior

The demo UI already surfaces thrown `Error.message` strings, so these messages are shown to the user without additional UI changes.
