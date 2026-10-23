import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRecallMessage, nextMessageId, readInbox, spliceInbox } from '../src/inject.js'

test('message ids are unique', () => {
  const a = nextMessageId('x')
  const b = nextMessageId('x')
  assert.notEqual(a, b)
})

test('recall message has the shape the runtime expects', () => {
  const message = buildRecallMessage('hello')
  assert.equal(message.role, 'user')
  assert.equal(message.content[0].type, 'text')
  assert.equal(message.content[0].text, 'hello')
  assert.ok(message.id.startsWith('fatfish-recall-'))
})

test('readInbox accepts both a function and a plain object', () => {
  const shape = { 'next-turn': [{ id: 'a' }], 'next-step': [] }
  assert.deepEqual(readInbox({ inbox: () => shape }), shape)
  assert.deepEqual(readInbox({ inbox: shape }), shape)
  assert.equal(readInbox({}), null)
  assert.equal(readInbox(null), null)
  // 抛异常的函数不能让上层炸掉
  assert.equal(readInbox({ inbox: () => { throw new Error('boom') } }), null)
})

test('spliceInbox computes start from the target queue', () => {
  const calls = []
  const session = {
    inbox: { 'next-turn': [], 'next-step': [{ id: 'a' }, { id: 'b' }] },
    append(type, data) { calls.push({ type, data }); return { type, data } },
  }
  const message = buildRecallMessage('hi')

  spliceInbox(session, message, { target: 'next-step' })
  assert.equal(calls[0].data.target, 'next-step')
  assert.equal(calls[0].data.start, 2)
  assert.equal(calls[0].data.inserted[0].id, message.id)

  spliceInbox(session, message, { target: 'next-step', index: 0 })
  assert.equal(calls[1].data.start, 0)
})

test('spliceInbox degrades when the session cannot append', () => {
  assert.equal(spliceInbox({}, buildRecallMessage('x')), null)
  assert.equal(spliceInbox(null, buildRecallMessage('x')), null)
})
