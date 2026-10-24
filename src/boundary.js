import { keywordsOf } from './compact.js'

/**
 * 任务边界检测。
 *
 * 压缩时不能永远"对半切"——那会把一件事劈成两半。
 * 这里用三个廉价信号找自然断点：
 *
 *   1. 话题漂移：前后两轮的关键词重合度突然变低
 *   2. 收尾语：上一轮回答里出现"完成/好了/搞定"
 *   3. 时间间隔：两轮之间隔了二十分钟以上
 *
 * 都没有明显信号时，退回对半切——宁可切得笨，也不要切错。
 */

const COMPLETION = /(完成|已就绪|搞定了|搞定|好了|结束了|通过了|都行|OK|done|fixed|works)/iu
const GAP_MS = 20 * 60 * 1000

/** 任务是否收尾——"目标达成即封卡"用它判断。 */
export function isCompletion(text) {
  return COMPLETION.test(String(text || ''))
}

function textOf(turn) {
  return `${turn?.user || ''} ${turn?.assistant || ''}`
}

/** 关键词重合度（0~1），越低说明话题变得越快。 */
export function topicOverlap(left, right, limit = 10) {
  const a = new Set(keywordsOf(textOf(left), limit))
  const b = new Set(keywordsOf(textOf(right), limit))
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const word of a) if (b.has(word)) shared += 1
  return shared / Math.min(a.size, b.size)
}

/** 在每个可能的位置 i（准备把 turns[0..i) 切出去）打分。 */
export function boundaryScores(turns) {
  const list = Array.isArray(turns) ? turns : []
  const scores = []
  for (let i = 1; i < list.length; i += 1) {
    const prev = list[i - 1]
    const next = list[i]
    const overlap = topicOverlap(prev, next)
    let score = 1 - overlap
    // 收尾语单独出现（话题没变）也要够得着阈值，所以给 0.8
    if (prev?.assistant && COMPLETION.test(prev.assistant)) score += 0.8
    if (prev?.ts && next?.ts && next.ts - prev.ts > GAP_MS) score += 0.9
    scores.push({ index: i, score, overlap })
  }
  return scores
}

/**
 * 找一个合适的切点。
 * @returns {{ index: number, reason: string, score: number }}
 */
export function findBoundary(turns, { minTurns = 2, maxTurns, threshold = 0.78 } = {}) {
  const list = Array.isArray(turns) ? turns : []
  const n = list.length
  if (n < minTurns * 2) {
    const half = Math.floor(n / 2)
    return { index: half, reason: 'too-short', score: 0 }
  }

  const lo = Math.max(1, minTurns)
  const hi = Math.min(maxTurns ?? n - minTurns, n - 1)
  let best = null
  for (const entry of boundaryScores(list)) {
    if (entry.index < lo || entry.index > hi) continue
    if (!best || entry.score > best.score) best = entry
  }

  if (best && best.score >= threshold) {
    return { index: best.index, reason: 'detected', score: best.score }
  }
  const half = Math.floor(n / 2)
  return { index: half, reason: 'fallback', score: best?.score ?? 0 }
}
