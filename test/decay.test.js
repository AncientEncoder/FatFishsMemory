import test from 'node:test'
import assert from 'node:assert/strict'
import { decayFactor, ageInDays } from '../src/decay.js'

const DAY = 24 * 60 * 60 * 1000
const now = Date.parse('2026-10-24T00:00:00Z')

test('today is not decayed', () => {
  assert.equal(decayFactor('2026-10-24', { now }), 1)
})

test('one half-life halves the weight', () => {
  const f = decayFactor(now - 90 * DAY, { now, halfLifeDays: 90 })
  assert.ok(Math.abs(f - 0.5) < 1e-6, `got ${f}`)
})

test('weight never drops below the floor', () => {
  const f = decayFactor(now - 3650 * DAY, { now, floor: 0.2 })
  assert.equal(f, 0.2)
})

test('invalid dates are treated as fresh', () => {
  assert.equal(decayFactor('not-a-date', { now }), 1)
  assert.equal(decayFactor(undefined, { now }), 1)
})

test('ageInDays handles both date strings and timestamps', () => {
  assert.equal(ageInDays(now - 3 * DAY, now), 3)
  assert.equal(ageInDays('2026-10-21', now), 3)
  assert.equal(ageInDays('nonsense', now), null)
})

test('older memory scores lower than newer memory', () => {
  const fresh = decayFactor(now - 1 * DAY, { now })
  const old = decayFactor(now - 180 * DAY, { now })
  assert.ok(fresh > old)
})
