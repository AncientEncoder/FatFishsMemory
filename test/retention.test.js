import test from 'node:test'
import assert from 'node:assert/strict'
import { splitForRetention } from '../src/retention.js'

const cards = (n) => Array.from({ length: n }, (_, i) => ({ title: `第 ${i} 件` }))

test('nothing is dropped below the limit', () => {
  const { kept, dropped } = splitForRetention(cards(10), { maxCards: 300 })
  assert.equal(kept.length, 10)
  assert.equal(dropped.length, 0)
})

test('oldest cards are the ones dropped', () => {
  const { kept, dropped } = splitForRetention(cards(10), { maxCards: 4 })
  assert.equal(kept.length, 4)
  assert.equal(dropped.length, 6)
  assert.equal(dropped[0].title, '第 0 件')
  assert.equal(kept[0].title, '第 6 件')
  assert.equal(kept[3].title, '第 9 件')
})

test('exactly at the limit keeps everything', () => {
  const { kept, dropped } = splitForRetention(cards(300), { maxCards: 300 })
  assert.equal(kept.length, 300)
  assert.equal(dropped.length, 0)
})

test('garbage input degrades to empty', () => {
  assert.deepEqual(splitForRetention(null).kept, [])
  assert.deepEqual(splitForRetention(undefined).dropped, [])
})
