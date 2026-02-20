const DEFAULT_TIMEOUT_MS = 15000

let sharedWorker = null
let nextRequestId = 1
const pending = new Map()

function clearPendingEntry(requestId) {
    const entry = pending.get(requestId)
    if (!entry) {
        return null
    }
    clearTimeout(entry.timeout)
    pending.delete(requestId)
    return entry
}

function rejectAllPending(error) {
    for (const [requestId] of pending) {
        const entry = clearPendingEntry(requestId)
        entry?.reject(error)
    }
}

function handleWorkerMessage(event) {
    const { requestId, ok, error, bitmapBuffer, pageWidth, pageLength, encodedLineBuffers } = event.data || {}
    const entry = clearPendingEntry(requestId)
    if (!entry) {
        return
    }
    if (!ok) {
        entry.reject(new Error(error || 'Print prep worker failed'))
        return
    }
    const bitmap = new Uint8Array(bitmapBuffer)
    const encodedLines = (encodedLineBuffers || []).map((buffer) => new Uint8Array(buffer))
    entry.resolve({ bitmap, width: pageWidth, length: pageLength, encodedLines })
}

function handleWorkerFailure(error) {
    if (sharedWorker) {
        sharedWorker.terminate()
        sharedWorker = null
    }
    rejectAllPending(error instanceof Error ? error : new Error('Print prep worker failed'))
}

function getWorker() {
    if (sharedWorker) {
        return sharedWorker
    }
    if (typeof Worker === 'undefined') {
        throw new Error('Web Worker is not available in this environment')
    }

    sharedWorker = new Worker(new URL('./print-prep.worker.mjs', import.meta.url), { type: 'module' })
    sharedWorker.addEventListener('message', handleWorkerMessage)
    sharedWorker.addEventListener('error', (event) => {
        handleWorkerFailure(event?.error || new Error(event?.message || 'Print prep worker crashed'))
    })
    sharedWorker.addEventListener('messageerror', () => {
        handleWorkerFailure(new Error('Print prep worker sent an unreadable message'))
    })
    return sharedWorker
}

export function preparePrintDataInWorker({ imageData, leftPadding = 0, resolutionId = null, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    if (!imageData || typeof imageData.width !== 'number' || typeof imageData.height !== 'number' || !imageData.data) {
        return Promise.reject(new Error('imageData with width, height, and data is required'))
    }
    if (!Number.isInteger(leftPadding) || leftPadding < 0) {
        return Promise.reject(new Error('leftPadding must be a non-negative integer'))
    }

    const worker = getWorker()
    const requestId = nextRequestId
    nextRequestId += 1

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            clearPendingEntry(requestId)
            reject(new Error(`Print prep worker timed out after ${timeoutMs}ms`))
        }, timeoutMs)

        pending.set(requestId, { resolve, reject, timeout })

        const rgbaBuffer = imageData.data.buffer
        try {
            worker.postMessage(
                {
                    requestId,
                    rgbaBuffer,
                    rgbaByteOffset: imageData.data.byteOffset,
                    rgbaByteLength: imageData.data.byteLength,
                    width: imageData.width,
                    height: imageData.height,
                    leftPadding,
                    resolutionId
                },
                [rgbaBuffer]
            )
        } catch (error) {
            clearPendingEntry(requestId)
            reject(error instanceof Error ? error : new Error(String(error)))
        }
    })
}
