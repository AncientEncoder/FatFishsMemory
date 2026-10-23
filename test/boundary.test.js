import test from 'node:test'
import assert from 'node:assert/strict'
import { boundaryScores, findBoundary, topicOverlap } from '../src/boundary.js'

const turn = (n, user, assistant, ts) => ({ turn: n, user, assistant, ts })

test('identical topics overlap strongly', () => {
  const a = turn(1, '服务器 ssh 连不上', '先看 22 端口')
  const b = turn(2, '服务器 ssh 还是连不上', '再查 sshd 状态')
  assert.ok(topicOverlap(a, b) > 0.3)
})

test('a topic switch is found as the boundary', () => {
  const turns = [
    turn(1, '服务器 ssh 连不上', '先看 22 端口'),
    turn(2, '服务器 ssh 端口通了', '那就是 sshd 的问题'),
    turn(3, '今天玩某个游戏通关了', '某条线确实好看'),
    turn(4, '那个游戏的支线也很多', '支线内容很上瘾'),
  ]
  const result = findBoundary(turns, { minTurns: 2 })
  assert.equal(result.reason, 'detected')
  assert.equal(result.index, 2)
})

test('a completion phrase ends a task even on the same topic', () => {
  const turns = [
    turn(1, '把插件装上', '现在装'),
    turn(2, '装好了吗', '装好了，配置都写上了'),
    turn(3, '那再看看日志', '日志里没有报错'),
    turn(4, '日志里没有报错', '对，一切正常'),
  ]
  const result = findBoundary(turns, { minTurns: 2 })
  assert.equal(result.index, 2)
  assert.equal(result.reason, 'detected')
})

test('a long idle gap marks a boundary', () => {
  const hour = 60 * 60 * 1000
  const turns = [
    turn(1, '服务器 ssh 连不上', '先看端口', 1000),
    turn(2, '端口通了', '那就是 sshd', 2000),
    turn(3, '我又来了，接着看', '好', 2000 + hour),
    turn(4, '接着看什么', '看日志', 2000 + hour + 1000),
  ]
  const result = findBoundary(turns, { minTurns: 2 })
  assert.equal(result.index, 2)
})

test('uniform conversation falls back to half', () => {
  const turns = [
    turn(1, '服务器 ssh 连不上', '先看 22 端口'),
    turn(2, '服务器 ssh 还是连不上', '看看 sshd 状态'),
    turn(3, '服务器 ssh 状态正常', '那就是防火墙'),
    turn(4, '服务器 ssh 防火墙也正常', '再查路由'),
  ]
  const result = findBoundary(turns, { minTurns: 2 })
  assert.equal(result.reason, 'fallback')
  assert.equal(result.index, 2)
})

test('too-short input splits in half without detecting', () => {
  const turns = [turn(1, 'a', 'b'), turn(2, 'c', 'd')]
  const result = findBoundary(turns, { minTurns: 2 })
  assert.equal(result.reason, 'too-short')
  assert.equal(result.index, 1)
})

test('boundaries respect minTurns', () => {
  const turns = [
    turn(1, '服务器 ssh 连不上', '先看 22 端口'),
    turn(2, '今天玩某游戏', '某条线好看'),
    turn(3, '某游戏支线很多', '夜总会很上瘾'),
    turn(4, '某游戏打完了', '结局不错'),
    turn(5, '某游戏还有极二', '可以先玩别的'),
    turn(6, '评价一下某游戏', '值得一玩'),
  ]
  // 话题在 1→2 就断了，但那样只剩 1 轮，低于 minTurns=3，必须往后找
  const result = findBoundary(turns, { minTurns: 3 })
  assert.ok(result.index >= 3, `got ${result.index}`)
  assert.ok(result.index <= 3)
})

test('scores expose overlap for debugging', () => {
  const scores = boundaryScores([
    turn(1, '服务器 ssh', '端口'),
    turn(2, '某游戏真好玩', '确实'),
  ])
  assert.equal(scores.length, 1)
  assert.ok(typeof scores[0].overlap === 'number')
})
