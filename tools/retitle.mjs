#!/usr/bin/env node
/**
 * 回填卡片标题（手动版）。
 *
 * 平时不需要它——插件加载时会自动自愈（见 src/retitle.js）。
 * 这个工具用于：停机时批量修、或者只想看会改什么。
 *
 *   node tools/retitle.mjs --dry-run
 *   node tools/retitle.mjs --apply
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { retitleIndex } from '../src/retitle.js'

const ROOT = process.env.DSH_FATFISH_DIR || path.join(os.homedir(), '.dsh', 'fatfish-memory')
const APPLY = process.argv.includes('--apply')

function readTurns(file) {
  if (!fs.existsSync(file)) return []
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => {
    try { return JSON.parse(l) } catch { return null }
  }).filter(Boolean)
}

let total = 0
for (const ws of fs.existsSync(ROOT) ? fs.readdirSync(ROOT, { withFileTypes: true }) : []) {
  if (!ws.isDirectory() || ws.name.startsWith('_')) continue
  for (const s of fs.readdirSync(path.join(ROOT, ws.name), { withFileTypes: true })) {
    if (!s.isDirectory()) continue
    const dir = path.join(ROOT, ws.name, s.name)
    const indexPath = path.join(dir, 'index.json')
    if (!fs.existsSync(indexPath)) continue
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'))
    const turns = readTurns(path.join(dir, 'turns.jsonl'))
    const { index: next, changed } = retitleIndex(index, turns)
    if (!changed) continue
    console.log(`\n${ws.name}/${s.name}: ${changed} 张`)
    for (let i = 0; i < (index.entries || []).length; i++) {
      const before = index.entries[i]
      const after = next.entries[i]
      if (before.title !== after.title) console.log(`  ${before.from}→${before.to}  「${before.title}」 → 「${after.title}」`)
    }
    if (APPLY) fs.writeFileSync(indexPath, JSON.stringify(next, null, 2), 'utf8')
    total += changed
  }
}

console.log(`\n${APPLY ? `已改 ${total} 张` : `这是 dry-run（会改 ${total} 张），加 --apply 才会写`}`)
