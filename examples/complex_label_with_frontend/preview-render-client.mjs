const DEFAULT_TIMEOUT_MS = 15000

function makeDefaultWorker() {
    return new Worker(new URL('./preview-render.worker.mjs', import.meta.url), { type: 'module' })
}

function toError(value, fallbackMessage) {
    if (value instanceof Error) {
        return value
    }
    if (typeof value === 'string') {
        return new Error(value)
    }
    return new Error(fallbackMessage)
}

export function createPreviewWorkerClient({ workerFactory = makeDefaultWorker, defaultTimeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    let sharedWorker = null
    let nextRequestId = 1
    let newestIssuedRequestId = 0
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

    function handleWorkerFailure(error) {
        if (sharedWorker) {
            sharedWorker.terminate()
            sharedWorker = null
        }
        rejectAllPending(toError(error, 'Preview worker failed'))
    }

    function handleWorkerMessage(event) {
        const data = event.data || {}
        const entry = clearPendingEntry(data.requestId)
        if (!entry) {
            return
        }
        if (data.requestId < newestIssuedRequestId) {
            entry.reject(new Error('Stale preview worker response'))
            return
        }
        if (!data.ok) {
            entry.reject(new Error(data.error || 'Preview worker failed'))
            return
        }
        if (!(data.printRgbaBuffer instanceof ArrayBuffer)) {
            entry.reject(new Error('Preview worker did not return print RGBA buffer'))
            return
        }

        const printRgba = new Uint8ClampedArray(data.printRgbaBuffer, data.printRgbaByteOffset || 0, data.printRgbaByteLength || 0)
        entry.resolve({
            stateKey: data.stateKey,
            previewBitmap: data.previewBitmap,
            width: data.width,
            height: data.height,
            printWidth: data.printWidth,
            printHeight: data.printHeight,
            printRgba,
            resolutionDotsX: data.resolutionDotsX,
            printableWidth: data.printableWidth,
            marginStart: data.marginStart,
            marginEnd: data.marginEnd,
            isHorizontal: data.isHorizontal
        })
    }

    function getWorker() {
        if (sharedWorker) {
            return sharedWorker
        }
        sharedWorker = workerFactory()
        if (!sharedWorker || typeof sharedWorker.addEventListener !== 'function' || typeof sharedWorker.postMessage !== 'function') {
            throw new Error('workerFactory must return a Worker-like object')
        }
        sharedWorker.addEventListener('message', handleWorkerMessage)
        sharedWorker.addEventListener('error', (event) => {
            handleWorkerFailure(event?.error || event?.message || 'Preview worker crashed')
        })
        sharedWorker.addEventListener('messageerror', () => {
            handleWorkerFailure(new Error('Preview worker sent an unreadable message'))
        })
        return sharedWorker
    }

    function warmPreviewWorker() {
        getWorker()
    }

    function preparePreviewInWorker({ snapshot, media, resolution, timeoutMs = defaultTimeoutMs } = {}) {
        if (!snapshot || !media || !resolution) {
            return Promise.reject(new Error('snapshot, media, and resolution are required'))
        }

        const worker = getWorker()
        const requestId = nextRequestId
        nextRequestId += 1
        newestIssuedRequestId = requestId

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                clearPendingEntry(requestId)
                reject(new Error(`Preview worker timed out after ${timeoutMs}ms`))
            }, timeoutMs)

            pending.set(requestId, { resolve, reject, timeout })
            try {
                worker.postMessage({ requestId, snapshot, media, resolution })
            } catch (error) {
                clearPendingEntry(requestId)
                reject(toError(error, 'Failed to post preview message to worker'))
            }
        })
    }

    return {
        warmPreviewWorker,
        preparePreviewInWorker
    }
}

const previewClient = createPreviewWorkerClient()

export const warmPreviewWorker = previewClient.warmPreviewWorker
export const preparePreviewInWorker = previewClient.preparePreviewInWorker
