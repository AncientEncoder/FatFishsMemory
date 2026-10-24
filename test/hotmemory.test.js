import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCatalog, buildCatalogMessage } from '../src/hotmemory.js'

const cards = [
  { date: '2026-10-22', title: '修服务器 SFTP' },
  { date: '2026-10-22', title: 'ollama 模型迁移 SSD' },
  { date: '2026-10-23', title: '给投影仪配 NAS' },
]

test('empty card list yields no catalog', () => {
  assert.equal(buildCatalog([]), '')
  assert.equal(buildCatalog(null), '')
})

test('catalog lists date and title only', () => {
  const text = buildCatalog(cards)
  assert.ok(text.startsWith('[记忆目录]'))
  assert.ok(text.includes('2026-10-23 给投影仪配 NAS'))
  assert.ok(!text.includes('keywords'))
})

test('catalog keeps only the newest N cards', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ date: '2026-10-23', title: `第 ${i} 件` }))
  const text = buildCatalog(many, { maxEntries: 3 })
  assert.ok(text.includes('第 19 件'))
  assert.ok(!text.includes('第 0 件'))
})

test('catalog can carry a "how to look it up" hint', () => {
  const cmd = 'node "/x/tools/recall.mjs" "关键词"'
  const text = buildCatalog(cards, { recallCommand: cmd })
  assert.ok(text.includes('查细节'))
  assert.ok(text.includes('recall.mjs'))
  // 不传就不该有
  assert.ok(!buildCatalog(cards).includes('查细节'))
})

test('tight budget drops cards but keeps the hint', () => {
  const many = Array.from({ length: 6 }, (_, i) => ({ date: '2026-10-23', title: `很长很长的一条记忆 ${i}` }))
  const cmd = 'node "/x/tools/recall.mjs" "关键词"'
  const text = buildCatalog(many, { recallCommand: cmd, maxChars: 120 })
  assert.ok(text.includes('查细节'), 'hint must survive truncation')
  assert.ok(text.length <= 200)
})

test('catalog respects the char budget', () => {
  const many = Array.from({ length: 50 }, (_, i) => ({ date: '2026-10-23', title: `很长很长的记忆标题 ${i}` }))
  const text = buildCatalog(many, { maxEntries: 50, maxChars: 200 })
  assert.ok(text.length <= 220, `got ${text.length}`)
})

test('message shape matches the runtime system/message format', () => {
  const { event, data } = buildCatalogMessage('hello', { turn: 12, step: 1 })
  assert.equal(event, 'system/message')
  assert.equal(data.turn, 12)
  assert.equal(data.step, 1)
  assert.ok(typeof data.message.id === 'string' && data.message.id.length > 0)
  assert.deepEqual(data.message.source, { kind: 'system-prompt' })
  assert.equal(data.message.role, 'system')
  assert.equal(data.message.content[0].type, 'text')
  assert.equal(data.message.content[0].text, 'hello')
})

test('catalog message ids are unique', () => {
  const a = buildCatalogMessage('a').data.message.id
  const b = buildCatalogMessage('b').data.message.id
  assert.notEqual(a, b)
})
