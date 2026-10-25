import test from 'node:test'
import assert from 'node:assert/strict'
import { healIndex } from '../src/heal.js'

const card = (from, to, extra = {}) => ({ from, to, title: `t${from}`, ...extra })

test('an oversized legacy task card is dropped', () => {
  const index = { compactedThrough: 250, entries: [card(113, 250, { cut: 'task', title: '重启完了' })] }
  const r = healIndex(index, { maxTurnsPerTask: 12 })
  assert.equal(r.changed, true)
  assert.equal(r.index.entries.length, 0)
  assert.equal(r.compactedThrough, 112)
})

test('early pressure cards without a cut field are kept', () => {
  const index = { compactedThrough: 105, entries: [card(1, 105, { title: '这是第一句' })] }
  const r = healIndex(index, { maxTurnsPerTask: 12 })
  assert.equal(r.changed, false)
  assert.equal(r.index.entries.length, 1)
})

test('a task card with a span is kept', () => {
  const index = { compactedThrough: 250, entries: [card(239, 250, { cut: 'task', span: 12 })] }
  const r = healIndex(index, { maxTurnsPerTask: 12 })
  assert.equal(r.changed, false)
})

test('a short legacy task card is kept', () => {
  const index = { compactedThrough: 250, entries: [card(248, 250, { cut: 'task' })] }
  const r = healIndex(index, { maxTurnsPerTask: 12 })
  assert.equal(r.changed, false)
})

test('cursor retreats to just before the dropped card', () => {
  const index = {
    compactedThrough: 267,
    entries: [card(113, 250, { cut: 'task' }), card(251, 253, { cut: 'task', span: 3 })],
  }
  const r = healIndex(index, { maxTurnsPerTask: 12 })
  assert.equal(r.compactedThrough, 112)
  assert.equal(r.index.entries.length, 1)
  assert.equal(r.index.entries[0].from, 251)
})

test('garbage input is safe', () => {
  assert.equal(healIndex(null).changed, false)
  assert.equal(healIndex({}).changed, false)
  assert.equal(healIndex({ entries: 'nope' }).changed, false)
})
