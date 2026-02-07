// Complex label with text rows and a QR code. Serve this over https/localhost.
// Dependencies: qrcode (ESM) from jsdelivr.

import QRCode from 'https://cdn.jsdelivr.net/npm/qrcode@1.5.1/+esm'
import {
    P700,
    P750W,
    E500,
    E550W,
    H500,
    Job,
    Media,
    Resolution,
    Label,
    TextItem,
    BoxItem,
    WebUSBBackend,
    WebBluetoothBackend
} from '../src/index.mjs'

async function buildQrCanvas(data, size) {
    const canvas = document.createElement('canvas')
    await QRCode.toCanvas(canvas, data, { errorCorrectionLevel: 'M', margin: 0, width: size })
    return canvas
}

async function buildLabel(media, resolution = Resolution.LOW) {
    const headerHeight = Math.floor(media.printArea * 0.3)
    const lineHeight = Math.floor(media.printArea * 0.17)
    const qrHeight = media.printArea - headerHeight - lineHeight * 2
    const qr = await buildQrCanvas('https://example.com/device/port-24', qrHeight)

    const header = new BoxItem(headerHeight, [new TextItem(headerHeight, 'Network Port', '30px sans-serif')])
    const lineA = new BoxItem(lineHeight, [new TextItem(lineHeight, 'Room: 1.23', '21px sans-serif')])
    const lineB = new BoxItem(lineHeight, [new TextItem(lineHeight, 'Jack: A12', '21px monospace')])
    const qrRow = new BoxItem(qrHeight, [qr])

    // Row heights must add up to media.printArea so the page width matches the loaded tape.
    return new Label(resolution, header, lineA, lineB, qrRow)
}

async function connectBackend(mode = 'usb') {
    if (mode === 'usb') {
        return WebUSBBackend.requestDevice({ filters: [{ classCode: 7 }] }) // USB printer class
    }
    if (mode === 'ble') {
        // Supply the correct BLE UUIDs for your device.
        return WebBluetoothBackend.requestDevice({
            serviceUuid: '0000xxxx-0000-1000-8000-00805f9b34fb',
            writeCharacteristicUuid: '0000yyyy-0000-1000-8000-00805f9b34fb',
            notifyCharacteristicUuid: '0000zzzz-0000-1000-8000-00805f9b34fb',
            filters: [{ namePrefix: 'PT-' }]
        })
    }
    throw new Error('Unknown backend mode')
}

export async function printLabel(mode = 'usb') {
    const backend = await connectBackend(mode)
    const media = Media.W24
    const resolution = Resolution.LOW
    const label = await buildLabel(media, resolution)
    const job = new Job(media, { resolution })
    job.addPage(label)

    // Pick the right shim for your model.
    const printer = new P700(backend) // or P750W/E500/E550W/H500
    await printer.print(job)
}

// Attach to a button click in your page to satisfy WebUSB/WebBluetooth gesture requirements.
if (typeof window !== 'undefined') {
    window.printLabel = printLabel
}
