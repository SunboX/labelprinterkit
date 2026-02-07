import test from 'node:test'
import assert from 'node:assert/strict'

import { Job, Media, Resolution } from '../src/index.mjs'

function page({ width = Media.W12.printArea, resolution = Resolution.LOW, length = Resolution.LOW.minLength } = {}) {
    return { width, resolution, length, lines: () => [] }
}

test('Job accepts a page that matches media width, resolution, and minimum length', () => {
    const job = new Job(Media.W12, { resolution: Resolution.LOW })
    job.addPage(page())
    assert.equal(job.length, 1)
})

test('Job rejects page when width does not match media print area', () => {
    const job = new Job(Media.W12, { resolution: Resolution.LOW })
    assert.throws(() => job.addPage(page({ width: Media.W12.printArea + 1 })), /Page width does not match media width/)
})

test('Job rejects page when resolution does not match job resolution', () => {
    const job = new Job(Media.W12, { resolution: Resolution.HIGH })
    assert.throws(() => job.addPage(page({ resolution: Resolution.LOW, length: Resolution.HIGH.minLength })), /Page resolution does not match media resolution/)
})

test('Job rejects page when length is below selected resolution minimum', () => {
    const job = new Job(Media.W12, { resolution: Resolution.HIGH })
    assert.throws(() => job.addPage(page({ resolution: Resolution.HIGH, length: Resolution.HIGH.minLength - 1 })), /Page is not long enough for the selected resolution/)
})

test('Job validates cutEach bounds', () => {
    assert.throws(() => new Job(Media.W12, { cutEach: 0 }), /cutEach has to be between 1 and 99/)
    assert.throws(() => new Job(Media.W12, { cutEach: 100 }), /cutEach has to be between 1 and 99/)
})
