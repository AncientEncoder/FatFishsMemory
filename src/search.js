import { keywordsOf, makeCard } from './compact.js'

/**
 * 检索层。
 * 两端：卡片（粗粒度，已经是摘要）和原始轮次（细粒度，能翻出原话）。
 * 打分方式是有意的简化版 BM25：关键词命中 + 词组命中 + 时间衰减。
 */

function scoreText(text, qWords, qRaw) {
  const haystack = String(text || '')
  const lower = haystack.toLowerCase()
  let score = 0

  // 原句片段命中最值钱（"zstd 多帧" 这种组合，拆词会散）
  if (qRaw && lower.includes(qRaw.toLowerCase())) score += 6

  for (const word of qWords) {
    if (!lower.includes(word.toLowerCase())) continue
    score += 2
    // 出现多次，最多再加 2
    const hits = lower.split(word.toLowerCase()).length - 1
    score += Math.min(2, hits - 1)
  }
  return score
}

export function searchTurns(turns, query, { limit = 5, minScore = 2 } = {}) {
  const qRaw = String(query || '').trim()
  const qWords = keywordsOf(qRaw, 12)
  if (!qWords.length && !qRaw) return []

  const hits = []
  for (const turn of turns) {
    const text = `${turn.user || ''}\n${turn.assistant || ''}`
    const score = scoreText(text, qWords, qRaw)
    if (score < minScore) continue
    hits.push({ turn: turn.turn, ts: turn.ts, score, text })
  }
  return hits.sort((a, b) => b.score - a.score || (b.turn || 0) - (a.turn || 0)).slice(0, limit)
}

export function searchCards(cards, query, { limit = 3, minScore = 2 } = {}) {
  const qRaw = String(query || '').trim()
  const qWords = keywordsOf(qRaw, 12)
  if (!qWords.length && !qRaw) return []

  const hits = []
  for (const card of cards || []) {
    const text = [card.title, ...(card.points || []), ...(card.keywords || [])].join(' ')
    let score = scoreText(text, qWords, qRaw)
    if (score > 0) score += 1 // 卡片本身就是提炼过的，命中优先
    if (score < minScore) continue
    hits.push({ card, score })
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit)
}

/** 生成卡片索引的便捷函数（供 CLI / 测试用，不写盘）。 */
export function buildCardFromTurns(turns) {
  return makeCard(turns, { from: turns[0]?.turn, to: turns[turns.length - 1]?.turn })
}

export function snippet(text, query, width = 90) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim()
  const qWords = keywordsOf(String(query || ''), 6)
  let at = -1
  for (const word of qWords) {
    const i = flat.toLowerCase().indexOf(word.toLowerCase())
    if (i >= 0 && (at < 0 || i < at)) at = i
  }
  if (at < 0) return flat.slice(0, width) + (flat.length > width ? '…' : '')
  const start = Math.max(0, at - Math.floor(width / 3))
  const end = Math.min(flat.length, start + width)
  return `${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`
}
