import fs from 'node:fs'
import path from 'node:path'
import { safeReadJson } from './safety.js'

function sanitize(value) {
  return String(value ?? '').replace(/[^a-zA-Z0-9._-]/g, '_') || '_'
}

/** 工作区名：取 cwd 的最后一段，做安全化处理。 */
export function workspaceSlug(cwd) {
  if (!cwd) return '_unknown'
  const base = String(cwd).split(/[\\/]/u).filter(Boolean).pop() || '_unknown'
  return sanitize(base)
}

/**
 * 目录布局：
 *   <root>/profile.json
 *   <root>/<workspace>/<sessionId>/...
 * workspace 省略时退回平铺（兼容旧布局）。
 */
export function sessionDir(root, sessionId, workspace) {
  const safeId = sanitize(sessionId)
  if (!workspace) return path.join(root, safeId)
  return path.join(root, sanitize(workspace), safeId)
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

export function appendTurn(root, sessionId, turn, workspace) {
  const dir = sessionDir(root, sessionId, workspace)
  ensureDir(dir)
  const line = JSON.stringify(turn) + '\n'
  fs.appendFileSync(path.join(dir, 'turns.jsonl'), line, 'utf8')
}

export function readTurns(root, sessionId, workspace) {
  const file = path.join(sessionDir(root, sessionId, workspace), 'turns.jsonl')
  if (!fs.existsSync(file)) return []
  return fs.readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line) } catch { return null }
    })
    .filter(Boolean)
}

export function readIndex(root, sessionId, workspace) {
  const file = path.join(sessionDir(root, sessionId, workspace), 'index.json')
  const { value } = safeReadJson(file, { entries: [] })
  if (!value || typeof value !== 'object') return { entries: [] }
  if (!Array.isArray(value.entries)) value.entries = []
  return value
}

export function writeIndex(root, sessionId, index, workspace) {
  const dir = sessionDir(root, sessionId, workspace)
  ensureDir(dir)
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(index, null, 2), 'utf8')
}

/**
 * 把超出保留上限的老卡片挪进 archive/。
 * 只移动、不删除——需要考古时还能翻。
 */
export function archiveCards(root, sessionId, cards, workspace) {
  const dir = path.join(sessionDir(root, sessionId, workspace), 'archive')
  ensureDir(dir)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = path.join(dir, `cards-${stamp}.json`)
  fs.writeFileSync(file, JSON.stringify({ archivedAt: new Date().toISOString(), cards }, null, 2), 'utf8')
  return file
}

// ---- user profile (per installation, not per session) ----

export function readProfile(root) {
  const { value } = safeReadJson(path.join(root, 'profile.json'), null)
  return value
}

export function writeProfile(root, profile) {
  ensureDir(root)
  fs.writeFileSync(path.join(root, 'profile.json'), JSON.stringify(profile, null, 2), 'utf8')
  return profile
}

/** 人类可读 + agent 可读的画像视图，替代原来的 splice 注入。 */
export function writeProfileMarkdown(root, markdown) {
  ensureDir(root)
  fs.writeFileSync(path.join(root, 'profile.md'), markdown, 'utf8')
}
