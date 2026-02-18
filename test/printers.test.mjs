import test from 'node:test'
import assert from 'node:assert/strict'

import { Job, Media, MediaType, P700, Resolution, StatusCodes } from '../src/index.mjs'

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
