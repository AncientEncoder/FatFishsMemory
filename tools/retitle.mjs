#!/usr/bin/env node
/**
 * 回填卡片标题：把历史上那些"来吧""要""35米"改成真正有信息量的那句。
 *
 *   node tools/retitle.mjs --dry-run     # 只看会改什么
 *   node tools/retitle.mjs --apply       # 真改
 *
 * 注意：改的是 index.json，**请在 DSH 停止时执行**，否则运行中的插件会覆盖回去。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pickTitle } from '../src/compact.js'

const ROOT = process.env.DSH_FATFISH_DIR || path.join(os.homedir(), '.dsh', 'fatfish-memory')
const APPLY = process.argv.includes('--apply')

function readTurns(file) {
  if (!fs.existsSync(file)) return []
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => {
    try { return JSON.parse(l) } catch { return null }
  }).filter(Boolean)
}

const dirs = []
for (const ws of fs.existsSync(ROOT) ? fs.readdirSync(ROOT, { withFileTypes: true }) : []) {
  if (!ws.isDirectory() || ws.name.startsWith('_')) continue
  for (const s of fs.readdirSync(path.join(ROOT, ws.name), { withFileTypes: true })) {
    if (!s.isDirectory()) continue
    const dir = path.join(ROOT, ws.name, s.name)
    if (fs.existsSync(path.join(dir, 'index.json'))) dirs.push({ label: `${ws.name}/${s.name}`, dir })
  }
}

let changedTotal = 0
for (const { label, dir } of dirs) {
  const indexPath = path.join(dir, 'index.json')
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'))
  const cards = index.entries || []
  if (!cards.length) continue
  const turns = readTurns(path.join(dir, 'turns.jsonl'))
  const byTurn = new Map(turns.map((t) => [t.turn, t]))

  const changes = []
  for (const card of cards) {
    const old = String(card.title || '').trim()
    const slice = []
    for (let i = Number(card.from) || 0; i <= (Number(card.to) || 0); i++) {
      const t = byTurn.get(i)
      if (t) slice.push(t)
    }
    if (!slice.length) continue
    const next = pickTitle(slice)
    if (next !== old && (old.length < 4 || old === '(无标题)')) changes.push({ card, old, next })
  }

  if (!changes.length) continue
  console.log(`\n${label}: ${changes.length} 张要改`)
  for (const { old, next, card } of changes) {
    console.log(`  ${card.from}→${card.to}  「${old}」 → 「${next}」`)
  }
  if (APPLY) {
    for (const { card, next } of changes) card.title = next
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf8')
    changedTotal += changes.length
  }
}

console.log(`\n${APPLY ? `已改 ${changedTotal} 张` : '这是 dry-run，加 --apply 才会写'}`)
if (!APPLY) console.log('提示：请在 DSH 停止时执行 --apply，否则运行中的插件会覆盖。')
