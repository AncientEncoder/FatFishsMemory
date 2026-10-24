import test from 'node:test'
import assert from 'node:assert/strict'
import { makeDelta, applyDelta, pickBase } from '../src/delta.js'

const long = (n) => '开头一段固定的话'.repeat(n)

test('similar texts produce a delta that round-trips', () => {
  const base = long(10) + '中间是旧的结论' + '结尾也固定'.repeat(5)
  const next = long(10) + '中间是新的结论，改了两句' + '结尾也固定'.repeat(5)
  const delta = makeDelta(base, next)
  assert.ok(delta, 'should produce a delta')
  assert.ok(delta.saved > 0.4)
  assert.equal(applyDelta(base, delta), next)
})

test('unrelated texts are not delta-encoded', () => {
  const a = '服务器 ssh 连不上，先看 22 端口和 sshd 状态'.repeat(4)
  const b = '今天玩如龙零，真岛线很好看，夜总会经营也上瘾'.repeat(4)
  assert.equal(makeDelta(a, b), null)
})

test('short texts are stored as-is', () => {
  assert.equal(makeDelta('短', '短一点'), null)
})

test('a delta with tiny savings is rejected', () => {
  const base = 'a'.repeat(100)
  const next = 'a'.repeat(50) + 'b'.repeat(50)
  const delta = makeDelta(base, next)
  // 共享前缀 50，中间 50，省 50% —— 刚好过线；改成几乎不省的情况：
  const noSave = makeDelta('x'.repeat(50), 'y'.repeat(100))
  assert.equal(noSave, null)
  if (delta) assert.equal(applyDelta(base, delta), next)
})

test('pickBase chooses the longest shared prefix', () => {
  const text = '共同开头共同开头共同开头，然后不一样'
  const best = pickBase([
    { text: '完全无关的内容', turn: 1 },
    { text: '共同开头共同开头，别的分支', turn: 2 },
    { text: '共同开头共同开头共同开头，几乎一样', turn: 3 },
  ], text)
  assert.equal(best.ref.turn, 3)
})

test('empty inputs do not throw', () => {
  assert.equal(makeDelta('', 'x'), null)
  assert.equal(makeDelta('x', ''), null)
  assert.equal(applyDelta('', null), '')
})
