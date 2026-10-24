import test from 'node:test'
import assert from 'node:assert/strict'
import { embed, cosine, similarity } from '../src/vectors.js'

test('identical text has similarity 1', () => {
  const v = embed('服务器 ssh 连不上')
  assert.ok(Math.abs(cosine(v, v) - 1) < 1e-6)
})

test('related text scores higher than unrelated', () => {
  const q = embed('服务器 ssh')
  const related = similarity(q, '服务器 sshd 状态')
  const unrelated = similarity(q, '今天玩如龙零通关了')
  assert.ok(related > unrelated, `related=${related} unrelated=${unrelated}`)
})

test('english words are tokenised', () => {
  const q = embed('zstd frame')
  assert.ok(similarity(q, 'zstd 多帧解析') > 0)
})

test('empty input does not blow up', () => {
  assert.equal(cosine(embed(''), embed('')), 0)
  assert.equal(cosine(embed('abc'), embed('')), 0)
})

test('similarity is bounded', () => {
  const q = embed('记忆 压缩')
  for (const text of ['记忆压缩', '完全不相干的内容', 'memory compression']) {
    const s = similarity(q, text)
    assert.ok(s >= 0 && s <= 1.0001, `got ${s} for ${text}`)
  }
})
