# Versioning

Use the runtime version API to read the exact library version that is currently loaded.

## API

- `getLibraryVersion()`: Returns the active library version as a string.
- `LIBRARY_VERSION`: Exported constant with the same value.

## Example

```js
import { getLibraryVersion, LIBRARY_VERSION } from './src/index.mjs'

console.log(getLibraryVersion()) // "1.0.5"
console.log(LIBRARY_VERSION) // "1.0.5"
```

## When To Use

- Include the library version in bug reports.
- Log version telemetry in browser sessions.
- Show runtime diagnostics in a UI or debug panel.
