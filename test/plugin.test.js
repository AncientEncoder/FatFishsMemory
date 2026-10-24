import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { apply } from '../src/plugin.js'
import { readTurns } from '../src/store.js'
import { buildCatalog, catalogId } from '../src/hotmemory.js'

function harness(config = {}, overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ffm-plugin-'))
  const handlers = new Map()
  const appends = []
  const ctx = {
    on(type, fn) { handlers.set(type, fn); return () => handlers.delete(type) },
    effect(fn) { const off = fn(); return () => off?.() },
    logger: () => ({ info() {}, error() {}, warn() {} }),
  }
  apply(ctx, { dataDir: dir, migrate: false, ...config })
  const session = {
    header: { id: 'sess-1', cwd: 'C:\\ws\\proj' },
    append: (event, data, options) => { appends.push({ event, data, options }); return { event, data } },
    ...overrides,
  }
  let seq = 0
  const emit = (type, data = {}) => {
    seq += 1
    handlers.get('session/event')(session, { type, seq, data })
  }
  return { dir, emit, appends, session }
}

const userMsg = (text) => ({
  id: `u-${text}`,
  role: 'user',
  source: { kind: 'user' },
  content: [{ type: 'text', text }],
})

const assistantMsg = (turn, text) => ({
  turn,
  step: 1,
  message: { role: 'assistant', content: [{ type: 'reasoning', text: '思考' }, { type: 'text', text }] },
})

const seedIndex = (dir, cards) => {
  const sessionDir = path.join(dir, 'proj', 'sess-1')
  fs.mkdirSync(sessionDir, { recursive: true })
  fs.writeFileSync(path.join(sessionDir, 'index.json'), JSON.stringify({ entries: cards }), 'utf8')
}

test('user text survives a user/message that arrives before turn/start', () => {
  const { dir, emit } = harness()
  // 新进程启动时就是这个顺序：消息先到，turn/start 后到
  emit('user/message', userMsg('先到的提问'))
  emit('turn/start', { turn: 7 })
  emit('assistant/message', assistantMsg(7, '回答'))
  emit('turn/end', { turn: 7 })

  const turns = readTurns(dir, 'sess-1', 'proj')
  assert.equal(turns.length, 1)
  assert.equal(turns[0].user, '先到的提问')
  assert.equal(turns[0].assistant, '回答')
  assert.equal(turns[0].turn, 7)
})

test('runtime-context injections are not archived as user input', () => {
  const { dir, emit } = harness()
  emit('turn/start', { turn: 1 })
  emit('user/message', {
    id: 'ctx',
    role: 'user',
    source: { kind: 'runtime-context' },
    content: [{ type: 'text', text: 'Current runtime context...' }],
  })
  emit('user/message', userMsg('真正的问题'))
  emit('assistant/message', assistantMsg(1, '答'))
  emit('turn/end', { turn: 1 })

  const turns = readTurns(dir, 'sess-1', 'proj')
  assert.equal(turns[0].user, '真正的问题')
})

test('reasoning blocks never leak into the archive', () => {
  const { dir, emit } = harness()
  emit('turn/start', { turn: 2 })
  emit('user/message', userMsg('问题'))
  emit('assistant/message', assistantMsg(2, '结论'))
  emit('turn/end', { turn: 2 })

  const turns = readTurns(dir, 'sess-1', 'proj')
  assert.equal(turns[0].assistant, '结论')
  assert.ok(!turns[0].assistant.includes('思考'))
})

test('catalog is injected as a system/message with a surfaceOp marker', async () => {
  const { dir, emit, appends } = harness()
  seedIndex(dir, [{ date: '2026-10-23', from: 1, to: 1, title: '修服务器 SFTP', points: [], keywords: [] }])

  emit('step/start', { turn: 9, step: 1 })
  emit('system/message', {
    turn: 9,
    step: 1,
    message: { id: 'sp-1', role: 'system', source: { kind: 'system-prompt' }, content: [{ type: 'text', text: 'prompt' }] },
  })
  await new Promise((resolve) => queueMicrotask(resolve))

  const injected = appends.find((a) => a.event === 'system/message')
  assert.ok(injected, 'should append a system/message')
  assert.deepEqual(injected.options, { surfaceOp: 'append' })
  assert.equal(injected.data.turn, 9)
  assert.equal(injected.data.step, 1)
  assert.ok(typeof injected.data.message.id === 'string' && injected.data.message.id.length > 0)
  assert.deepEqual(injected.data.message.source, { kind: 'system-prompt' })
  assert.equal(injected.data.message.role, 'system')
  assert.match(injected.data.message.content[0].text, /\[记忆目录\]/)
})

test('catalog is injected at step/start when a system prompt already exists', async () => {
  const session = {
    surface: { nodes: [0] },
    eventAt: () => ({ type: 'system/message' }),
  }
  const { dir, emit, appends } = harness({}, session)
  seedIndex(dir, [{ date: '2026-10-23', from: 1, to: 1, title: '旧记忆', points: [], keywords: [] }])

  emit('step/start', { turn: 4, step: 1 })
  await new Promise((resolve) => queueMicrotask(resolve))

  const injected = appends.find((a) => a.event === 'system/message')
  assert.ok(injected, 'should append a system/message')
  assert.equal(injected.data.turn, 4)
  assert.deepEqual(injected.data.message.source, { kind: 'system-prompt' })
})

test('catalog is not injected when the session already has a persisted catalog', async () => {
  const cards = [{ date: '2026-10-23', from: 1, to: 1, title: '旧记忆', points: [], keywords: [] }]
  const existingId = catalogId(buildCatalog(cards, { maxEntries: 8 }))
  const session = {
    surface: { nodes: [0, 1] },
    eventAt: (seq) => seq === 1
      ? { type: 'system/message', data: { message: { id: existingId, content: [] } } }
      : { type: 'system/message' },
  }
  const { dir, emit, appends } = harness({}, session)
  seedIndex(dir, cards)

  emit('step/start', { turn: 2, step: 1 })
  await new Promise((resolve) => queueMicrotask(resolve))

  assert.equal(appends.filter((a) => a.event === 'system/message').length, 0)
})

test('catalog is not injected twice in one session', async () => {
  const { dir, emit, appends } = harness()
  seedIndex(dir, [{ date: '2026-10-23', from: 1, to: 1, title: '一件事', points: [], keywords: [] }])

  const prompt = (turn) => ({
    turn,
    step: 1,
    message: { id: `sp-${turn}`, role: 'system', source: { kind: 'system-prompt' }, content: [{ type: 'text', text: 'prompt' }] },
  })
  emit('step/start', { turn: 1, step: 1 })
  emit('system/message', prompt(1))
  await new Promise((resolve) => queueMicrotask(resolve))
  emit('step/start', { turn: 2, step: 1 })
  emit('system/message', prompt(2))
  await new Promise((resolve) => queueMicrotask(resolve))

  assert.equal(appends.filter((a) => a.event === 'system/message').length, 1)
})

test('no catalog is injected when there are no cards', async () => {
  const { emit, appends } = harness()
  emit('step/start', { turn: 3, step: 1 })
  emit('system/message', {
    turn: 3,
    step: 1,
    message: { id: 'sp-3', role: 'system', source: { kind: 'system-prompt' }, content: [{ type: 'text', text: 'prompt' }] },
  })
  await new Promise((resolve) => queueMicrotask(resolve))
  assert.equal(appends.filter((a) => a.event === 'system/message').length, 0)
})

test('tool calls are recorded per turn for card actions', () => {
  const { dir, emit } = harness()
  emit('turn/start', { turn: 4 })
  emit('user/message', userMsg('跑个命令再读个文件'))
  emit('step/start', { turn: 4, step: 1 })
  emit('tool/call', { turn: 4, step: 1, name: 'pwsh', callId: 'c1' })
  emit('tool/call', { turn: 4, step: 2, name: 'read', callId: 'c2' })
  emit('tool/call', { turn: 4, step: 3, name: 'pwsh', callId: 'c3' })
  emit('assistant/message', assistantMsg(4, '完成'))
  emit('turn/end', { turn: 4 })

  const turns = readTurns(dir, 'sess-1', 'proj')
  assert.deepEqual(turns[0].tools, ['pwsh', 'read'])
})

test('recent impression is updated at turn end when a mood cue appears', () => {
  const { dir, emit } = harness()
  emit('turn/start', { turn: 1 })
  emit('user/message', userMsg('今天打了一天战争雷霆，好累'))
  emit('assistant/message', assistantMsg(1, '早点休息'))
  emit('turn/end', { turn: 1 })

  const profile = JSON.parse(fs.readFileSync(path.join(dir, 'profile.json'), 'utf8'))
  assert.ok(profile.meta?.lastRecentAt, 'throttle timestamp must be persisted')
  assert.match(profile.sections.recent[0].text, /战争雷霆/)
})

test('recent impression is not overwritten by a plain line', () => {
  const { dir, emit } = harness()
  emit('turn/start', { turn: 1 })
  emit('user/message', userMsg('把 README 的章节改一下'))
  emit('assistant/message', assistantMsg(1, '好'))
  emit('turn/end', { turn: 1 })

  const profile = JSON.parse(fs.readFileSync(path.join(dir, 'profile.json'), 'utf8'))
  assert.equal(profile.sections.recent.length, 0)
  assert.ok(profile.meta?.lastRecentAt)
})
