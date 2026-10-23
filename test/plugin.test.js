import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { apply } from '../src/plugin.js'
import { readTurns } from '../src/store.js'

function harness(config = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ffm-plugin-'))
  const handlers = new Map()
  const ctx = {
    on(type, fn) { handlers.set(type, fn); return () => handlers.delete(type) },
    effect(fn) { const off = fn(); return () => off?.() },
    logger: () => ({ info() {}, error() {}, warn() {} }),
  }
  apply(ctx, { dataDir: dir, ...config })
  const session = { header: { id: 'sess-1', cwd: 'C:\\ws\\proj' }, append: () => null }
  let seq = 0
  const emit = (type, data = {}) => {
    seq += 1
    handlers.get('session/event')(session, { type, seq, data })
  }
  return { dir, emit }
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
