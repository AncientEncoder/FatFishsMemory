import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { appendTurn, readTurns, readIndex, writeIndex } from '../src/store.js'
import { estimateTokens, pressureOf } from '../src/pressure.js'

test('appendTurn + readTurns round trip', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ffm-'))
  appendTurn(root, 's1', { turn: 1, user: '你好', assistant: '在的' })
  appendTurn(root, 's1', { turn: 2, user: '再见', assistant: '拜拜' })
  const turns = readTurns(root, 's1')
  assert.equal(turns.length, 2)
  assert.equal(turns[0].user, '你好')
})

test('index read/write', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ffm-'))
  writeIndex(root, 's2', { entries: [{ title: 't', date: '2026-10-23' }] })
  const index = readIndex(root, 's2')
  assert.equal(index.entries.length, 1)
})

test('token estimate and pressure', () => {
  assert.ok(estimateTokens('你好世界') > 0)
  assert.equal(pressureOf(524288, 1048576), 0.5)
})

test('repetitive assistant text is stored as a delta and still reads back', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ffm-'))
  const head = '这是一段固定开头，用来模拟重复的模板内容。'.repeat(8)
  const tail = '结尾同样固定，只有中间会变。'.repeat(6)
  const first = `${head}第一轮的结论在这里${tail}`
  const second = `${head}第二轮的结论完全不同，长度差不多${tail}`

  appendTurn(root, 's3', { turn: 1, user: '问题一', assistant: first })
  appendTurn(root, 's3', { turn: 2, user: '问题二', assistant: second })

  const raw = fs.readFileSync(path.join(root, 's3', 'turns.jsonl'), 'utf8').trim().split('\n')
  const secondRecord = JSON.parse(raw[1])
  assert.ok(secondRecord.assistantDelta, 'second turn should be delta-encoded')

  const turns = readTurns(root, 's3')
  assert.equal(turns[1].assistant, second)
  assert.equal(turns[0].assistant, first)
})

test('plain turns from older versions still decode', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ffm-'))
  const dir = path.join(root, 'legacy')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'turns.jsonl'), JSON.stringify({ turn: 1, user: 'a', assistant: 'b' }) + '\n', 'utf8')
  const turns = readTurns(root, 'legacy')
  assert.equal(turns[0].assistant, 'b')
})