#!/usr/bin/env node
/**
 * 补历史缺口（手动版）。插件加载时也会自愈，这个用于停机批量修。
 *
 *   node tools/backfill.mjs --dry-run
 *   node tools/backfill.mjs --apply
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { uncoveredTurns, fillGaps } from '../src/backfill.js'

const ROOT = process.env.DSH_FATFISH_DIR || path.join(os.homedir(), '.dsh', 'fatfish-memory')
const APPLY = process.argv.includes('--apply')
const MAX_TURNS = Number(process.env.FFM_MAX_TURNS || 12)

function readTurns(file) {
  if (!fs.existsSync(file)) return []
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => {
    try { return JSON.parse(l) } catch { return null }
  }).filter(Boolean)
}

let totalCards = 0
let totalTurns = 0
for (const ws of fs.existsSync(ROOT) ? fs.readdirSync(ROOT, { withFileTypes: true }) : []) {
  if (!ws.isDirectory() || ws.name.startsWith('_')) continue
  for (const s of fs.readdirSync(path.join(ROOT, ws.name), { withFileTypes: true })) {
    if (!s.isDirectory()) continue
    const dir = path.join(ROOT, ws.name, s.name)
    const indexPath = path.join(dir, 'index.json')
    if (!fs.existsSync(indexPath)) continue
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'))
    const turns = readTurns(path.join(dir, 'turns.jsonl'))
    const missing = uncoveredTurns(index, turns)
    if (!missing.length) continue
    const { index: next, changed } = fillGaps(index, turns, { maxTurns: MAX_TURNS })
    console.log(`${ws.name}/${s.name}: 缺口 ${missing.length} 轮 → 补 ${changed} 张卡`)
    if (APPLY) fs.writeFileSync(indexPath, JSON.stringify(next, null, 2), 'utf8')
    totalCards += changed
    totalTurns += missing.length
  }
}

console.log(APPLY ? `\n已补 ${totalCards} 张卡，覆盖 ${totalTurns} 轮` : `\n这是 dry-run（可补 ${totalCards} 张 / ${totalTurns} 轮），加 --apply 才会写`)
