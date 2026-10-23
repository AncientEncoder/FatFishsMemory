import fs from 'node:fs'
import path from 'node:path'
import { ensureDir, sessionDir } from './store.js'

// DSH already compacts context natively (compaction/start|prune|summary|end).
// We do not re-implement it: we record what it decided to throw away, so the
// archive can be searched later. Payload shapes are still being discovered, so
// every event is stored raw and defensively.

const COMPACTION_EVENTS = new Set([
  'compaction/start',
  'compaction/prune',
  'compaction/summary',
  'compaction/end',
])

export function isCompactionEvent(type) {
  return COMPACTION_EVENTS.has(type)
}

export function recordCompaction(root, sessionId, event, workspace) {
  const dir = sessionDir(root, sessionId, workspace)
  ensureDir(dir)
  const line = JSON.stringify({
    type: event.type,
    seq: event.seq,
    ts: new Date().toISOString(),
    data: event.data ?? null,
  })
  fs.appendFileSync(path.join(dir, 'compactions.jsonl'), `${line}\n`, 'utf8')
}

export function readCompactions(root, sessionId, workspace) {
  const file = path.join(sessionDir(root, sessionId, workspace), 'compactions.jsonl')
  if (!fs.existsSync(file)) return []
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line) } catch { return null }
    })
    .filter(Boolean)
}