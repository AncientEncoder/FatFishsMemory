import test from 'node:test'
import assert from 'node:assert/strict'
import { makeCard, keywordsOf, pickTitle } from '../src/compact.js'
import { recall, buildRecallBlock } from '../src/recall.js'

const turns = [
  { turn: 1, user: '服务器 SFTP 挂了，帮我看看', assistant: '先确认是整机挂了还是服务挂了' },
  { turn: 2, user: '192.168.1.10 是 NAS', assistant: 'ping 和 22 端口分开测' },
  { turn: 3, user: '下电了，ping 能通', assistant: '那就是 sshd 还在' },
]

test('keywords skip stop words', () => {
  const kw = keywordsOf('我们的服务器挂了，服务器要重启', 5)
  assert.ok(kw.includes('服务器'))
  assert.ok(!kw.includes('的'))
})

test('card has title, date, points and keywords', () => {
  const card = makeCard(turns, { from: 1, to: 3 })
  assert.equal(card.from, 1)
  assert.equal(card.to, 3)
  assert.match(card.date, /^\d{4}-\d{2}-\d{2}$/)
  assert.ok(card.title.includes('服务器'))
  assert.ok(card.points.length > 0)
  assert.ok(card.keywords.length > 0)
})

test('recall finds the relevant card and ignores noise', () => {
  const cardA = makeCard(turns, { from: 1, to: 3 })
  const cardB = makeCard([{ turn: 4, user: '今天玩某个游戏', assistant: '某条线不错' }], { from: 4, to: 4 })
  const hits = recall([cardA, cardB], '服务器 ssh 连不上怎么查')
  assert.ok(hits.length >= 1)
  assert.ok(hits[0].title.includes('服务器'))
})

test('recall block renders a hint', () => {
  const card = makeCard(turns, { from: 1, to: 3 })
  const block = buildRecallBlock([card])
  assert.ok(block.includes('[回忆]'))
  assert.ok(block.includes('服务器'))
})

test('card carries structured fields: goal, actions, outcome, files', () => {
  const list = [
    {
      turn: 1,
      user: '插件装不上，帮我看下',
      assistant: '先看 profile 的 bundles',
      tools: ['pwsh', 'pwsh', 'read'],
    },
    {
      turn: 2,
      user: '好了',
      assistant: '装好了，路径是 D:\\Work\\Code\\FatFishsMemory',
      tools: ['pwsh'],
    },
  ]
  const card = makeCard(list, { from: 1, to: 2 })
  assert.equal(card.goal, '插件装不上，帮我看下')
  assert.deepEqual(card.actions, ['pwsh×3', 'read'])
  assert.ok(card.outcome.startsWith('装好了'))
  assert.ok(card.files.some((f) => f.includes('FatFishsMemory')))
})

test('card without tools degrades gracefully', () => {
  const card = makeCard([{ turn: 1, user: '闲聊', assistant: '好啊' }], { from: 1, to: 1 })
  assert.deepEqual(card.actions, [])
  assert.deepEqual(card.files, [])
})

test('title skips filler lines and picks the first meaningful one', () => {
  const list = [
    { turn: 1, user: '来吧' },
    { turn: 2, user: '要' },
    { turn: 3, user: '把那个 openEuler 的 bitmap 损坏问题记一下' },
  ]
  assert.equal(pickTitle(list), '把那个 openEuler 的 bitmap 损坏问题记一下')
})

test('title falls back to the first line when everything is short', () => {
  assert.equal(pickTitle([{ turn: 1, user: '好' }]), '好')
  assert.equal(pickTitle([]), '(无标题)')
})

test('title skips file names and paths', () => {
  const list = [
    { turn: 1, user: '这个咩？session-10d841fa-6514-4a8f-8bb2-6d4a3fe4' },
    { turn: 2, user: '看看 D:\\Work\\Code\\FatFishsMemory 里的索引' },
    { turn: 3, user: '记忆卡到底存在哪了' },
  ]
  const title = pickTitle(list)
  assert.equal(title, '记忆卡到底存在哪了')
})