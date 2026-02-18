# Constants Reference

## Resolution

- `Resolution.LOW`: `180x180`, min length `31`.
- `Resolution.HIGH`: `180x320`, min length `62`.

Use the same resolution on `Job` and pages.

## Media

`Media` includes predefined tape widths (`W3_5`, `W6`, `W9`, `W12`, `W18`, `W24`) plus sentinels:

- `Media.NO_MEDIA`
- `Media.UNSUPPORTED_MEDIA`

Use `getMedia(width, mediaType)` for mapping raw status values to a media profile.

## Status And Error Enums

- `ErrorCodes`: `NO_MEDIA`, `REPLACE_MEDIA`, `COVER_OPEN`, `CUTTER_JAM`, `OVERHEATING`, etc.
- `StatusCodes`: `STATUS_REPLY`, `PRINTING_DONE`, `ERROR_OCCURRED`, etc.
- `NotificationCodes`: `NOT_AVAILABLE`, `COVER_OPEN`, `COVER_CLOSED`.

## Media/Color Enums

- `MediaType`: laminated/non-laminated/heat-shrink/incompatible.
- `TapeColor`: tape cassette color codes from status payload.
- `TextColor`: text color codes from status payload.

## Printer Mode Flags

- `VariousModesSettings`: `AUTO_CUT`, `MIRROR_PRINTING`.
- `AdvancedModeSettings`: `HALF_CUT`, `CHAIN_PRINTING`, `SPECIAL_TAPE`, `HIGH_RESOLUTION`, `BUFFER_CLEARING`.
