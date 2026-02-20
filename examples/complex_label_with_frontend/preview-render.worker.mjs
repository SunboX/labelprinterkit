import QRCode from 'https://cdn.jsdelivr.net/npm/qrcode@1.5.1/+esm'
import {
    FEED_PAD_START,
    buildPreviewStateKey,
    buildRenderContext,
    computeRenderLength,
    computeTextSpan,
    normalizePreviewState,
    resolveTextMetrics
} from './preview-layout-shared.mjs'

const QR_CACHE_LIMIT = 64
const qrCanvasCache = new Map()

function createCanvas(width, height) {
    if (typeof OffscreenCanvas === 'undefined') {
        throw new Error('OffscreenCanvas is required for preview worker rendering')
    }
    return new OffscreenCanvas(width, height)
}

function getContext2d(canvas) {
    const ctx = canvas.getContext('2d')
    if (!ctx) {
        throw new Error('2D context is not available')
    }
    return ctx
}

function trimQrCacheIfNeeded() {
    if (qrCanvasCache.size <= QR_CACHE_LIMIT) {
        return
    }
    const firstKey = qrCanvasCache.keys().next().value
    if (firstKey != null) {
        qrCanvasCache.delete(firstKey)
    }
}

function getQrModule(modules, x, y) {
    if (typeof modules.get === 'function') {
        return Boolean(modules.get(x, y))
    }
    return Boolean(modules.data[y * modules.size + x])
}

function buildQrCanvas(data, size) {
    const cacheKey = `${data || ''}::${size}`
    if (qrCanvasCache.has(cacheKey)) {
        return qrCanvasCache.get(cacheKey)
    }
    if (typeof QRCode?.create !== 'function') {
        throw new Error('QR matrix API is unavailable in this environment')
    }

    const created = QRCode.create(data || '', { errorCorrectionLevel: 'M' })
    const modules = created?.modules
    if (!modules || !Number.isInteger(modules.size) || !modules.data) {
        throw new Error('Failed to build QR matrix')
    }

    const matrixCanvas = createCanvas(modules.size, modules.size)
    const matrixCtx = getContext2d(matrixCanvas)
    matrixCtx.fillStyle = '#fff'
    matrixCtx.fillRect(0, 0, modules.size, modules.size)
    matrixCtx.fillStyle = '#000'
    for (let y = 0; y < modules.size; y += 1) {
        for (let x = 0; x < modules.size; x += 1) {
            if (getQrModule(modules, x, y)) {
                matrixCtx.fillRect(x, y, 1, 1)
            }
        }
    }

    const qrCanvas = createCanvas(size, size)
    const qrCtx = getContext2d(qrCanvas)
    qrCtx.fillStyle = '#fff'
    qrCtx.fillRect(0, 0, size, size)
    qrCtx.imageSmoothingEnabled = false
    qrCtx.drawImage(matrixCanvas, 0, 0, size, size)

    qrCanvasCache.set(cacheKey, qrCanvas)
    trimQrCacheIfNeeded()
    return qrCanvas
}

function rotateForPrint(canvas) {
    const rotated = createCanvas(canvas.height, canvas.width)
    const ctx = getContext2d(rotated)
    ctx.translate(rotated.width, 0)
    ctx.rotate(Math.PI / 2)
    ctx.drawImage(canvas, 0, 0)
    return rotated
}

function renderFromSnapshot(snapshot, media, resolution) {
    const normalized = normalizePreviewState(snapshot)
    const stateKey = buildPreviewStateKey(normalized)
    const context = buildRenderContext(normalized, media, resolution)

    const measureCanvas = createCanvas(1, 1)
    const measureCtx = getContext2d(measureCanvas)
    const blocks = []

    for (const item of normalized.items) {
        if (item.type === 'text') {
            const requestedSizeDots = Math.round(item.fontSize * context.dotScale)
            const metrics = resolveTextMetrics(item.text, item.fontFamily, requestedSizeDots, context.maxFontDots, measureCtx)
            const span = computeTextSpan({
                isHorizontal: context.isHorizontal,
                textWidth: metrics.width,
                textHeight: metrics.height,
                xOffset: item.xOffset,
                yOffset: item.yOffset
            })
            blocks.push({
                item,
                span,
                text: {
                    fontSizeDots: metrics.size,
                    family: item.fontFamily,
                    ascent: metrics.ascent,
                    descent: metrics.descent
                }
            })
            continue
        }

        const qrCanvas = buildQrCanvas(item.data, item.size)
        const span = Math.max(item.height, item.size)
        blocks.push({ item, span, qrCanvas })
    }

    const length = computeRenderLength(blocks, context)
    const previewCanvas = createCanvas(context.isHorizontal ? length : context.printWidth, context.isHorizontal ? context.printWidth : length)
    const previewCtx = getContext2d(previewCanvas)
    previewCtx.fillStyle = '#fff'
    previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height)
    previewCtx.fillStyle = '#000'

    if (context.isHorizontal) {
        let x = FEED_PAD_START
        for (const block of blocks) {
            const { item } = block
            const yAdjust = item.yOffset || 0
            if (item.type === 'text') {
                const text = block.text
                const resolvedSize = text.fontSizeDots || Math.min(Math.max(8, Math.round(item.fontSize * context.dotScale)), context.maxFontDots)
                previewCtx.font = `${resolvedSize}px ${text.family || item.fontFamily || 'sans-serif'}`
                previewCtx.textBaseline = 'alphabetic'
                const blockHeight = (text.ascent || resolvedSize) + (text.descent || 0)
                const baselineY = (previewCanvas.height - blockHeight) / 2 + (text.ascent || resolvedSize) + yAdjust
                previewCtx.fillText(item.text || '', (item.xOffset || 0) + x, baselineY)
            } else {
                const qrY = Math.max(0, (previewCanvas.height - item.size) / 2 + yAdjust)
                previewCtx.drawImage(block.qrCanvas, (item.xOffset || 0) + x, qrY, item.size, item.size)
            }
            x += block.span
        }
    } else {
        let y = FEED_PAD_START
        for (const block of blocks) {
            const { item } = block
            const yAdjust = item.yOffset || 0
            if (item.type === 'text') {
                const text = block.text
                const resolvedSize = text.fontSizeDots || Math.min(Math.max(8, Math.round(item.fontSize * context.dotScale)), context.maxFontDots)
                previewCtx.font = `${resolvedSize}px ${text.family || item.fontFamily || 'sans-serif'}`
                previewCtx.textBaseline = 'alphabetic'
                const blockHeight = (text.ascent || resolvedSize) + (text.descent || 0)
                const baselineY = y + (block.span - blockHeight) / 2 + (text.ascent || resolvedSize) + yAdjust
                previewCtx.fillText(item.text || '', item.xOffset || 0, baselineY)
            } else {
                const qrY = y + Math.max(0, (block.span - item.size) / 2 + yAdjust)
                previewCtx.drawImage(block.qrCanvas, item.xOffset || 0, qrY, item.size, item.size)
            }
            y += block.span
        }
    }

    const printCanvas = context.isHorizontal ? previewCanvas : rotateForPrint(previewCanvas)
    const printCtx = getContext2d(printCanvas)
    const printImageData = printCtx.getImageData(0, 0, printCanvas.width, printCanvas.height)
    const printRgba = printImageData.data
    const previewBitmap = previewCanvas.transferToImageBitmap()

    return {
        stateKey,
        previewBitmap,
        width: previewCanvas.width,
        height: previewCanvas.height,
        printWidth: printCanvas.width,
        printHeight: printCanvas.height,
        printRgbaBuffer: printRgba.buffer,
        printRgbaByteOffset: printRgba.byteOffset,
        printRgbaByteLength: printRgba.byteLength,
        resolutionDotsX: context.resolutionDotsX,
        printableWidth: context.printWidth,
        marginStart: context.marginStart,
        marginEnd: context.marginEnd,
        isHorizontal: context.isHorizontal
    }
}

self.addEventListener('message', (event) => {
    const { requestId, snapshot, media, resolution } = event.data || {}

    try {
        if (typeof requestId !== 'number') {
            throw new Error('Missing requestId')
        }
        const rendered = renderFromSnapshot(snapshot, media, resolution)

        self.postMessage(
            {
                requestId,
                ok: true,
                ...rendered
            },
            [rendered.previewBitmap, rendered.printRgbaBuffer]
        )
    } catch (err) {
        self.postMessage({
            requestId,
            ok: false,
            error: err?.message || String(err)
        })
    }
})
