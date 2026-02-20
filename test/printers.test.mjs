import test from 'node:test'
import assert from 'node:assert/strict'

import { Job, Media, MediaType, P700, Resolution, StatusCodes, encodeLine } from '../src/index.mjs'

function page({ width, resolution = Resolution.LOW, length = Resolution.LOW.minLength } = {}) {
    return { width, resolution, length, lines: () => [] }
}

function makeStatus({
    errorLow = 0x00,
    errorHigh = 0x00,
    mediaWidth = Media.W9.width,
    mediaType = MediaType.LAMINATED_TAPE,
    statusCode = StatusCodes.STATUS_REPLY
} = {}) {
    const data = new Uint8Array(32)
    data[8] = errorLow
    data[9] = errorHigh
    data[10] = mediaWidth
    data[11] = mediaType
    data[18] = statusCode
    return data
}

class FakeBackend {
    constructor(statuses = []) {
        this.statuses = statuses
        this.writes = []
    }

    async write(data) {
        this.writes.push(data instanceof Uint8Array ? data : new Uint8Array(data))
    }

    async read() {
        return this.statuses.shift() || null
    }
}

function makeJob(media = Media.W9) {
    const job = new Job(media, { resolution: Resolution.LOW })
    job.addPage(page({ width: media.printArea }))
    return job
}

function makeRasterPage(media = Media.W9) {
    const templates = [
        new Uint8Array([0xff, 0x00, 0xff, 0x00, 0xff, 0x00, 0xff, 0x00]),
        new Uint8Array([0x00, 0xff, 0x00, 0xff, 0x00, 0xff, 0x00, 0xff]),
        new Uint8Array([0x11, 0x22, 0x44, 0x88, 0x11, 0x22, 0x44, 0x88])
    ]
    const lines = Array.from({ length: Resolution.LOW.minLength }, (_, index) => templates[index % templates.length].slice())
    return {
        width: media.printArea,
        resolution: Resolution.LOW,
        length: lines.length,
        lines: () => lines.map((line) => line.slice())
    }
}

function makeRasterJob(media = Media.W9) {
    const printablePage = makeRasterPage(media)
    const job = new Job(media, { resolution: Resolution.LOW })
    job.addPage(printablePage)
    return { job, printablePage }
}

test('Printer reports friendly REPLACE_MEDIA message for loaded tape width mismatch', async () => {
    const backend = new FakeBackend([
        makeStatus({
            errorHigh: 0x01, // REPLACE_MEDIA
            mediaWidth: Media.W24.width,
            mediaType: MediaType.LAMINATED_TAPE
        })
    ])
    const printer = new P700(backend)

    await assert.rejects(printer.print(makeJob(Media.W9)), /Loaded media mismatch: printer has 24mm tape, but this job expects 9mm tape/)
})

test('Printer reports friendly NO_MEDIA message before printing', async () => {
    const backend = new FakeBackend([
        makeStatus({
            errorLow: 0x01, // NO_MEDIA
            mediaWidth: 0,
            mediaType: MediaType.NO_MEDIA
        })
    ])
    const printer = new P700(backend)

    await assert.rejects(printer.print(makeJob(Media.W9)), /No tape is loaded/)
})

test('Printer checks status both before and after sending a print job', async () => {
    const backend = new FakeBackend([
        makeStatus({ mediaWidth: Media.W9.width }), // pre-flight
        makeStatus({ mediaWidth: Media.W24.width }) // post-print mismatch
    ])
    const printer = new P700(backend)

    await assert.rejects(printer.print(makeJob(Media.W9)), /Loaded media mismatch/)
})

test('Printer continues when pre and post status both match the job media', async () => {
    const backend = new FakeBackend([makeStatus({ mediaWidth: Media.W9.width }), makeStatus({ mediaWidth: Media.W9.width })])
    const printer = new P700(backend)

    await assert.doesNotReject(printer.print(makeJob(Media.W9)))
})

test('Printer writes identical bytes with pre-encoded page lines', async () => {
    const media = Media.W9
    const { job: defaultJob, printablePage } = makeRasterJob(media)
    const encodedLines = printablePage.lines().map((line) => encodeLine(line, media.lmargin))

    const baselineBackend = new FakeBackend([makeStatus({ mediaWidth: media.width }), makeStatus({ mediaWidth: media.width })])
    const encodedBackend = new FakeBackend([makeStatus({ mediaWidth: media.width }), makeStatus({ mediaWidth: media.width })])

    await new P700(baselineBackend).print(defaultJob)

    const { job: preEncodedJob } = makeRasterJob(media)
    await new P700(encodedBackend).print(preEncodedJob, { encodedPages: [{ lines: encodedLines }] })

    assert.deepEqual(encodedBackend.writes, baselineBackend.writes)
})

test('Printer rejects pre-encoded lines if line count does not match page length', async () => {
    const media = Media.W9
    const { job } = makeRasterJob(media)
    const backend = new FakeBackend([makeStatus({ mediaWidth: media.width })])
    const printer = new P700(backend)

    await assert.rejects(
        printer.print(job, {
            encodedPages: [{ lines: [new Uint8Array([0x00])] }]
        }),
        /Pre-encoded page line count does not match page length/
    )
})
