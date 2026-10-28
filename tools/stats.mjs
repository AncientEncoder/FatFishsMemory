#!/usr/bin/env node
/**
 * 记忆库体检：看看它到底记住了什么、有没有漏洞。
 *
 *   node tools/stats.mjs
 *   node tools/stats.mjs --session <id>
 *
 * 读的是数据目录，不需要 DSH 在运行。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const ROOT = process.env.DSH_FATFISH_DIR || path.join(os.homedir(), '.dsh', 'fatfish-memory')
const argSession = process.argv.indexOf('--session') >= 0 ? process.argv[process.argv.indexOf('--session') + 1] : null

const kb = (n) => `${Math.round(n / 102.4) / 10} KB`
const mb = (n) => `${Math.round(n / 104857.6) / 10} MB`

function sessions() {
  const out = []
  if (!fs.existsSync(ROOT)) return out
  for (const ws of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (!ws.isDirectory() || ws.name.startsWith('_')) continue
    for (const s of fs.readdirSync(path.join(ROOT, ws.name), { withFileTypes: true })) {
      if (!s.isDirectory()) continue
      const dir = path.join(ROOT, ws.name, s.name)
      if (!fs.existsSync(path.join(dir, 'turns.jsonl'))) continue
      out.push({ workspace: ws.name, session: s.name, dir })
    }
  }
  return out
}

function sizeOf(dir) {
  let total = 0
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else total += fs.statSync(p).size
    }
  }
  walk(dir)
  return total
}

function readTurnsFile(dir) {
  const f = path.join(dir, 'turns.jsonl')
  if (!fs.existsSync(f)) return []
  return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean)
    .map((l) => { try { return JSON.parse(l) } catch { return null } })
    .filter(Boolean)
}

function readJson(dir, name) {
  const f = path.join(dir, name)
  if (!fs.existsSync(f)) return null
  try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return null }
}

const list = sessions().filter((s) => !argSession || s.session.includes(argSession))
if (!list.length) {
  console.log('还没有任何会话记录')
  process.exit(0)
}

for (const s of list) {
  const turns = readTurnsFile(s.dir)
  const index = readJson(s.dir, 'index.json') || { entries: [] }
  const cards = index.entries || []
  if (!turns.length && !cards.length) continue

  console.log(`\n=== ${s.workspace} / ${s.session} ===`)
  console.log(`轮次 ${turns.length} | 卡片 ${cards.length} | 体积 ${mb(sizeOf(s.dir))}`)

  // 卡片按切法统计
  const byCut = {}
  for (const c of cards) byCut[c.cut || '(早期)'] = (byCut[c.cut || '(早期)'] || 0) + 1
  console.log('切法: ' + Object.entries(byCut).map(([k, v]) => `${k}=${v}`).join('  '))

  // 覆盖：只算"真实存在的轮次"被覆盖了多少（turn 号可能有空洞）
  const covered = new Set()
  for (const c of cards) {
    for (let i = Number(c.from); i <= Number(c.to); i++) covered.add(i)
  }
  const allTurns = turns.map((t) => t.turn)
  const gaps = allTurns.filter((n) => !covered.has(n))
  const hit = allTurns.length - gaps.length
  const pct = allTurns.length ? Math.round((hit / allTurns.length) * 100) : 100
  console.log(`覆盖 ${hit}/${allTurns.length} 轮（${pct}%）` + (gaps.length ? ` | 未覆盖 ${gaps.length} 轮` : ' | 无缺口'))

  // 缺口分段
  if (gaps.length) {
    const ranges = []
    let start = gaps[0], prev = gaps[0]
    for (const n of gaps.slice(1)) {
      if (n === prev + 1) { prev = n; continue }
      ranges.push([start, prev]); start = n; prev = n
    }
    ranges.push([start, prev])
    const shown = ranges.slice(-5).map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`))
    console.log('最近缺口: ' + shown.join(', ') + (ranges.length > 5 ? ` …（共 ${ranges.length} 段）` : ''))
  }

  // 最近 5 张卡
  if (cards.length) {
    console.log('最近卡片:')
    for (const c of cards.slice(-5)) {
      console.log(`  ${c.date || ''} [${c.cut || '-'}] ${c.from}→${c.to} ${String(c.title || '').slice(0, 34)}`)
    }
  }
}

// 画像和人设是全局的，只打一次
const profile = readJson(ROOT, 'profile.json')
if (profile?.sections) {
  const counts = Object.entries(profile.sections).filter(([, v]) => v?.length).map(([k, v]) => `${k}=${v.length}`)
  console.log('\n画像: ' + (counts.join(' ') || '(空)'))
  const recent = profile.sections.recent?.[0]
  if (recent) console.log(`最近印象: ${recent.text}`)
}
if (fs.existsSync(path.join(ROOT, 'persona.md'))) console.log('人设: 有')

console.log(`\n数据目录 ${ROOT}`)
