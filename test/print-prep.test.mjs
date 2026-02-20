import test from 'node:test'
import assert from 'node:assert/strict'

import { encodeLine } from '../src/printers.mjs'
import { bytesPerLine, imageDataToBitmap } from '../src/page.mjs'
import { prepareEncodedPageFromImageData } from '../src/print-prep.mjs'

function makeImageData(width, height) {
    const data = new Uint8ClampedArray(width * height * 4)
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const index = (y * width + x) * 4
            const isBlack = (x + y) % 2 === 0
            const value = isBlack ? 0 : 255
            data[index] = value
            data[index + 1] = value
            data[index + 2] = value
            data[index + 3] = 255
        }
    }
    return { width, height, data }
}

test('prepareEncodedPageFromImageData matches imageDataToBitmap and encodeLine output', () => {
    const imageData = makeImageData(16, 8)
    const leftPadding = 3
    const prepared = prepareEncodedPageFromImageData(imageData, { leftPadding })
    const expected = imageDataToBitmap(imageData)

    assert.equal(prepared.width, expected.width)
    assert.equal(prepared.length, expected.length)
    assert.deepEqual(prepared.bitmap, expected.bitmap)

    const lineBytes = bytesPerLine(prepared.width)
    const expectedEncodedLines = []
    for (let y = 0; y < prepared.length; y += 1) {
        const start = y * lineBytes
        expectedEncodedLines.push(encodeLine(prepared.bitmap.subarray(start, start + lineBytes), leftPadding))
    }
    assert.equal(prepared.encodedLines.length, expectedEncodedLines.length)
    prepared.encodedLines.forEach((line, index) => {
        assert.deepEqual(line, expectedEncodedLines[index])
    })
})

test('prepareEncodedPageFromImageData validates padding', () => {
    const imageData = makeImageData(8, 8)
    assert.throws(() => prepareEncodedPageFromImageData(imageData, { leftPadding: -1 }), /leftPadding must be a non-negative integer/)
})
