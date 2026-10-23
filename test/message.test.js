import test from 'node:test'
import assert from 'node:assert/strict'
import { contentToText, messageText, turnNumber } from '../src/message.js'

test('plain text parts are joined', () => {
  const content = [
    { type: 'text', text: '你好' },
    { type: 'text', text: '世界' },
  ]
  assert.equal(contentToText(content), '你好世界')
})

test('reasoning blocks are dropped', () => {
  const content = [
    { type: 'reasoning', text: '我先想想……' },
    { type: 'text', text: '结论：可以的' },
  ]
  assert.equal(contentToText(content), '结论：可以的')
})

test('user/message shape: data IS the message', () => {
  const data = { id: 'm1', role: 'user', content: [{ type: 'text', text: '重启好了' }] }
  assert.equal(messageText(data), '重启好了')
})

test('assistant/message shape: data.message holds the message', () => {
  const data = { turn: 7, step: 2, message: { content: [{ type: 'text', text: '我看一下' }] } }
  assert.equal(messageText(data), '我看一下')
})

test('string content and missing content are safe', () => {
  assert.equal(contentToText('直接是字符串'), '直接是字符串')
  assert.equal(contentToText(undefined), '')
  assert.equal(messageText(null), '')
  assert.equal(messageText({}), '')
})

test('turnNumber prefers runtime turn', () => {
  assert.equal(turnNumber({ turn: 12 }, 1), 12)
  assert.equal(turnNumber({}, 5), 5)
  assert.equal(turnNumber(undefined, 3), 3)
})
