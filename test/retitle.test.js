import test from 'node:test'
import assert from 'node:assert/strict'
import { isWeakTitle, retitleIndex } from '../src/retitle.js'

const turn = (n, user) => ({ turn: n, user, assistant: 'ok' })

test('weak titles are the short ones', () => {
  assert.equal(isWeakTitle('来吧'), true)
  assert.equal(isWeakTitle('35米'), true)
  assert.equal(isWeakTitle(''), true)
  assert.equal(isWeakTitle('(无标题)'), true)
  assert.equal(isWeakTitle('PD 分离在 2P2D 上为什么不赚'), false)
})

test('retitle picks a meaningful line inside the card range', () => {
  const turns = [
    turn(1, '来吧'),
    turn(2, '要'),
    turn(3, '把那个 openEuler 的 bitmap 损坏问题记一下'),
  ]
  const index = {
    entries: [
      { from: 1, to: 1, title: '来吧' },
      { from: 1, to: 3, title: '要' },
      { from: 2, to: 3, title: '已经很好的标题不用改' },
    ],
  }
  const { index: next, changed } = retitleIndex(index, turns)
  // 只有跨了多轮的卡才有更好的选择；只覆盖"来吧"那一轮的卡无计可施，保持原样
  assert.equal(changed, 1)
  assert.equal(next.entries[0].title, '来吧')
  assert.equal(next.entries[1].title, '把那个 openEuler 的 bitmap 损坏问题记一下')
  assert.equal(next.entries[2].title, '已经很好的标题不用改')
})

test('retitle leaves cards alone when turns are missing', () => {
  const index = { entries: [{ from: 100, to: 101, title: '来吧' }] }
  const { changed } = retitleIndex(index, [])
  assert.equal(changed, 0)
})

test('retitle tolerates empty input', () => {
  assert.equal(retitleIndex(null, []).changed, 0)
  assert.equal(retitleIndex({}, []).changed, 0)
})
