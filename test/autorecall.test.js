import test from 'node:test'
import assert from 'node:assert/strict'
import { hasRecallCue, entitiesOf, hitsIndex, countIndexHits, buildRecallDigest } from '../src/autorecall.js'

const cards = [
  { date: '2026-10-23', title: '白屏事故：手改 package.json', keywords: ['白屏', '插件', '重启'] },
  { date: '2026-10-24', title: '冷层增量归档', keywords: ['delta', '归档'] },
]
const turns = [
  { turn: 1, ts: Date.parse('2026-10-23T21:00:00Z'), user: '那天白屏到底是怎么搞的？', assistant: '手改 profile 的 package.json 导致会话崩溃' },
  { turn: 2, ts: Date.parse('2026-10-24T21:00:00Z'), user: '今天中午吃什么', assistant: '随便' },
]

test('cue words are recognised', () => {
  assert.equal(hasRecallCue('那天白屏到底是怎么搞的'), true)
  assert.equal(hasRecallCue('上次说的那个 delta'), true)
  assert.equal(hasRecallCue('今天中午吃什么'), false)
})

test('entity extraction skips stop words', () => {
  const ents = entitiesOf('那天的白屏是怎么搞的')
  assert.ok([...ents].includes('白屏'))
  assert.ok(!ents.has('的'))
})

test('index hit is entity based', () => {
  assert.equal(hitsIndex(cards, '白屏又出现了'), true)
  assert.equal(hitsIndex(cards, '今天天气不错'), false)
})

test('a single keyword hit is not enough on its own', () => {
  // "重启"只命中一个关键词——这就是之前噪音的来源
  assert.equal(countIndexHits(cards, '重启好了，可以聊聊天'), 1)
  assert.equal(countIndexHits(cards, '白屏那次插件重启'), 3)
})

test('no cue and no index hit means no lookup', () => {
  const d = buildRecallDigest('今天中午吃什么', { cards, turns })
  assert.equal(d.text, '')
  assert.equal(d.from, 'none')
})

test('a cue alone triggers a lookup', () => {
  const d = buildRecallDigest('那天白屏到底是怎么搞的？', { cards, turns })
  assert.ok(d.text.startsWith('[可能相关]'))
  assert.ok(d.text.includes('白屏'))
})

test('digest respects the limit and char budget', () => {
  const many = Array.from({ length: 10 }, (_, i) => ({ turn: i, ts: Date.now(), user: `上次说的白屏 ${i}`, assistant: 'x'.repeat(200) }))
  const d = buildRecallDigest('上次说的白屏', { cards: [], turns: many, limit: 2, maxChars: 120 })
  const lines = d.text.split('\n').filter((l) => l.startsWith('- '))
  assert.ok(lines.length <= 2)
  assert.ok(d.text.length <= 160)
})

test('empty query returns nothing', () => {
  assert.equal(buildRecallDigest('', { cards, turns }).text, '')
  assert.equal(buildRecallDigest('   ', { cards, turns }).text, '')
})
