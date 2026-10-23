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
  assert.equal(data.message.role, 'system')
  assert.equal(data.message.content[0].type, 'text')
  assert.equal(data.message.content[0].text, 'hello')
})
