import test from 'node:test'
import assert from 'node:assert/strict'
import { detectRecentSignal, findStableFacts, applyStableFacts, applyRecentSignal } from '../src/impressions.js'
import { emptyProfile } from '../src/profile.js'

const turn = (user) => ({ user, assistant: '' })

test('time + mood cues produce a recent signal', () => {
  const signal = detectRecentSignal([turn('今天打了一天战争雷霆，好累')])
  assert.ok(signal)
  assert.match(signal.text, /战争雷霆/)
})

test('mood alone is enough', () => {
  const signal = detectRecentSignal([turn('有点焦虑，睡不着')])
  assert.ok(signal)
})

test('plain factual line is not a recent signal', () => {
  assert.equal(detectRecentSignal([turn('把 README 的章节改一下')]), null)
})

test('the newest qualifying line wins on ties', () => {
  const signal = detectRecentSignal([
    turn('今天好累'),
    turn('明天要去朋友家吃饭，有点期待'),
  ])
  assert.match(signal.text, /朋友家/)
})

test('repeated facts across cards become stable', () => {
  const cards = [
    { goal: '给投影仪配 NAS' },
    { goal: '给投影仪配 NAS' },
    { goal: '修一下白屏' },
  ]
  const facts = findStableFacts(cards)
  assert.ok(facts.some((f) => f.text.includes('NAS')))
  assert.ok(!facts.some((f) => f.text.includes('白屏')))
})

test('stable facts are classified into a section', () => {
  const facts = findStableFacts([
    { goal: '每天都在加班到十点' },
    { goal: '每天都在加班到十点' },
  ])
  assert.equal(facts[0].section, 'habits')
})

test('applying stable facts is idempotent', () => {
  const profile = emptyProfile()
  const facts = [{ section: 'projects', text: '给投影仪配 NAS', count: 2 }]
  assert.equal(applyStableFacts(profile, facts), 1)
  assert.equal(applyStableFacts(profile, facts), 0)
  assert.equal(profile.sections.projects.length, 1)
})

test('recent signal overwrites instead of accumulating', () => {
  const profile = emptyProfile()
  assert.equal(applyRecentSignal(profile, { text: '第一句' }), true)
  assert.equal(applyRecentSignal(profile, { text: '第二句' }), true)
  assert.equal(profile.sections.recent.length, 1)
  assert.equal(profile.sections.recent[0].text, '第二句')
})

test('identical recent signal is a no-op', () => {
  const profile = emptyProfile()
  applyRecentSignal(profile, { text: '同一句' })
  assert.equal(applyRecentSignal(profile, { text: '同一句' }), false)
})

test('empty or garbage input does not throw', () => {
  assert.equal(detectRecentSignal([]), null)
  assert.equal(detectRecentSignal(null), null)
  assert.deepEqual(findStableFacts(null), [])
  assert.equal(applyStableFacts(null, null), 0)
  assert.equal(applyRecentSignal(emptyProfile(), null), false)
})
