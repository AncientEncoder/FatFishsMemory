import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { appendTurn, readTurns, readIndex, writeIndex } from '../src/store.js'
import { estimateTokens, pressureOf } from '../src/pressure.js'

test('appendTurn + readTurns round trip', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ffm-'))
  appendTurn(root, 's1', { turn: 1, user: '你好', assistant: '在的' })
  appendTurn(root, 's1', { turn: 2, user: '再见', assistant: '拜拜' })
  const turns = readTurns(root, 's1')
  assert.equal(turns.length, 2)
  assert.equal(turns[0].user, '你好')
})

test('index read/write', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ffm-'))
  writeIndex(root, 's2', { entries: [{ title: 't', date: '2026-10-23' }] })
  const index = readIndex(root, 's2')
  assert.equal(index.entries.length, 1)
})

test('token estimate and pressure', () => {
  assert.ok(estimateTokens('你好世界') > 0)
  assert.equal(pressureOf(524288, 1048576), 0.5)
})