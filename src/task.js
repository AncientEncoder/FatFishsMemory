import { isCompletion } from './boundary.js'
import { makeCard } from './compact.js'

/**
 * 任务级压缩：一件事做完了，当场封卡，不等上下文压力。
 *
 * 判定"一件事"的规则（刻意保守）：
 *   1. 这一轮的回答明确收尾（完成/搞定/通过了…）
 *   2. 从上一个封卡点起，至少攒了 minTurns 轮
 *   3. 这段时间里用户说过话（不是纯工具空转）
 *
 * 不满足就继续攒——宁可晚点封，也不要封出一堆半截卡。
 */

export const DEFAULT_MIN_TURNS = 3

export function shouldSeal(turns, { minTurns = DEFAULT_MIN_TURNS } = {}) {
  const list = Array.isArray(turns) ? turns : []
  if (list.length < minTurns) return false
  const last = list[list.length - 1]
  if (!last?.assistant) return false
  if (!isCompletion(last.assistant)) return false
  // 至少有一轮用户真正说过话
  return list.some((t) => (t.user || '').trim().length > 0)
}

/**
 * 给一段"完整的活"做一张卡。
 * @returns {{card: object, from: number, to: number} | null}
 */
export function sealTask(turns, { minTurns = DEFAULT_MIN_TURNS, maxTurns = 12, now = new Date() } = {}) {
  if (!shouldSeal(turns, { minTurns })) return null
  // 只按最近这一段封卡：太长的跨度（比如隔了两天没封）不该变成一张巨卡。
  // 更早的轮次仍然留在 turns.jsonl 里，可检索。
  const slice = turns.slice(-maxTurns)
  const card = makeCard(slice, {
    from: slice[0]?.turn ?? 0,
    to: slice[slice.length - 1]?.turn ?? 0,
    now,
  })
  card.cut = 'task'
  card.cutScore = 1
  card.span = slice.length
  return { card, from: card.from, to: card.to }
}

/**
 * 兜底封卡：待压缩的轮次攒太多了（比如一直闲聊、从没出现完成语），
 * 也强行封一张，否则这段永远不会有摘要。
 *
 * 标记 cut='fallback'，跟"按边界对半切"一个待遇——**承认它切得不讲究**。
 */
export function sealOverflow(turns, { maxTurns = 12, now = new Date() } = {}) {
  const list = Array.isArray(turns) ? turns : []
  if (list.length === 0) return null
  const slice = list.slice(-maxTurns)
  const card = makeCard(slice, {
    from: slice[0]?.turn ?? 0,
    to: slice[slice.length - 1]?.turn ?? 0,
    now,
  })
  card.cut = 'fallback'
  card.cutScore = 0
  card.span = slice.length
  return { card, from: card.from, to: card.to }
}
