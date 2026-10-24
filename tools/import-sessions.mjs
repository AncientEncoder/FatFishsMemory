#!/usr/bin/env node
/**
 * 把插件装上之前的历史会话导进记忆库。
 *
 * 数据源：~/.dsh/sessions/<工作区目录>/<sessionId>/session.v4.jsonl.zstd
 * 那是一种多帧拼接的 zstd：按 magic 切帧、逐帧解压。
 *
 *   node tools/import-sessions.mjs --dry-run
 *   node tools/import-sessions.mjs --apply
 *
 * 已经导过的（目标目录里已有 turns.jsonl）会跳过，可以反复跑。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'

const ROOT = process.env.DSH_FATFISH_DIR || path.join(os.homedir(), '.dsh', 'fatfish-memory')
const SESSIONS = path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'sessions')
const SKIP_KINDS = new Set(['runtime-context', 'skill-catalog', 'time-context', 'compaction', 'system-reminder'])

const sanitize = (v) => String(v ?? '').replace(/[^a-zA-Z0-9._-]/g, '_') || '_'
const workspaceSlug = (cwd) => (cwd ? sanitize(String(cwd).split(/[\\/]/u).filter(Boolean).pop()) : '_unknown')

function decodeZstdFrames(file) {
  const buf = fs.readFileSync(file)
  const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
  const frames = []
  let idx = 0
  while (true) {
    const i = buf.indexOf(magic, idx)
    if (i < 0) break
    frames.push(i)
    idx = i + 4
  }
  const events = []
  for (let k = 0; k < frames.length; k += 1) {
    const start = frames[k]
    const end = k + 1 < frames.length ? frames[k + 1] : buf.length
    try {
      const text = zlib.zstdDecompressSync(buf.subarray(start, end)).toString('utf8')
      for (const line of text.split('\n').filter(Boolean)) {
        try { events.push(JSON.parse(line)) } catch { /* 坏行跳过 */ }
      }
    } catch { /* 坏帧跳过 */ }
  }
  return events
}

function textOf(message) {
  const parts = message?.content || []
  return parts.filter((p) => p?.type === 'text' && p.text).map((p) => p.text).join('\n').trim()
}

function extractTurns(events, createdAt) {
  const turns = []
  let buf = { user: '', assistant: '', tools: [], turn: 0, ts: createdAt }
  let seq = 0
  for (const event of events) {
    seq += 1
    switch (event.type) {
      case 'turn/start':
        buf.assistant = ''
        buf.tools = []
        buf.turn = Number(event.data?.turn) || buf.turn + 1
        break
      case 'tool/call': {
        const name = event.data?.name
        if (typeof name === 'string' && name) buf.tools.push(name)
        break
      }
      case 'user/message': {
        const kind = event.data?.source?.kind
        if (SKIP_KINDS.has(kind)) break
        const text = textOf(event.data)
        if (text) buf.user = buf.user ? `${buf.user}\n${text}` : text
        break
      }
      case 'assistant/message': {
        const text = textOf(event.data?.message ?? event.data)
        if (text) buf.assistant = buf.assistant ? `${buf.assistant}\n${text}` : text
        break
      }
      case 'turn/end': {
        if (!buf.user && !buf.assistant) break
        turns.push({
          turn: Number(event.data?.turn) || buf.turn,
          seq,
          ts: Number(event.ts) || Number(event.data?.ts) || createdAt,
          user: buf.user,
          assistant: buf.assistant,
          tools: [...new Set(buf.tools)],
        })
        buf = { user: '', assistant: '', tools: [], turn: buf.turn, ts: createdAt }
        break
      }
      default:
        break
    }
  }
  // 没有 turn/end 的尾巴：只要有人话就保留
  if (buf.user || buf.assistant) {
    turns.push({ turn: buf.turn || turns.length + 1, seq, ts: createdAt, user: buf.user, assistant: buf.assistant, tools: [...new Set(buf.tools)] })
  }
  return turns.filter((t) => t.user || t.assistant)
}

function main() {
  const mode = process.argv[2]
  if (!['--dry-run', '--apply'].includes(mode)) {
    console.error('usage: node import-sessions.mjs --dry-run|--apply')
    process.exit(2)
  }
  if (!fs.existsSync(SESSIONS)) {
    console.error(`找不到会话目录: ${SESSIONS}`)
    process.exit(1)
  }

  const rows = []
  for (const dir of fs.readdirSync(SESSIONS, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue
    for (const sub of fs.readdirSync(path.join(SESSIONS, dir.name), { withFileTypes: true })) {
      if (!sub.isDirectory()) continue
      const file = path.join(SESSIONS, dir.name, sub.name, 'session.v4.jsonl.zstd')
      if (!fs.existsSync(file)) continue
      try {
        const events = decodeZstdFrames(file)
        const head = events.find((e) => e.type === 'session')
        const id = head?.id || sub.name
        const cwd = head?.cwd || ''
        const createdAt = Number(head?.createdAt) || Date.now()
        const turns = extractTurns(events, createdAt)
        if (!turns.length) continue
        rows.push({ id, cwd, workspace: workspaceSlug(cwd), turns })
      } catch (error) {
        console.error(`跳过 ${sub.name}: ${error.message}`)
      }
    }
  }

  let imported = 0
  let skipped = 0
  let totalTurns = 0
  for (const row of rows) {
    const dir = path.join(ROOT, row.workspace, sanitize(row.id))
    const target = path.join(dir, 'turns.jsonl')
    if (fs.existsSync(target)) {
      skipped += 1
      continue
    }
    totalTurns += row.turns.length
    imported += 1
    console.log(`[${mode === '--apply' ? '导入' : '将导入'}] ${row.workspace}/${row.id}: ${row.turns.length} 轮`)
    if (mode === '--apply') {
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(target, row.turns.map((t) => JSON.stringify(t)).join('\n') + '\n', 'utf8')
    }
  }

  console.log(`\n候选 ${rows.length} 个会话，导入 ${imported} 个（${totalTurns} 轮），跳过 ${skipped} 个已有归档`)
}

main()
