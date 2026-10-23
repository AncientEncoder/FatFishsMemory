import { keywordsOf } from './compact.js'

/**
 * Cue-based recall. Human memory is associative: we look for overlap between
 * what is being said now and what was said before. This is a deliberately
 * simple lexical scorer (BM25-flavoured), meant to be replaced by embeddings
 * later without changing the call sites.
 */
export function scoreCard(card, query) {
  const qWords = new Set(keywordsOf(query, 12))
  if (qWords.size === 0) return 0
  let score = 0
  for (const keyword of card.keywords || []) {
    if (qWords.has(keyword)) score += 2
  }
  const title = String(card.title || '')
  for (const word of qWords) {
    if (title.includes(word)) score += 3
  }
  for (const point of card.points || []) {
    for (const word of qWords) {
      if (point.includes(word)) score += 1
    }
  }
  // small recency nudge: newer cards win ties
  return score
}

export function recall(cards, query, limit = 3, minScore = 2) {
  return (cards || [])
    .map((card, index) => ({ card, index, score: scoreCard(card, query) }))
    .filter((hit) => hit.score >= minScore)
    .sort((a, b) => b.score - a.score || b.index - a.index)
    .slice(0, limit)
    .map((hit) => hit.card)
}

export function buildRecallBlock(cards, { maxChars = 600 } = {}) {
  if (!cards || cards.length === 0) return ''
  const lines = ['[回忆] 你之前经历过这些（细节在磁盘上，需要时可展开）：']
  for (const card of cards) {
    lines.push(`- ${card.date} ${card.title}`)
    for (const point of (card.points || []).slice(0, 2)) lines.push(`  · ${point}`)
  }
  let text = lines.join('\n')
  if (text.length > maxChars) text = `${text.slice(0, maxChars)}…`
  return text
}