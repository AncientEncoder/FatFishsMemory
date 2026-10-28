import { searchCards, searchTurns } from './search.js'
import { keywordsOf } from './compact.js'

/**
 * 自动查表：在回答问题之前，先看看温层（卡片）和冷层（原文）里有没有相关的东西。
 *
 * 触发条件刻意保守——只在"这句话像是在回指过去"时才查：
 *   1. 时间指代词（那天/上次/之前/还记得…）
 *   2. 命中了卡片标题里的实体
 *
 * 查不到就什么都不做，绝不硬塞无关的记忆。
 */

const CUE = /(那天|上次|上回|之前|以前|还记得|上周|昨天|前天|刚才说的|我们说好|当初|那次)/u
const STOP = new Set(['的', '了', '是', '在', '我', '你', '他', '她', '它', '们', '这', '那', '吗', '呢', '吧', '啊'])

/** 这句话是不是在回指过去。 */
export function hasRecallCue(text) {
  return CUE.test(String(text || ''))
}

/** 粗粒度实体：中文按 2/3-gram 切（中文没空格，整句切出来匹配不上），英文按单词。 */
export function entitiesOf(text) {
  const out = new Set()
  // 中文没有空格，用 n-gram 才切得动
  for (const word of keywordsOf(String(text || ''), 16)) {
    if (!STOP.has(word)) out.add(word.toLowerCase())
  }
  for (const word of String(text || '').toLowerCase().match(/[a-z0-9_]{2,}/g) || []) {
    if (!STOP.has(word)) out.add(word)
  }
  return out
}

/** 查询是否命中目录里已有的卡片（实体级别）。 */
export function hitsIndex(cards, query) {
  return countIndexHits(cards, query) > 0
}

/**
 * 命中目录的"独立关键词"个数。
 * 单个关键词命中太容易（比如"重启"），会带来大量噪音；
 * 没有回指线索时，至少要命中 2 个才算"真在说那件事"。
 */
export function countIndexHits(cards, query) {
  const ents = entitiesOf(query)
  if (!ents.size) return 0
  const matched = new Set()
  for (const card of cards || []) {
    const text = `${card.title || ''} ${(card.keywords || []).join(' ')}`.toLowerCase()
    for (const e of ents) if (text.includes(e)) matched.add(e)
  }
  return matched.size
}

/**
 * 查表并生成一小段提示。查不到返回空串。
 * @returns {{ text: string, from: string }}
 */
export function buildRecallDigest(query, { cards = [], turns = [], limit = 3, maxChars = 300, now = Date.now() } = {}) {
  const q = String(query || '').trim()
  if (!q) return { text: '', from: 'none' }
  if (!hasRecallCue(q) && !hitsIndex(cards, q)) return { text: '', from: 'none' }

  const cardHits = searchCards(cards, q, { limit, now })
  const turnHits = searchTurns(turns, q, { limit, now })

  const lines = []
  for (const hit of cardHits) {
    lines.push(`- ${hit.card.date} ${hit.card.title}`)
  }
  for (const hit of turnHits) {
    const when = hit.ts ? new Date(hit.ts).toISOString().slice(0, 10) : '-'
    const text = String(hit.text || '').replace(/\s+/g, ' ').slice(0, 60)
    if (!text) continue
    lines.push(`- ${when} ${text}`)
  }
  if (!lines.length) return { text: '', from: 'none' }

  let body = lines.slice(0, limit).join('\n')
  if (body.length > maxChars) body = `${body.slice(0, maxChars)}…`
  return { text: `[可能相关] 你可能会用到这些旧记录（不确定就别用）：\n${body}`, from: 'warm' }
}
