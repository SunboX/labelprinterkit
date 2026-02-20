# Documentation

This folder contains module-level documentation for the library.

## Guides

- `getting-started.md`: Setup, backend selection, and first print.
- `layout-and-pages.md`: Canvas/layout pipeline (`TextItem`, `BoxItem`, `Label`, `Page`).
- `job-and-media.md`: Media selection and `Job` validation rules.
- `printers-and-status.md`: Printer classes, print lifecycle, and status model.
- `backends.md`: WebUSB and WebBluetooth backend behavior and options.
- `constants-reference.md`: Exported constants/enums and when to use them.
- `versioning.md`: Runtime library version API (`getLibraryVersion`, `LIBRARY_VERSION`).
- `raster-and-compression.md`: Bitmap layout and PackBits line compression.
- `printer-status-errors.md`: User-facing status/error messages and media mismatch handling.

## Entry Point

Import from `src/index.mjs` to access the full public API surface.

```js
import {
  Media,
  Resolution,
  Job,
  Label,
  TextItem,
  BoxItem,
  P700,
  WebUSBBackend,
  getLibraryVersion
} from './src/index.mjs'
```

```js
getLibraryVersion() // "1.0.7"
```
