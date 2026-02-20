export const FEED_PAD_START = 2
export const FEED_PAD_END = 8

function toFiniteNumber(value, fallback = 0) {
    const number = Number(value)
    return Number.isFinite(number) ? number : fallback
}

function normalizeTextItem(item) {
    return {
        id: typeof item?.id === 'string' ? item.id : '',
        type: 'text',
        text: typeof item?.text === 'string' ? item.text : '',
        fontFamily: typeof item?.fontFamily === 'string' && item.fontFamily.trim() ? item.fontFamily : 'sans-serif',
        fontSize: Math.max(4, toFiniteNumber(item?.fontSize, 16)),
        height: Math.max(4, toFiniteNumber(item?.height, 40)),
        xOffset: toFiniteNumber(item?.xOffset, 0),
        yOffset: toFiniteNumber(item?.yOffset, 0)
    }
}

function normalizeQrItem(item) {
    return {
        id: typeof item?.id === 'string' ? item.id : '',
        type: 'qr',
        data: typeof item?.data === 'string' ? item.data : '',
        size: Math.max(16, toFiniteNumber(item?.size, 120)),
        height: Math.max(16, toFiniteNumber(item?.height, 130)),
        xOffset: toFiniteNumber(item?.xOffset, 0),
        yOffset: toFiniteNumber(item?.yOffset, 0)
    }
}

export function normalizePreviewState(state = {}) {
    const mediaLength = state?.mediaLengthMm
    const normalizedLength = mediaLength == null || mediaLength === '' ? null : toFiniteNumber(mediaLength, null)

    return {
        media: typeof state?.media === 'string' && state.media ? state.media : 'W24',
        mediaLengthMm: normalizedLength == null || !Number.isFinite(normalizedLength) ? null : Math.max(0, normalizedLength),
        resolution: typeof state?.resolution === 'string' && state.resolution ? state.resolution : 'LOW',
        orientation: state?.orientation === 'vertical' ? 'vertical' : 'horizontal',
        items: (state?.items || []).map((item) => (item?.type === 'qr' ? normalizeQrItem(item) : normalizeTextItem(item)))
    }
}

export function buildPreviewStateKey(snapshot) {
    return JSON.stringify(snapshot)
}

export function buildRenderContext(snapshot, media, resolution) {
    const printWidth = Math.max(1, Math.floor(toFiniteNumber(media?.printArea, 128)))
    const marginStart = Math.max(0, Math.floor(toFiniteNumber(media?.lmargin, 0)))
    const marginEnd = Math.max(0, Math.floor(toFiniteNumber(media?.rmargin, 0)))
    const minLength = Math.max(1, Math.floor(toFiniteNumber(resolution?.minLength, 31)))
    const dotsY = toFiniteNumber(resolution?.dots?.[1], 180)
    const dotScale = dotsY / 96
    const isHorizontal = snapshot.orientation === 'horizontal'
    const maxFontDots = Math.max(8, printWidth)

    const forcedLengthDots =
        snapshot.mediaLengthMm != null ? Math.max(minLength, Math.round((snapshot.mediaLengthMm / 25.4) * dotsY)) : null

    return {
        printWidth,
        marginStart,
        marginEnd,
        minLength,
        dotScale,
        isHorizontal,
        maxFontDots,
        forcedLengthDots,
        resolutionDotsX: toFiniteNumber(resolution?.dots?.[0], 180),
        resolutionDotsY: dotsY
    }
}

export function measureTextMetrics(ctx, text, size, family) {
    ctx.font = `${size}px ${family}`
    const metrics = ctx.measureText(text || '')
    const ascent = metrics.actualBoundingBoxAscent || size
    const descent = metrics.actualBoundingBoxDescent || 0
    const width = Math.ceil(metrics.width)
    const height = Math.ceil(ascent + descent)
    return { width, height, ascent, descent }
}

export function resolveTextMetrics(text, family, requestedSize, maxHeight, ctx) {
    const limit = Math.max(4, maxHeight)
    let size = Math.min(Math.max(4, requestedSize), limit * 3)
    let { width, height } = measureTextMetrics(ctx, text, size, family)

    while (height > limit && size > 4) {
        size -= 1
        ;({ width, height } = measureTextMetrics(ctx, text, size, family))
    }

    const { ascent, descent } = measureTextMetrics(ctx, text, size, family)
    return { size, width, height: Math.min(height, limit), ascent, descent }
}

export function computeTextSpan({ isHorizontal, textWidth, textHeight, xOffset = 0, yOffset = 0 }) {
    if (isHorizontal) {
        return Math.max(textWidth + xOffset, textHeight)
    }
    return Math.max(textHeight + Math.abs(yOffset) * 2 + 4, textHeight)
}

export function computeRenderLength(blocks, context) {
    const totalLength = FEED_PAD_START + blocks.reduce((sum, block) => sum + block.span, 0) + FEED_PAD_END
    if (context.forcedLengthDots != null) {
        return Math.max(context.forcedLengthDots, totalLength)
    }
    return Math.max(totalLength, context.minLength)
}
