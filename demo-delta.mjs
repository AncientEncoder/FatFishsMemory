import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { appendTurn, readTurns } from './src/store.js'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ffm-demo-'))
const head = '【部署报告】目标：把记忆插件更新到最新版。步骤：读取包信息、校验版本、写入配置、重启验证。'.repeat(3)
const tail = '\n以上步骤全部完成，未发现异常。'
const a = `${head}\n结论：第一轮验证通过，版本 0.6.0。${tail}`
const b = `${head}\n结论：第二轮验证通过，版本 0.6.0，另修复了一个节流小问题。${tail}`

appendTurn(root, 'demo', { turn: 1, user: '部署', assistant: a })
appendTurn(root, 'demo', { turn: 2, user: '再部署一次', assistant: b })

const raw = fs.readFileSync(path.join(root, 'demo', 'turns.jsonl'), 'utf8').trim().split('\n')
const r1 = JSON.parse(raw[0]); const r2 = JSON.parse(raw[1])
console.log('第 1 轮存了:', JSON.stringify(Object.keys(r1)))
console.log('第 2 轮存了:', JSON.stringify(Object.keys(r2)))
if (r2.assistantDelta) {
  const whole = JSON.stringify(b).length
  const packed = JSON.stringify(r2.assistantDelta).length
  console.log(`原文 ${b.length} 字 / ${whole} 字节`)
  console.log(`增量只存中间 ${r2.assistantDelta.mid.length} 字 / ${packed} 字节`)
  console.log(`省了 ${(100 - packed / whole * 100).toFixed(1)}%`)
}
const back = readTurns(root, 'demo')
console.log('读回一致:', back[0].assistant === a && back[1].assistant === b)
