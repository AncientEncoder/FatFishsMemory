import fs from 'node:fs'
import path from 'node:path'

export function sessionDir(root, sessionId) {
  const safe = String(sessionId).replace(/[^a-zA-Z0-9._-]/g, '_')
  return path.join(root, safe)
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

export function appendTurn(root, sessionId, turn) {
  const dir = sessionDir(root, sessionId)
  ensureDir(dir)
  const line = JSON.stringify(turn) + '\n'
  fs.appendFileSync(path.join(dir, 'turns.jsonl'), line, 'utf8')
}

export function readTurns(root, sessionId) {
  const file = path.join(sessionDir(root, sessionId), 'turns.jsonl')
  if (!fs.existsSync(file)) return []
  return fs.readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line) } catch { return null }
    })
    .filter(Boolean)
}

export function readIndex(root, sessionId) {
  const file = path.join(sessionDir(root, sessionId), 'index.json')
  if (!fs.existsSync(file)) return { entries: [] }
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return { entries: [] } }
}

export function writeIndex(root, sessionId, index) {
  const dir = sessionDir(root, sessionId)
  ensureDir(dir)
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(index, null, 2), 'utf8')
}