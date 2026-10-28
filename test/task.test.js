import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldSeal, sealTask, sealOverflow } from '../src/task.js'

const turn = (n, user, assistant) => ({ turn: n, user, assistant, ts: 1700000000000 + n })

const done = [
  turn(1, '帮我装一下插件', '先看 profile 的 bundles'),
  turn(2, '装好了吗', '装好了，配置也写上了'),
  turn(3, '验证一下', '验证通过，全部完成'),
]
const ongoing = [
  turn(1, '帮我装一下插件', '先看 profile 的 bundles'),
  turn(2, '还是不行', '我再查一下日志'),
  turn(3, '好', '继续看'),
]

test('a completed task seals', () => {
  assert.equal(shouldSeal(done, { minTurns: 3 }), true)
})

test('an unfinished task does not seal', () => {
  assert.equal(shouldSeal(ongoing, { minTurns: 3 }), false)
})

test('too few turns does not seal even if completed', () => {
  assert.equal(shouldSeal([turn(1, '装个东西', '好了，完成')], { minTurns: 3 }), false)
})

test('tools-only span does not seal (no user speech)', () => {
  const span = [
    turn(1, '', '正在执行'),
    turn(2, '', '继续执行'),
    turn(3, '', '全部完成'),
  ]
  assert.equal(shouldSeal(span, { minTurns: 3 }), false)
})

test('sealed card carries goal, outcome and cut=task', () => {
  const sealed = sealTask(done, { minTurns: 3 })
  assert.ok(sealed)
  assert.equal(sealed.card.cut, 'task')
  assert.equal(sealed.from, 1)
  assert.equal(sealed.to, 3)
  assert.equal(sealed.card.goal, '帮我装一下插件')
  assert.match(sealed.card.outcome, /验证通过/)
})

test('null input is safe', () => {
  assert.equal(shouldSeal(null), false)
  assert.equal(sealTask(null), null)
})

test('a long pending span is capped to the newest turns', () => {
  const many = Array.from({ length: 40 }, (_, i) => turn(i + 1, `第 ${i + 1} 件事`, i === 39 ? '全部完成' : '继续'))
  const sealed = sealTask(many, { minTurns: 3, maxTurns: 12 })
  assert.ok(sealed)
  assert.equal(sealed.card.span, 12)
  assert.equal(sealed.to, 40)
  assert.equal(sealed.from, 29) // 40-12+1
})

test('overflow seal works when there is no completion cue at all', () => {
  const chat = Array.from({ length: 20 }, (_, i) => turn(i + 1, `闲聊第 ${i + 1} 句`, '嗯'))
  assert.equal(sealTask(chat, { minTurns: 3 }), null) // 没有完成语 → 正常路径不封
  const sealed = sealOverflow(chat, { maxTurns: 12 })
  assert.ok(sealed)
  assert.equal(sealed.card.cut, 'fallback')
  assert.equal(sealed.card.span, 12)
  assert.equal(sealed.to, 20)
  assert.equal(sealed.from, 9)
})

test('overflow seal handles empty input', () => {
  assert.equal(sealOverflow([]), null)
  assert.equal(sealOverflow(null), null)
})
