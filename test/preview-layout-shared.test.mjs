import test from 'node:test'
import assert from 'node:assert/strict'

import {
    FEED_PAD_END,
    FEED_PAD_START,
    buildPreviewStateKey,
    buildRenderContext,
    computeRenderLength,
    computeTextSpan,
    normalizePreviewState
} from '../examples/complex_label_with_frontend/preview-layout-shared.mjs'

test('normalizePreviewState strips runtime caches and keeps deterministic fields', () => {
    const normalized = normalizePreviewState({
        media: 'W12',
        mediaLengthMm: '40',
        resolution: 'LOW',
        orientation: 'vertical',
        items: [
            {
                id: 'a',
                type: 'text',
                text: 'hello',
                fontFamily: 'Inter',
                fontSize: 24,
                height: 40,
                xOffset: 2,
                yOffset: -1,
                _qrCache: { ignored: true }
            },
            {
                id: 'b',
                type: 'qr',
                data: 'https://example.com',
                size: 128,
                height: 140,
                xOffset: 4,
                yOffset: 0,
                _qrCache: { ignored: true }
            }
        ]
    })

    assert.equal(normalized.media, 'W12')
    assert.equal(normalized.mediaLengthMm, 40)
    assert.equal(normalized.orientation, 'vertical')
    assert.equal(normalized.items.length, 2)
    assert.deepEqual(Object.keys(normalized.items[1]).sort(), ['data', 'height', 'id', 'size', 'type', 'xOffset', 'yOffset'])
})

test('buildPreviewStateKey is deterministic for equal snapshots', () => {
    const first = normalizePreviewState({
        media: 'W9',
        resolution: 'LOW',
        orientation: 'horizontal',
        items: [{ id: 't1', type: 'text', text: 'A' }]
    })
    const second = normalizePreviewState({
        media: 'W9',
        resolution: 'LOW',
        orientation: 'horizontal',
        items: [{ id: 't1', type: 'text', text: 'A' }]
    })

    assert.equal(buildPreviewStateKey(first), buildPreviewStateKey(second))
})

test('render context + spans compute expected canvas length', () => {
    const snapshot = normalizePreviewState({
        media: 'W9',
        resolution: 'LOW',
        orientation: 'horizontal',
        items: [
            { id: 'a', type: 'text', text: 'A', fontSize: 12, height: 20, xOffset: 2, yOffset: 0 },
            { id: 'b', type: 'qr', data: 'x', size: 24, height: 24, xOffset: 0, yOffset: 0 }
        ]
    })
    const context = buildRenderContext(snapshot, { printArea: 64, lmargin: 1, rmargin: 2 }, { minLength: 31, dots: [180, 180] })
    const textSpan = computeTextSpan({ isHorizontal: true, textWidth: 12, textHeight: 10, xOffset: 2, yOffset: 0 })
    const qrSpan = Math.max(24, 24)
    const length = computeRenderLength([{ span: textSpan }, { span: qrSpan }], context)

    assert.equal(length, Math.max(31, FEED_PAD_START + FEED_PAD_END + textSpan + qrSpan))
})
