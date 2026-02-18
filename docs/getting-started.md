# Getting Started

## Requirements

- A secure browser context (`https` or `localhost`).
- A Chromium-based browser for WebUSB/WebBluetooth support.
- A Brother-compatible device supported by your chosen backend.

## Install And Run Demo

```bash
npm install
PORT=3000 npm start
```

Open:

`http://localhost:3000/examples/complex_label_with_frontend/`

## Minimal Print Flow

```js
import { BoxItem, Job, Label, Media, P700, Resolution, TextItem, WebUSBBackend } from './src/index.mjs'

const backend = await WebUSBBackend.requestDevice({ filters: [{ classCode: 7 }] })
const media = Media.W12
const resolution = Resolution.LOW

const rowAHeight = Math.floor(media.printArea * 0.58)
const rowBHeight = media.printArea - rowAHeight
const rowA = new BoxItem(rowAHeight, [new TextItem(rowAHeight, 'First line', '28px sans-serif')])
const rowB = new BoxItem(rowBHeight, [new TextItem(rowBHeight, 'Second line', '22px sans-serif')])
const label = new Label(resolution, rowA, rowB)

const job = new Job(media, { resolution })
job.addPage(label)

const printer = new P700(backend)
await printer.print(job)
```

## Important Runtime Rules

- The page width must match `media.printArea` or `job.addPage(...)` throws.
- The page resolution must match job resolution or `job.addPage(...)` throws.
- The loaded cassette must match the job media; printer status checks run before and after print.

If media/status is wrong (for example, 24mm loaded but 9mm requested), `printer.print(...)` throws a user-facing error message.

## Check Library Version At Runtime

```js
import { getLibraryVersion } from './src/index.mjs'

console.log(getLibraryVersion()) // "1.0.4"
```
