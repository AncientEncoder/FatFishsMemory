/**
 * 补缺口：封卡时"只封最近 N 轮"会跳过中间那段（游标却跳过去了），
 * 这些轮次就永远没有卡。这里按顺序把它们补成 fallback 卡。
 *
 * 和 retitle 一样在加载时自愈，不需要人工跑脚本。
 */
import { sealOverflow } from './task.js'

/** 找出没被任何卡覆盖的轮次。 */
export function uncoveredTurns(index, turns) {
  const covered = new Set()
  for (const card of index?.entries || []) {
    const from = Number(card.from) || 0
    const to = Number(card.to) || 0
    for (let i = from; i <= to; i++) covered.add(i)
  }
  return (Array.isArray(turns) ? turns : []).filter((t) => Number.isFinite(t?.turn) && !covered.has(t.turn))
}

/**
 * @returns {{index: object, changed: number}}
 */
export function fillGaps(index, turns, { maxTurns = 12, maxCards = 200, now = new Date() } = {}) {
  const entries = Array.isArray(index?.entries) ? index.entries.slice() : []
  if (!entries.length) return { index, changed: 0 }

  const missing = uncoveredTurns(index, turns).sort((a, b) => a.turn - b.turn)
  if (!missing.length) return { index, changed: 0 }

  // 连续段切成不超过 maxTurns 的块
  const chunks = []
  let current = []
  for (const t of missing) {
    const prev = current[current.length - 1]
    const contiguous = !prev || t.turn === prev.turn + 1
    if (current.length >= maxTurns || !contiguous) {
      if (current.length) chunks.push(current)
      current = []
    }
    current.push(t)
  }
  if (current.length) chunks.push(current)

  let changed = 0
  for (const chunk of chunks.slice(0, maxCards)) {
    const sealed = sealOverflow(chunk, { maxTurns: chunk.length, now })
    if (!sealed) continue
    entries.push(sealed.card)
    changed += 1
  }
  if (!changed) return { index, changed: 0 }

  entries.sort((a, b) => (Number(a.from) || 0) - (Number(b.from) || 0))
  return { index: { ...index, entries }, changed }
}
