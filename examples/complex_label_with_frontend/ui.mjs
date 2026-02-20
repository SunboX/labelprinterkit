import QRCode from 'https://cdn.jsdelivr.net/npm/qrcode@1.5.1/+esm'
import {
    Label,
    Page,
    Job,
    Media,
    Resolution,
    P700,
    P750W,
    E500,
    E550W,
    H500,
    WebUSBBackend,
    WebBluetoothBackend
} from '../../src/index.mjs'
import { preparePrintDataInWorker, warmPrintPrepWorker } from './print-prep-client.mjs'
import { preparePreviewInWorker, warmPreviewWorker } from './preview-render-client.mjs'
import {
    FEED_PAD_START,
    buildPreviewStateKey,
    buildRenderContext,
    computeRenderLength,
    computeTextSpan,
    normalizePreviewState,
    resolveTextMetrics
} from './preview-layout-shared.mjs'

const els = {
    items: document.querySelector('[data-items]'),
    addText: document.querySelector('[data-add-text]'),
    addQr: document.querySelector('[data-add-qr]'),
    print: document.querySelector('[data-print]'),
    status: document.querySelector('[data-status]'),
    mode: document.querySelector('[data-mode]'),
    media: document.querySelector('[data-media]'),
    orientation: document.querySelector('[data-orientation]'),
    resolution: document.querySelector('[data-resolution]'),
    mediaLength: document.querySelector('[data-media-length]'),
    printer: document.querySelector('[data-printer]'),
    preview: document.querySelector('[data-preview]'),
    dimensions: document.querySelector('[data-dimensions]'),
    bleFields: document.querySelector('.ble-fields'),
    bleService: document.querySelector('[data-ble-service]'),
    bleWrite: document.querySelector('[data-ble-write]'),
    bleNotify: document.querySelector('[data-ble-notify]'),
    bleFilter: document.querySelector('[data-ble-filter]')
}

const printerMap = { P700, P750W, E500, E550W, H500 }

let idCounter = 1
const nextId = () => `item-${idCounter++}`

const defaultState = {
    media: 'W9',
    mediaLengthMm: null,
    resolution: 'LOW',
    orientation: 'horizontal',
    backend: 'usb',
    printer: 'P700',
    ble: {
        serviceUuid: '0000xxxx-0000-1000-8000-00805f9b34fb',
        writeCharacteristicUuid: '0000yyyy-0000-1000-8000-00805f9b34fb',
        notifyCharacteristicUuid: '0000zzzz-0000-1000-8000-00805f9b34fb',
        namePrefix: 'PT-'
    },
    items: [{ id: nextId(), type: 'text', text: 'Network Port', fontFamily: 'Inter', fontSize: 32, height: 46, xOffset: 4, yOffset: 0 }]
}

let state = JSON.parse(JSON.stringify(defaultState))
const PREVIEW_IDLE_TIMEOUT_MS = 120
let previewWorkerUnavailable = false
let latestPreviewPayload = null
const mainThreadQrCache = new Map()

function setStatus(text, type = 'info') {
    els.status.textContent = text
    els.status.dataset.type = type
}

function populateSelects() {
    Object.values(Media)
        .filter((m) => m.id && m.id.startsWith('W'))
        .forEach((media) => {
            const opt = document.createElement('option')
            opt.value = media.id
            opt.textContent = `${media.id} (${media.width}mm, area ${media.printArea} dots)`
            if (media.id === state.media) opt.selected = true
            els.media.appendChild(opt)
        })

    Object.values(Resolution).forEach((res) => {
        const opt = document.createElement('option')
        opt.value = res.id
        opt.textContent = `${res.id} (${res.dots[0]}x${res.dots[1]} dpi)`
        if (res.id === state.resolution) opt.selected = true
        els.resolution.appendChild(opt)
    })

    if (state.mediaLengthMm) {
        els.mediaLength.value = state.mediaLengthMm
    }
    els.orientation.value = state.orientation
}

function slider(label, value, min, max, step = 1, onInput) {
    const wrap = document.createElement('div')
    wrap.className = 'slider'
    const top = document.createElement('div')
    top.className = 'small'
    top.textContent = `${label}: ${value}`
    const input = document.createElement('input')
    input.type = 'range'
    input.min = min
    input.max = max
    input.step = step
    input.value = value
    input.addEventListener('input', (e) => {
        const v = Number(e.target.value)
        top.textContent = `${label}: ${v}`
        onInput(v)
    })
    wrap.append(top, input)
    return wrap
}

function renderItemsList() {
    els.items.innerHTML = ''
    const sizeLabel = state.orientation === 'horizontal' ? 'Length' : 'Height'
    state.items.forEach((item, index) => {
        const card = document.createElement('div')
        card.className = 'item-card'
        card.draggable = false
        card.dataset.index = index.toString()

        const meta = document.createElement('div')
        meta.className = 'item-meta'
        const tag = document.createElement('div')
        tag.className = 'tag'
        tag.textContent = item.type === 'text' ? 'Text' : 'QR'
        const handle = document.createElement('div')
        handle.className = 'handle'
        handle.textContent = '⇅ drag'
        handle.draggable = true
        handle.dataset.index = index.toString()
        meta.append(tag, handle)

        const contentWrap = document.createElement('div')
        contentWrap.className = 'field'
        const label = document.createElement('label')
        label.textContent = item.type === 'text' ? 'Text' : 'QR content'
        const input = item.type === 'text' ? document.createElement('textarea') : document.createElement('input')
        input.value = item.type === 'text' ? item.text : item.data
        input.rows = 2
        input.addEventListener('input', (e) => {
            if (item.type === 'text') {
                item.text = e.target.value
            } else {
                item.data = e.target.value
            }
            requestPreviewRender('idle')
        })
        contentWrap.append(label, input)

        const controls = document.createElement('div')
        controls.className = 'controls'

        if (item.type !== 'text') {
            const heightCtrl = slider(sizeLabel, item.height, 20, 280, 1, (v) => {
                item.height = v
                requestPreviewRender('idle')
            })
            controls.appendChild(heightCtrl)
        }

        const offsetCtrl = slider('X offset', item.xOffset ?? 0, 0, 50, 1, (v) => {
            item.xOffset = v
            requestPreviewRender('idle')
        })
        controls.appendChild(offsetCtrl)

        const yOffsetCtrl = slider('Y offset', item.yOffset ?? 0, -50, 50, 1, (v) => {
            item.yOffset = v
            requestPreviewRender('idle')
        })
        controls.appendChild(yOffsetCtrl)

        if (item.type === 'text') {
            const fontCtrl = document.createElement('div')
            fontCtrl.className = 'field'
            const fontLabel = document.createElement('label')
            fontLabel.textContent = 'Font family'
            const fontInput = document.createElement('input')
            fontInput.value = item.fontFamily
            fontInput.addEventListener('input', (e) => {
                item.fontFamily = e.target.value
                requestPreviewRender('idle')
            })
            fontCtrl.append(fontLabel, fontInput)

            const sizeCtrl = slider('Font size', item.fontSize, 10, 64, 1, (v) => {
                item.fontSize = v
                requestPreviewRender('idle')
            })

            controls.append(fontCtrl, sizeCtrl)
        } else {
            const sizeCtrl = slider('QR size', item.size, 60, 240, 4, async (v) => {
                item.size = v
                requestPreviewRender('idle')
            })
            controls.append(sizeCtrl)
        }

        const remove = document.createElement('button')
        remove.textContent = 'Remove'
        remove.addEventListener('click', () => {
            state.items.splice(index, 1)
            renderItemsList()
            requestPreviewRender('urgent')
        })

        card.append(meta, contentWrap, controls, remove)
        card.querySelectorAll('input, textarea, select').forEach((el) =>
            el.addEventListener('dragstart', (ev) => {
                ev.stopPropagation()
                ev.preventDefault()
            })
        )
        els.items.appendChild(card)
    })
}

function addTextItem() {
    state.items.push({
        id: nextId(),
        type: 'text',
        text: 'New text',
        fontFamily: 'Inter',
        fontSize: 24,
        height: 40,
        xOffset: 4
    })
    renderItemsList()
    requestPreviewRender('urgent')
}

function addQrItem() {
    state.items.push({
        id: nextId(),
        type: 'qr',
        data: 'https://example.com',
        size: 120,
        height: 130,
        xOffset: 4
    })
    renderItemsList()
    requestPreviewRender('urgent')
}

function bindDrag() {
    let fromIndex = null
    els.items.addEventListener('dragstart', (e) => {
        const handle = e.target.closest('.handle')
        if (!handle) return
        const card = handle.closest('.item-card')
        if (!card) return
        fromIndex = Number(card.dataset.index)
        e.dataTransfer.effectAllowed = 'move'
    })
    els.items.addEventListener('dragover', (e) => {
        if (fromIndex === null) return
        e.preventDefault()
    })
    els.items.addEventListener('drop', (e) => {
        e.preventDefault()
        const card = e.target.closest('.item-card')
        if (!card || fromIndex === null) return
        const toIndex = Number(card.dataset.index)
        if (toIndex === fromIndex) {
            fromIndex = null
            return
        }
        const [moved] = state.items.splice(fromIndex, 1)
        state.items.splice(toIndex, 0, moved)
        fromIndex = null
        renderItemsList()
        requestPreviewRender('urgent')
    })
}

function resolveMediaAndResolution(snapshot) {
    const media = Media[snapshot.media] || Media.W24
    const res = Resolution[snapshot.resolution] || Resolution.LOW
    return { media, res }
}

async function getMainThreadQrCanvas(data, size) {
    const key = `${data || ''}::${size}`
    if (mainThreadQrCache.has(key)) {
        return mainThreadQrCache.get(key)
    }
    const canvas = document.createElement('canvas')
    await QRCode.toCanvas(canvas, data || '', { errorCorrectionLevel: 'M', margin: 0, width: size })
    mainThreadQrCache.set(key, canvas)
    if (mainThreadQrCache.size > 64) {
        const oldestKey = mainThreadQrCache.keys().next().value
        if (oldestKey != null) {
            mainThreadQrCache.delete(oldestKey)
        }
    }
    return canvas
}

function rotateForPrint(canvas) {
    const rotated = document.createElement('canvas')
    rotated.width = canvas.height
    rotated.height = canvas.width
    const ctx = rotated.getContext('2d')
    if (!ctx) {
        throw new Error('2D canvas context is not available')
    }
    // Rotate so the canvas height matches the print head width expected by Label/Job.
    ctx.translate(rotated.width, 0)
    ctx.rotate(Math.PI / 2)
    ctx.drawImage(canvas, 0, 0)
    return rotated
}

async function buildCanvasFromSnapshot(snapshot) {
    const { media, res } = resolveMediaAndResolution(snapshot)
    const context = buildRenderContext(snapshot, media, res)
    const measureCtx = document.createElement('canvas').getContext('2d')
    if (!measureCtx) {
        throw new Error('2D canvas context is not available')
    }

    const blocks = []
    for (const item of snapshot.items) {
        if (item.type === 'text') {
            const requestedSizeDots = Math.round(item.fontSize * context.dotScale)
            const metrics = resolveTextMetrics(item.text || '', item.fontFamily || 'sans-serif', requestedSizeDots, context.maxFontDots, measureCtx)
            const span = computeTextSpan({
                isHorizontal: context.isHorizontal,
                textWidth: metrics.width,
                textHeight: metrics.height,
                xOffset: item.xOffset || 0,
                yOffset: item.yOffset || 0
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

        const qrCanvas = await getMainThreadQrCanvas(item.data, item.size)
        blocks.push({ item, span: Math.max(item.height, item.size), qrCanvas })
    }

    const length = computeRenderLength(blocks, context)
    const preview = document.createElement('canvas')
    preview.width = context.isHorizontal ? length : context.printWidth
    preview.height = context.isHorizontal ? context.printWidth : length
    const ctx = preview.getContext('2d')
    if (!ctx) {
        throw new Error('2D canvas context is not available')
    }
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, preview.width, preview.height)
    ctx.fillStyle = '#000'

    if (context.isHorizontal) {
        let x = FEED_PAD_START
        for (const block of blocks) {
            const { item } = block
            const yAdjust = item.yOffset || 0
            if (item.type === 'text') {
                const text = block.text
                const resolvedSize =
                    text.fontSizeDots || Math.min(Math.max(8, Math.round(item.fontSize * context.dotScale)), context.maxFontDots)
                ctx.font = `${resolvedSize}px ${text.family || item.fontFamily || 'sans-serif'}`
                ctx.textBaseline = 'alphabetic'
                const blockH = (text.ascent || resolvedSize) + (text.descent || 0)
                const baselineY = (preview.height - blockH) / 2 + (text.ascent || resolvedSize) + yAdjust
                ctx.fillText(item.text || '', (item.xOffset || 0) + x, baselineY)
            } else {
                const qrY = Math.max(0, (preview.height - item.size) / 2 + yAdjust)
                ctx.drawImage(block.qrCanvas, (item.xOffset || 0) + x, qrY, item.size, item.size)
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
                const resolvedSize =
                    text.fontSizeDots || Math.min(Math.max(8, Math.round(item.fontSize * context.dotScale)), context.maxFontDots)
                ctx.font = `${resolvedSize}px ${text.family || item.fontFamily || 'sans-serif'}`
                ctx.textBaseline = 'alphabetic'
                const blockH = (text.ascent || resolvedSize) + (text.descent || 0)
                const baselineY = y + (block.span - blockH) / 2 + (text.ascent || resolvedSize) + yAdjust
                ctx.fillText(item.text || '', item.xOffset || 0, baselineY)
            } else {
                const qrY = y + Math.max(0, (block.span - item.size) / 2 + yAdjust)
                ctx.drawImage(block.qrCanvas, item.xOffset || 0, qrY, item.size, item.size)
            }
            y += block.span
        }
    }

    const printCanvas = context.isHorizontal ? preview : rotateForPrint(preview)
    const effectiveMedia = { ...media, printArea: context.printWidth, lmargin: context.marginStart, rmargin: context.marginEnd }

    return {
        preview,
        printCanvas,
        width: preview.width,
        height: preview.height,
        res,
        printWidth: context.printWidth,
        marginStart: context.marginStart,
        marginEnd: context.marginEnd,
        isHorizontal: context.isHorizontal,
        media: effectiveMedia
    }
}

let previewBusy = false
let previewQueued = false
let cancelPendingPreview = null
let pendingPreviewPriority = null

function scheduleIdle(callback, { timeout = PREVIEW_IDLE_TIMEOUT_MS } = {}) {
    if (typeof requestIdleCallback === 'function') {
        const idleId = requestIdleCallback(callback, { timeout })
        return () => {
            if (typeof cancelIdleCallback === 'function') {
                cancelIdleCallback(idleId)
            }
        }
    }
    const timeoutId = setTimeout(() => callback({ didTimeout: true, timeRemaining: () => 0 }), 1)
    return () => clearTimeout(timeoutId)
}

function scheduleNextFrame(callback) {
    if (typeof requestAnimationFrame === 'function') {
        const frameId = requestAnimationFrame(() => callback())
        return () => cancelAnimationFrame(frameId)
    }
    const timeoutId = setTimeout(callback, 0)
    return () => clearTimeout(timeoutId)
}

function queuePreviewRender() {
    if (previewBusy) {
        previewQueued = true
        return
    }
    previewBusy = true
    previewQueued = false
    void runPreviewRender()
}

function requestPreviewRender(priority = 'urgent') {
    const normalizedPriority = priority === 'idle' ? 'idle' : 'urgent'
    if (cancelPendingPreview) {
        if (pendingPreviewPriority === 'urgent' || pendingPreviewPriority === normalizedPriority) {
            return
        }
        cancelPendingPreview()
        cancelPendingPreview = null
        pendingPreviewPriority = null
    }

    const execute = () => {
        cancelPendingPreview = null
        pendingPreviewPriority = null
        queuePreviewRender()
    }

    pendingPreviewPriority = normalizedPriority
    if (normalizedPriority === 'idle') {
        cancelPendingPreview = scheduleIdle(execute, { timeout: PREVIEW_IDLE_TIMEOUT_MS })
        return
    }
    cancelPendingPreview = scheduleNextFrame(execute)
}

async function runPreviewRender() {
    const snapshot = normalizePreviewState(state)
    const snapshotKey = buildPreviewStateKey(snapshot)
    try {
        const { media, res } = resolveMediaAndResolution(snapshot)
        let previewSource = null
        let width = 0
        let height = 0
        let resolutionDotsX = res?.dots?.[0] || 180
        let printWidth = media?.printArea || 128
        let marginStart = media?.lmargin || 0
        let marginEnd = media?.rmargin || 0
        let isHorizontal = snapshot.orientation === 'horizontal'
        let printRgba = null
        let printCanvasWidth = 0
        let printCanvasHeight = 0

        if (!previewWorkerUnavailable) {
            try {
                const rendered = await preparePreviewInWorker({ snapshot, media, resolution: res })
                if (buildPreviewStateKey(normalizePreviewState(state)) !== rendered.stateKey) {
                    rendered.previewBitmap?.close?.()
                    return
                }
                previewSource = rendered.previewBitmap
                width = rendered.width
                height = rendered.height
                resolutionDotsX = rendered.resolutionDotsX || resolutionDotsX
                printWidth = rendered.printableWidth
                marginStart = rendered.marginStart
                marginEnd = rendered.marginEnd
                isHorizontal = rendered.isHorizontal
                printRgba = new Uint8ClampedArray(rendered.printRgba)
                printCanvasWidth = rendered.printWidth
                printCanvasHeight = rendered.printHeight
            } catch (workerError) {
                previewWorkerUnavailable = true
                console.warn('Preview worker is unavailable. Falling back to main-thread preview rendering.', workerError)
            }
        }

        if (!previewSource) {
            const rendered = await buildCanvasFromSnapshot(snapshot)
            if (buildPreviewStateKey(normalizePreviewState(state)) !== snapshotKey) {
                return
            }
            previewSource = rendered.preview
            width = rendered.width
            height = rendered.height
            resolutionDotsX = rendered.res?.dots?.[0] || resolutionDotsX
            printWidth = rendered.printWidth
            marginStart = rendered.marginStart
            marginEnd = rendered.marginEnd
            isHorizontal = rendered.isHorizontal
            const printCtx = rendered.printCanvas.getContext('2d')
            if (!printCtx) {
                throw new Error('2D canvas context is not available')
            }
            const imageData = printCtx.getImageData(0, 0, rendered.printCanvas.width, rendered.printCanvas.height)
            printRgba = new Uint8ClampedArray(imageData.data)
            printCanvasWidth = rendered.printCanvas.width
            printCanvasHeight = rendered.printCanvas.height
        }

        const ctx = els.preview.getContext('2d')
        if (!ctx) {
            throw new Error('2D canvas context is not available')
        }
        els.preview.width = width
        els.preview.height = height
        const physicalScale = 96 / resolutionDotsX
        const uiZoom = 1.3 // zoom the preview for easier viewing
        const cssScale = physicalScale * uiZoom
        els.preview.style.width = `${Math.max(width * cssScale, 1)}px`
        els.preview.style.height = `${Math.max(height * cssScale, 1)}px`
        ctx.clearRect(0, 0, width, height)
        ctx.drawImage(previewSource, 0, 0)
        previewSource?.close?.()
        const orientationLabel = isHorizontal ? 'horizontal' : 'vertical'
        const printableLabel = `${printWidth} dot printable`
        const marginLabel = marginStart || marginEnd ? `• margins ${marginStart}/${marginEnd} dots` : ''
        els.dimensions.textContent = `${snapshot.media} • ${printableLabel} ${marginLabel} • ${orientationLabel}`
        latestPreviewPayload = {
            stateKey: snapshotKey,
            resolutionId: res.id,
            printWidth: printCanvasWidth,
            printHeight: printCanvasHeight,
            printRgba
        }
    } catch (err) {
        console.error(err)
        setStatus('Preview failed. Check your inputs.', 'error')
    } finally {
        previewBusy = false
        if (previewQueued) {
            previewQueued = false
            requestPreviewRender('urgent')
        }
    }
}

function toggleBleFields() {
    const isBle = els.mode.value === 'ble'
    els.bleFields.hidden = !isBle
}

function restoreBleState() {
    els.bleService.value = state.ble.serviceUuid
    els.bleWrite.value = state.ble.writeCharacteristicUuid
    els.bleNotify.value = state.ble.notifyCharacteristicUuid
    els.bleFilter.value = state.ble.namePrefix
}

async function connectBackend() {
    const mode = state.backend
    if (mode === 'usb') {
        return WebUSBBackend.requestDevice({ filters: [{ classCode: 7 }] })
    }
    if (mode === 'ble') {
        return WebBluetoothBackend.requestDevice({
            serviceUuid: state.ble.serviceUuid,
            writeCharacteristicUuid: state.ble.writeCharacteristicUuid,
            notifyCharacteristicUuid: state.ble.notifyCharacteristicUuid || undefined,
            filters: state.ble.namePrefix ? [{ namePrefix: state.ble.namePrefix }] : undefined
        })
    }
    throw new Error('Unknown backend mode')
}

async function doPrint() {
    setStatus('Rendering label...', 'info')
    els.print.disabled = true
    try {
        const snapshot = normalizePreviewState(state)
        const snapshotKey = buildPreviewStateKey(snapshot)
        const { media: selectedMedia, res } = resolveMediaAndResolution(snapshot)
        const job = new Job(selectedMedia, { resolution: res })
        let encodedPages = null

        if (
            latestPreviewPayload &&
            latestPreviewPayload.stateKey === snapshotKey &&
            latestPreviewPayload.resolutionId === res.id &&
            latestPreviewPayload.printRgba &&
            latestPreviewPayload.printWidth > 0 &&
            latestPreviewPayload.printHeight > 0
        ) {
            try {
                const prepared = await preparePrintDataInWorker({
                    imageData: {
                        width: latestPreviewPayload.printWidth,
                        height: latestPreviewPayload.printHeight,
                        data: new Uint8ClampedArray(latestPreviewPayload.printRgba)
                    },
                    leftPadding: selectedMedia.lmargin || 0,
                    resolutionId: res.id
                })
                const page = new Page(prepared.bitmap, prepared.width, prepared.length, res)
                job.addPage(page)
                encodedPages = [{ lines: prepared.encodedLines }]
            } catch (cachePrepError) {
                console.warn('Cached preview print-prep failed. Falling back to canvas rendering.', cachePrepError)
            }
        }

        if (job.length === 0) {
            const { printCanvas } = await buildCanvasFromSnapshot(snapshot)
            try {
                const ctx = printCanvas.getContext('2d')
                if (!ctx) {
                    throw new Error('2D canvas context is not available for print preparation')
                }
                const imageData = ctx.getImageData(0, 0, printCanvas.width, printCanvas.height)
                const prepared = await preparePrintDataInWorker({
                    imageData,
                    leftPadding: selectedMedia.lmargin || 0,
                    resolutionId: res.id
                })
                const page = new Page(prepared.bitmap, prepared.width, prepared.length, res)
                job.addPage(page)
                encodedPages = [{ lines: prepared.encodedLines }]
                latestPreviewPayload = {
                    stateKey: snapshotKey,
                    resolutionId: res.id,
                    printWidth: printCanvas.width,
                    printHeight: printCanvas.height,
                    printRgba: new Uint8ClampedArray(imageData.data)
                }
            } catch (workerError) {
                console.warn('Worker-based print preparation failed. Falling back to synchronous preparation.', workerError)
                const label = new Label(res, printCanvas)
                job.addPage(label)
            }
        }

        setStatus(`Requesting ${state.backend.toUpperCase()} device...`, 'info')
        const backend = await connectBackend()
        const PrinterClass = printerMap[state.printer] || P700
        const printer = new PrinterClass(backend)
        await printer.print(job, encodedPages ? { encodedPages } : undefined)
        setStatus('Print job sent.', 'success')
    } catch (err) {
        console.error(err)
        setStatus(err?.message || 'Failed to print', 'error')
    } finally {
        els.print.disabled = false
    }
}

function bindEvents() {
    els.addText.addEventListener('click', addTextItem)
    els.addQr.addEventListener('click', addQrItem)
    els.print.addEventListener('click', doPrint)

    els.mode.addEventListener('change', () => {
        state.backend = els.mode.value
        toggleBleFields()
    })
    els.orientation.addEventListener('change', () => {
        state.orientation = els.orientation.value
        renderItemsList()
        requestPreviewRender('urgent')
    })
    els.media.addEventListener('change', () => {
        state.media = els.media.value
        requestPreviewRender('urgent')
    })
    els.mediaLength.addEventListener('input', (e) => {
        const val = e.target.value.trim()
        state.mediaLengthMm = val ? Number(val) : null
        requestPreviewRender('idle')
    })
    els.resolution.addEventListener('change', () => {
        state.resolution = els.resolution.value
        requestPreviewRender('urgent')
    })
    els.printer.addEventListener('change', () => {
        state.printer = els.printer.value
    })

    els.bleService.addEventListener('input', (e) => (state.ble.serviceUuid = e.target.value))
    els.bleWrite.addEventListener('input', (e) => (state.ble.writeCharacteristicUuid = e.target.value))
    els.bleNotify.addEventListener('input', (e) => (state.ble.notifyCharacteristicUuid = e.target.value))
    els.bleFilter.addEventListener('input', (e) => (state.ble.namePrefix = e.target.value))
}

function init() {
    populateSelects()
    restoreBleState()
    els.mode.value = state.backend
    els.printer.value = state.printer
    toggleBleFields()
    renderItemsList()
    bindDrag()
    bindEvents()
    requestPreviewRender('urgent')
    scheduleIdle(
        () => {
            try {
                warmPreviewWorker()
                warmPrintPrepWorker()
            } catch (err) {
                console.warn('Worker warm-up skipped.', err)
            }
        },
        { timeout: PREVIEW_IDLE_TIMEOUT_MS }
    )
}

init()
