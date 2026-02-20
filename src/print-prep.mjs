import { bytesPerLine, imageDataToBitmap } from './page.mjs'
import { encodeLine } from './printers.mjs'

function validateImageDataLike(imageData) {
    if (!imageData || typeof imageData.width !== 'number' || typeof imageData.height !== 'number' || !imageData.data) {
        throw new Error('prepareEncodedPageFromImageData requires an object with width, height, and data')
    }
}

export function prepareEncodedPageFromImageData(imageData, { leftPadding = 0 } = {}) {
    validateImageDataLike(imageData)
    if (!Number.isInteger(leftPadding) || leftPadding < 0) {
        throw new Error('leftPadding must be a non-negative integer')
    }

    const { bitmap, width, length } = imageDataToBitmap(imageData)
    const lineBytes = bytesPerLine(width)
    const encodedLines = new Array(length)

    for (let y = 0; y < length; y += 1) {
        const start = y * lineBytes
        const line = bitmap.subarray(start, start + lineBytes)
        encodedLines[y] = encodeLine(line, leftPadding)
    }

    return { bitmap, width, length, encodedLines }
}
