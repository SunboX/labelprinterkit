// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: GPL-3.0-or-later

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { LIBRARY_VERSION, getLibraryVersion } from '../src/index.mjs'

test('getLibraryVersion returns the exported library version constant', () => {
    assert.equal(getLibraryVersion(), LIBRARY_VERSION)
})

test('library version matches package.json version', () => {
    const packageJsonPath = new URL('../package.json', import.meta.url)
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
    assert.equal(LIBRARY_VERSION, packageJson.version)
})
