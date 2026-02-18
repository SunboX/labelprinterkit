# Backends

Backends provide transport I/O for printer classes.

## Backend Contract

Printer code relies on:

- `write(Uint8Array | ArrayLike<number>): Promise<void>`
- `read(count: number): Promise<Uint8Array | null>`

Optional helpers:

- `open()`
- `close()`
- `getStatus()` (custom shortcut; if present, printer uses it)

## WebUSBBackend

`WebUSBBackend.requestDevice({ filters })`:

- Prompts user to select a USB device.
- Opens device and claims interface.
- Defaults to USB printer class filter (`classCode: 7`).

Options:

- `outEndpoint` default `0x02`
- `inEndpoint` default `0x81`
- `interfaceNumber` default `0`

## WebBluetoothBackend

`WebBluetoothBackend.requestDevice(...)` requires:

- `serviceUuid`
- `writeCharacteristicUuid`

Optional:

- `notifyCharacteristicUuid`
- `readCharacteristicUuid`
- `filters`

Behavior:

- If notify characteristic is used, incoming bytes are buffered from notifications.
- `read(count)` resolves from that buffer (or direct read characteristic if configured).

## Environment Notes

- WebUSB and WebBluetooth require browser support and secure context.
- Device selection must run from a user gesture (click/tap).
