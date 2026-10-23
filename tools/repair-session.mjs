#!/usr/bin/env node
/**
 * 修复被插件注入事件破坏的会话日志。
 *
 * 背景：插件往 session 里 splice 了一条 source.kind = "plugin:*" 的消息，
 * 客户端渲染对话流时无法处理，导致整个对话区空白。
 *
 * 做法：解析 zstd 多帧日志，把这类事件剔除，其余字节原样保留。
 * 用法：
 *   node repair-session.mjs <session.v4.jsonl.zstd> --dry-run
 *   node repair-session.mjs <session.v4.jsonl.zstd> --apply
 */
import fs from 'node:fs'
import zlib from 'node:zlib'

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

function splitFrames(buf) {
  const offsets = []
  let idx = 0
  while (true) {
    const i = buf.indexOf(MAGIC, idx)
    if (i < 0) break
    offsets.push(i)
    idx = i + 4
  }
  return offsets.map((start, k) => ({
    start,
    end: k + 1 < offsets.length ? offsets[k + 1] : buf.length,
  }))
}

function isInjected(event) {
  if (!event || event.type !== 'agent/inbox/spliced') return false
  const inserted = event.data?.inserted
  if (!Array.isArray(inserted)) return false
  return inserted.some((m) => typeof m?.source?.kind === 'string' && m.source.kind.startsWith('plugin:'))
}

function main() {
  const [file, mode] = process.argv.slice(2)
  if (!file || !['--dry-run', '--apply'].includes(mode)) {
    console.error('usage: node repair-session.mjs <session.v4.jsonl.zstd> --dry-run|--apply')
    process.exit(2)
  }

  const buf = fs.readFileSync(file)
  const frames = splitFrames(buf)
  const chunks = []
  let removed = 0
  let reencoded = 0
  let kept = 0

  for (const { start, end } of frames) {
    const raw = buf.subarray(start, end)
    let text
    try {
      text = zlib.zstdDecompressSync(raw).toString('utf8')
    } catch {
      // 解不开的帧原样保留，绝不猜
      chunks.push(raw)
      kept += 1
      continue
    }
    const lines = text.split('\n').filter(Boolean)
    const survivors = []
    for (const line of lines) {
      let event = null
      try { event = JSON.parse(line) } catch { event = null }
      if (isInjected(event)) {
        removed += 1
        continue
      }
      survivors.push(line)
    }
    if (survivors.length === lines.length) {
      chunks.push(raw)
      kept += 1
      continue
    }
    if (survivors.length === 0) {
      reencoded += 1
      continue
    }
    const next = zlib.zstdCompressSync(Buffer.from(`${survivors.join('\n')}\n`, 'utf8'))
    chunks.push(next)
    reencoded += 1
  }

  const out = Buffer.concat(chunks)
  console.log(`frames=${frames.length} kept=${kept} reencoded=${reencoded} removedEvents=${removed}`)
  console.log(`size ${buf.length} -> ${out.length}`)

  if (mode === '--dry-run') {
    // 验证重建结果仍可解析
    const check = splitFrames(out)
    let lines = 0
    for (const { start, end } of check) {
      try { lines += zlib.zstdDecompressSync(out.subarray(start, end)).toString('utf8').split('\n').filter(Boolean).length } catch {}
    }
    console.log(`verify: frames=${check.length} lines=${lines}`)
    console.log('dry-run: 未写入')
    return
  }

  const backup = `${file}.bak-${Date.now()}`
  fs.copyFileSync(file, backup)
  fs.writeFileSync(file, out)
  console.log(`applied. backup: ${backup}`)
}

main()
