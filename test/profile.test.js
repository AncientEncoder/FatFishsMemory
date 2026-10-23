import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyProfile, addFact, renderProfileCard, renderProfileMarkdown } from '../src/profile.js'

test('empty profile renders nothing', () => {
  assert.equal(renderProfileCard(emptyProfile()), '')
})

test('facts land in sections and duplicates are folded', () => {
  const p = emptyProfile()
  addFact(p, 'preferences', '喜欢简洁的回答')
  addFact(p, 'preferences', '喜欢简洁的回答')
  addFact(p, 'habits', '11 点睡')
  assert.equal(p.sections.preferences.length, 1)
  assert.equal(p.sections.preferences[0].hits, 2)
  assert.equal(p.sections.habits.length, 1)
})

test('card only shows sections with content', () => {
  const p = emptyProfile()
  addFact(p, 'emotions', '最近在准备一个考试')
  const card = renderProfileCard(p)
  assert.ok(card.includes('情绪'))
  assert.ok(!card.includes('偏好'))
})

test('markdown view lists every section', () => {
  const p = emptyProfile()
  addFact(p, 'projects', '给投影仪配 NAS')
  const md = renderProfileMarkdown(p)
  assert.ok(md.includes('## 在做的事'))
  assert.ok(md.includes('给投影仪配 NAS'))
})

test('unknown section throws', () => {
  assert.throws(() => addFact(emptyProfile(), 'nope', 'x'))
})