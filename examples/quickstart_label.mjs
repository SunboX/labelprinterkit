// Simple two-line label example from the README Quickstart.

import {
    P700,
    Job,
    Media,
    Resolution,
    Label,
    TextItem,
    BoxItem,
    WebUSBBackend,
    WebBluetoothBackend
} from '../src/index.mjs'

async function connectBackend(mode = 'usb') {
    if (mode === 'usb') {
        // USB printer class; requires a user gesture in browsers.
        return WebUSBBackend.requestDevice({ filters: [{ classCode: 7 }] })
    }
    if (mode === 'ble') {
        // Provide the BLE service/characteristic UUIDs for your device.
        return WebBluetoothBackend.requestDevice({
            serviceUuid: '0000xxxx-0000-1000-8000-00805f9b34fb',
            writeCharacteristicUuid: '0000yyyy-0000-1000-8000-00805f9b34fb',
            notifyCharacteristicUuid: '0000zzzz-0000-1000-8000-00805f9b34fb',
            filters: [{ namePrefix: 'PT-' }]
        })
    }
    throw new Error('Unknown backend mode')
}

export async function printSample(mode = 'usb') {
    const backend = await connectBackend(mode)
    const media = Media.W12
    const resolution = Resolution.LOW

    // Row heights must sum to media.printArea so Job.addPage width validation passes.
    const firstLineHeight = Math.floor(media.printArea * 0.58)
    const secondLineHeight = media.printArea - firstLineHeight

    const rowA = new BoxItem(firstLineHeight, [new TextItem(firstLineHeight, 'First line', '28px sans-serif')])
    const rowB = new BoxItem(secondLineHeight, [new TextItem(secondLineHeight, 'Second line', '22px sans-serif')])
    const label = new Label(resolution, rowA, rowB)

    const job = new Job(media, { resolution })
    job.addPage(label)

    const printer = new P700(backend) // P750W/E500/E550W are available shims too
    await printer.print(job)
}

// Attach to a user gesture (e.g., a button click) to satisfy WebUSB/WebBluetooth requirements.
if (typeof window !== 'undefined') {
    window.printSample = printSample
}
