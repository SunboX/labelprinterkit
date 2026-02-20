import test from 'node:test'
import assert from 'node:assert/strict'

import { createPreviewWorkerClient } from '../examples/complex_label_with_frontend/preview-render-client.mjs'

class FakeWorker {
    constructor() {
        this.listeners = new Map()
        this.messages = []
        this.terminated = false
    }

    addEventListener(type, handler) {
        if (!this.listeners.has(type)) {
            this.listeners.set(type, [])
        }
        this.listeners.get(type).push(handler)
    }

    postMessage(message) {
        this.messages.push(message)
    }

    emitMessage(data) {
        for (const handler of this.listeners.get('message') || []) {
            handler({ data })
        }
    }

    terminate() {
        this.terminated = true
    }
}

function makeSnapshot() {
    return {
        media: 'W9',
        mediaLengthMm: null,
        resolution: 'LOW',
        orientation: 'horizontal',
        items: [{ id: 'one', type: 'text', text: 'Label', fontFamily: 'sans-serif', fontSize: 16, height: 32, xOffset: 0, yOffset: 0 }]
    }
}

function makeMedia() {
    return { printArea: 64, lmargin: 0, rmargin: 0 }
}

function makeResolution() {
    return { id: 'LOW', dots: [180, 180], minLength: 31 }
}

function makeSuccessPayload(requestId, overrides = {}) {
    const printRgba = new Uint8ClampedArray([0, 0, 0, 255])
    return {
        requestId,
        ok: true,
        stateKey: `state-${requestId}`,
        previewBitmap: { id: requestId },
        width: 32,
        height: 32,
        printWidth: 32,
        printHeight: 32,
        printRgbaBuffer: printRgba.buffer,
        printRgbaByteOffset: 0,
        printRgbaByteLength: printRgba.byteLength,
        resolutionDotsX: 180,
        printableWidth: 64,
        marginStart: 0,
        marginEnd: 0,
        isHorizontal: true,
        ...overrides
    }
}

test('Preview client rejects stale worker responses when a newer request was issued', async () => {
    const worker = new FakeWorker()
    const client = createPreviewWorkerClient({
        workerFactory: () => worker,
        defaultTimeoutMs: 1000
    })

    const first = client.preparePreviewInWorker({
        snapshot: makeSnapshot(),
        media: makeMedia(),
        resolution: makeResolution()
    })
    const firstId = worker.messages[0].requestId

    const second = client.preparePreviewInWorker({
        snapshot: makeSnapshot(),
        media: makeMedia(),
        resolution: makeResolution()
    })
    const secondId = worker.messages[1].requestId

    worker.emitMessage(makeSuccessPayload(secondId, { stateKey: 'latest' }))
    worker.emitMessage(makeSuccessPayload(firstId, { stateKey: 'old' }))

    await assert.rejects(first, /Stale preview worker response/)
    const secondResult = await second
    assert.equal(secondResult.stateKey, 'latest')
})

test('Preview client times out pending requests', async () => {
    const worker = new FakeWorker()
    const client = createPreviewWorkerClient({
        workerFactory: () => worker,
        defaultTimeoutMs: 25
    })

    await assert.rejects(
        client.preparePreviewInWorker({
            snapshot: makeSnapshot(),
            media: makeMedia(),
            resolution: makeResolution()
        }),
        /Preview worker timed out/
    )
})
