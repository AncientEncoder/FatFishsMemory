#!/usr/bin/env node
/**
 * 从本地记忆里翻东西。
 *
 *   node tools/recall.mjs "zstd 多帧"
 *   node tools/recall.mjs --session session-xxxx "白屏"
 *   node tools/recall.mjs --list          # 看看有哪些会话
 *   node tools/recall.mjs --cards         # 只看记忆卡
 */
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = process.env.DSH_FATFISH_DIR || path.join(os.homedir(), '.dsh', 'fatfish-memory')
const SRC = pathToFileURL(path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'src')).href

const { readTurns, readIndex } = await import(`${SRC}/store.js`)
const { searchTurns, searchCards, snippet } = await import(`${SRC}/search.js`)

const args = process.argv.slice(2)
const flags = new Set(args.filter((a) => a.startsWith('--')))
const positional = args.filter((a) => !a.startsWith('--'))
const sessionFlag = args.indexOf('--session')
const sessionArg = sessionFlag >= 0 ? args[sessionFlag + 1] : null
const query = positional.filter((p) => p !== sessionArg).join(' ').trim()

import fs from 'node:fs'

function listSessions() {
  const out = []
  if (!fs.existsSync(ROOT)) return out
  for (const ws of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (!ws.isDirectory() || ws.name.startsWith('_')) continue
    for (const s of fs.readdirSync(path.join(ROOT, ws.name), { withFileTypes: true })) {
      if (!s.isDirectory()) continue
      out.push({ workspace: ws.name, session: s.name })
    }
  }
  return out
}

if (flags.has('--list')) {
  const list = listSessions()
  if (!list.length) console.log('还没有任何会话记录')
  for (const s of list) console.log(`${s.workspace}/${s.session}`)
  process.exit(0)
}

if (!query) {
  console.log('用法: node tools/recall.mjs "关键词" [--session <id>] [--cards]')
  process.exit(1)
}

const targets = sessionArg
  ? listSessions().filter((s) => s.session.includes(sessionArg))
  : listSessions()

if (!targets.length) {
  console.log('没有找到匹配的会话')
  process.exit(1)
}

for (const target of targets) {
  const turns = readTurns(ROOT, target.session, target.workspace)
  const index = readIndex(ROOT, target.session, target.workspace)
  const cardHits = flags.has('--cards') ? searchCards(index.entries, query) : searchCards(index.entries, query, { limit: 1 })
  const turnHits = flags.has('--cards') ? [] : searchTurns(turns, query, { limit: 4 })

  if (!cardHits.length && !turnHits.length) continue

  console.log(`\n=== ${target.workspace} / ${target.session} （${turns.length} 轮）===`)
  for (const hit of cardHits) {
    console.log(`  [卡] ${hit.card.date} ${hit.card.title}  (score ${hit.score})`)
    for (const p of (hit.card.points || []).slice(0, 2)) console.log(`        · ${p}`)
  }
  for (const hit of turnHits) {
    const when = hit.ts ? new Date(hit.ts).toLocaleString('zh-CN') : '-'
    console.log(`  [轮 ${hit.turn}] ${when}  (score ${hit.score})`)
    console.log(`        ${snippet(hit.text, query)}`)
  }
}
