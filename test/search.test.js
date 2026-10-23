import test from 'node:test'
import assert from 'node:assert/strict'
import { searchTurns, searchCards, snippet } from '../src/search.js'
import { makeCard } from '../src/compact.js'

const turns = [
  { turn: 1, ts: 1, user: '服务器 SSH 连不上', assistant: '先看 22 端口' },
  { turn: 2, ts: 2, user: '今天天气不错', assistant: '适合出门' },
  { turn: 3, ts: 3, user: '插件白屏了', assistant: '检查 bundles 配置' },
]

test('searchTurns ranks the relevant turn first', () => {
  const hits = searchTurns(turns, '白屏')
  assert.ok(hits.length >= 1)
  assert.equal(hits[0].turn, 3)
})

test('searchTurns ignores unrelated turns', () => {
  const hits = searchTurns(turns, 'SSH')
  assert.equal(hits.length, 1)
  assert.equal(hits[0].turn, 1)
})

test('phrase hit scores higher than split words', () => {
  const list = [
    { turn: 9, user: 'zstd 多帧日志解析', assistant: '' },
    { turn: 10, user: '日志里有多帧', assistant: 'zstd 是压缩' },
  ]
  const hits = searchTurns(list, 'zstd 多帧')
  assert.equal(hits[0].turn, 9)
})

test('searchCards matches title and points', () => {
  const card = makeCard([{ turn: 5, user: '先重启验一把吧', assistant: '好' }], { from: 5, to: 5 })
  const hits = searchCards([card], '重启')
  assert.equal(hits.length, 1)
  assert.ok(hits[0].score > 0)
})

test('empty query returns nothing', () => {
  assert.deepEqual(searchTurns(turns, ''), [])
  assert.deepEqual(searchCards([], 'x'), [])
})

test('snippet centres on the match', () => {
  const text = 'a'.repeat(50) + '关键词' + 'b'.repeat(50)
  const s = snippet(text, '关键词', 30)
  assert.ok(s.includes('关键词'))
  assert.ok(s.startsWith('…'))
})
