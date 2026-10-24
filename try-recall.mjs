import fs from 'node:fs'
import { buildRecallDigest } from './src/autorecall.js'
const root = process.env.USERPROFILE + '\\.dsh\\fatfish-memory\\default-workspace\\session-10d841fa-6514-4a8f-8bb2-6d4a3fe41e9f'
const turns = fs.readFileSync(root + '\\turns.jsonl','utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l))
const index = JSON.parse(fs.readFileSync(root + '\\index.json','utf8'))
for (const q of ['那天白屏到底是怎么搞的？', '上次说的那个 delta 怎么做的', '今天中午吃什么']) {
  const d = buildRecallDigest(q, { cards: index.entries || [], turns, limit: 3 })
  console.log('\n问：' + q)
  console.log(d.text || '（不查表 / 没命中）')
}
