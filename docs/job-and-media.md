# Job And Media

## Media Model

`Media` constants define known tape profiles such as `W3_5`, `W6`, `W9`, `W12`, `W18`, `W24`.

Each media entry includes:

- `id`
- `width` (mm)
- `printArea` (dots, printable head area)
- `lmargin`, `rmargin` (dot padding to center narrower tape on the head)
- `mediaType`

Use `getMedia(width, mediaType)` to resolve media from status payload values.

## Creating A Job

```js
const job = new Job(Media.W9, {
  autoCut: true,
  mirrorPrinting: false,
  halfCut: false,
  chain: false,
  specialTape: false,
  cutEach: 1,
  resolution: Resolution.LOW
})
```

## Validation Rules

`job.addPage(page)` enforces:

- Media has a defined printable area.
- `page.width === job.media.printArea`.
- `page.resolution.id === job.resolution.id`.
- `page.length >= job.resolution.minLength`.

`cutEach` must be in the range `1..99`.

If any rule fails, `Job` throws an `Error` with a descriptive message.
