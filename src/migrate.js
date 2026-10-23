import fs from 'node:fs'
import path from 'node:path'

/**
 * 目录迁移。
 * 两条规则：
 * 1. 改了 dataDir 且新目录是空的 → 把旧目录整体复制过去（只复制，不删除原数据）
 * 2. 旧的平铺结构（root/session-*）→ 收进 root/_legacy/，不丢也不挡路
 */

export function isDirEmpty(dir) {
  try {
    return fs.readdirSync(dir).length === 0
  } catch {
    return true
  }
}

/** 只复制、不删除；目标已存在的文件不覆盖。 */
export function copyTree(from, to) {
  try {
    fs.cpSync(from, to, { recursive: true, force: false, errorOnExist: false })
    return true
  } catch {
    return false
  }
}

/**
 * dataDir 变更迁移：只有当目标为空、源存在时才搬。
 * 返回 { moved, reason }，调用方负责记日志。
 */
export function migrateToNewDataDir({ from, to, homeDir }) {
  if (!from || !to) return { moved: false, reason: 'missing-path' }
  if (path.resolve(from) === path.resolve(to)) return { moved: false, reason: 'same-path' }
  if (!fs.existsSync(from)) return { moved: false, reason: 'no-source' }
  if (!isDirEmpty(to)) return { moved: false, reason: 'target-not-empty' }
  const ok = copyTree(from, to)
  return { moved: ok, reason: ok ? 'copied' : 'copy-failed', from, to }
}

/**
 * 把旧的平铺会话目录收进 _legacy/，避免与新结构混淆。
 * 返回搬动的数量。
 */
export function collectLegacySessions(root) {
  let moved = 0
  let entries
  try {
    entries = fs.readdirSync(root, { withFileTypes: true })
  } catch {
    return 0
  }
  const legacyRoot = path.join(root, '_legacy')
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (!entry.name.startsWith('session-')) continue
    const from = path.join(root, entry.name)
    const to = path.join(legacyRoot, entry.name)
    try {
      fs.mkdirSync(legacyRoot, { recursive: true })
      if (fs.existsSync(to)) continue
      fs.renameSync(from, to)
      moved += 1
    } catch {
      /* 单个目录搬不动不影响其他 */
    }
  }
  return moved
}
