import { estimateTokens } from './pressure.js'

// Enough to keep card keywords meaningful without a tokenizer dependency.
const STOP = new Set([
  '的', '了', '是', '在', '我', '你', '他', '她', '它', '们', '这', '那', '有', '和', '就',
  '不', '也', '都', '还', '要', '会', '能', '把', '被', '给', '对', '从', '到', '一个',
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'is', 'are', 'was', 'for', 'it',
  'this', 'that', 'with', 'you', 'we', 'they', 'be', 'as', 'at', 'by', 'from',
])

const HAN = /[\p{Script=Han}]/u

/**
 * Keywords without a real tokenizer:
 * - latin runs split on non-word characters
 * - CJK runs emit 2-grams and 3-grams (Chinese has no spaces, so n-grams are
 *   the cheapest thing that still lets "服务器" and "服务" match each other)
 */
export function keywordsOf(text, limit = 8) {
  const counts = new Map()
  const bump = (word, weight = 1) => {
    if (!word || word.length < 2 || STOP.has(word)) return
    counts.set(word, (counts.get(word) || 0) + weight)
  }

  for (const run of String(text || '').split(/[^\p{Script=Han}\p{L}\p{N}_]+/u)) {
    if (!run) continue
    if (HAN.test(run)) {
      const chars = [...run]
      for (let i = 0; i < chars.length - 1; i += 1) bump(chars[i] + chars[i + 1])
      for (let i = 0; i < chars.length - 2; i += 1) bump(chars[i] + chars[i + 1] + chars[i + 2], 0.5)
    } else {
      bump(run.toLowerCase())
    }
  }

  return [...counts.entries()]
    .filter(([word]) => !STOP.has(word))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word]) => word)
}

/**
 * Turn a slice of turns into one memory card.
 * Deliberately lossy: the card is an INDEX, the raw turns stay on disk.
 */
export function makeCard(turns, { from = 0, to = 0, now = new Date() } = {}) {
  const list = Array.isArray(turns) ? turns : []
  const firstUser = list.find((t) => t.user)?.user || ''
  const title = firstUser.split(/[。！？!?\n]/u)[0].trim().slice(0, 40) || '(无标题)'
  const points = list
    .map((t) => (t.user || '').split('\n')[0].trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((line) => line.slice(0, 60))
  const body = list.map((t) => `${t.user || ''} ${t.assistant || ''}`).join('\n')
  const date = new Date(now).toISOString().slice(0, 10)

  return {
    date,
    from,
    to,
    title,
    points,
    keywords: keywordsOf(body),
    tokens: estimateTokens(body),
    turns: list.length,
  }
}

export function cardLine(card) {
  return `${card.date} ${card.title}`
}