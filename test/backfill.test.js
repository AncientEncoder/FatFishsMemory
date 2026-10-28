import test from 'node:test'
import assert from 'node:assert/strict'
import { uncoveredTurns, fillGaps } from '../src/backfill.js'

const turn = (n, user = `第 ${n} 轮`) => ({ turn: n, user, assistant: 'ok', ts: 1700000000000 + n })

test('uncoveredTurns reports turns outside every card', () => {
  const turns = [1, 2, 3, 4, 5].map((n) => turn(n))
  const index = { entries: [{ from: 1, to: 2 }, { from: 5, to: 5 }] }
  assert.deepEqual(uncoveredTurns(index, turns).map((t) => t.turn), [3, 4])
})

test('fillGaps adds contiguous fallback cards and leaves no hole', () => {
  const turns = Array.from({ length: 30 }, (_, i) => turn(i + 1))
  const index = { entries: [{ from: 1, to: 2, title: '旧卡' }, { from: 28, to: 30, title: '旧卡2' }] }
  const { index: next, changed } = fillGaps(index, turns, { maxTurns: 12 })
  assert.ok(changed >= 2)
  // 3..27 被补齐 → 覆盖 1..30 全部
  assert.equal(uncoveredTurns(next, turns).length, 0)
  const added = next.entries.filter((c) => c.cut === 'fallback')
  assert.equal(added.length, changed)
  const froms = next.entries.map((c) => c.from)
  assert.deepEqual(froms, [...froms].sort((a, b) => a - b))
})

test('fillGaps chunks long gaps but respects the card cap', () => {
  const turns = Array.from({ length: 40 }, (_, i) => turn(i + 1))
  const index = { entries: [{ from: 1, to: 1 }] }
  const { index: next, changed } = fillGaps(index, turns, { maxTurns: 12, maxCards: 3 })
  assert.ok(changed <= 3)
  const added = next.entries.filter((c) => c.cut === 'fallback')
  assert.ok(added.every((c) => c.span <= 12))
})

test('fillGaps is a no-op when everything is covered', () => {
  const turns = [1, 2, 3].map((n) => turn(n))
  const index = { entries: [{ from: 1, to: 3 }] }
  assert.equal(fillGaps(index, turns).changed, 0)
})

test('fillGaps tolerates empty input', () => {
  assert.equal(fillGaps({}, []).changed, 0)
  assert.equal(fillGaps({ entries: [] }, [turn(1)]).changed, 0)
})
