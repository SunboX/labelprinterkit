import { prepareEncodedPageFromImageData } from '../../src/print-prep.mjs'

self.addEventListener('message', (event) => {
    const { requestId, rgbaBuffer, rgbaByteOffset = 0, rgbaByteLength = 0, width, height, leftPadding = 0 } = event.data || {}

    try {
        if (typeof requestId !== 'number') {
            throw new Error('Missing requestId')
        }
        if (!(rgbaBuffer instanceof ArrayBuffer)) {
            throw new Error('rgbaBuffer must be an ArrayBuffer')
        }
        if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
            throw new Error('width/height must be positive integers')
        }
        const data = new Uint8ClampedArray(rgbaBuffer, rgbaByteOffset, rgbaByteLength || width * height * 4)
        const { bitmap, width: pageWidth, length: pageLength, encodedLines } = prepareEncodedPageFromImageData(
            { width, height, data },
            { leftPadding }
        )
        const encodedLineBuffers = encodedLines.map((line) => line.buffer)

        self.postMessage(
            {
                requestId,
                ok: true,
                bitmapBuffer: bitmap.buffer,
                pageWidth,
                pageLength,
                encodedLineBuffers
            },
            [bitmap.buffer, ...encodedLineBuffers]
        )
    } catch (err) {
        self.postMessage({
            requestId,
            ok: false,
            error: err?.message || String(err)
        })
    }
})
