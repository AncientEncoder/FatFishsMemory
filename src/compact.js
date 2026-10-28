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
 * 挑标题：优先"有信息量"的那句，而不是第一句。
 *
 * 用户经常先来一句"来吧""要""35米"，把它当标题，目录就读不下去了。
 * 规则：按顺序找第一句长度 ≥ 8 的人话；都没有才退回第一句。
 */
const TITLE_FILLERS = /^(来|好|行|嗯|哦|要|去吧|继续|开始|可以|ok|okay|吃饭|睡觉)[。！？!?~～\s]*$/iu
// 文件名 / 路径 / UUID 当标题很难看（"这个咩？session-10d841fa-…"）
const TITLE_JUNK = /[\\/]|[0-9a-f]{8}-[0-9a-f]{4}|\.(mjs|js|cjs|json|md|zst|zstd|bak)\b/iu

export function pickTitle(turns, { minLen = 8, maxLen = 40 } = {}) {
  const lines = (Array.isArray(turns) ? turns : [])
    .map((t) => String(t.user || '').split('\n')[0].trim())
    .filter(Boolean)
  for (const line of lines) {
    const clean = line.replace(/\s+/g, ' ')
    if (clean.length < minLen) continue
    if (TITLE_FILLERS.test(clean)) continue
    if (TITLE_JUNK.test(clean)) continue
    return clean.slice(0, maxLen)
  }
  const first = lines[0] || ''
  return first.slice(0, maxLen) || '(无标题)'
}

/**
 * Turn a slice of turns into one memory card.
 * Deliberately lossy: the card is an INDEX, the raw turns stay on disk.
 *
 * 结构化字段（v2）：
 *   goal    这件事想解决什么（第一句用户输入）
 *   actions 用了哪些工具（从 tool/call 事件累积）
 *   outcome 最后落到哪（最后一条回答的首句）
 *   files   涉及的文件路径
 */
export function makeCard(turns, { from = 0, to = 0, now = new Date() } = {}) {
  const list = Array.isArray(turns) ? turns : []
  const firstUser = list.find((t) => t.user)?.user || ''
  const title = pickTitle(list)
  const points = list
    .map((t) => (t.user || '').split('\n')[0].trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((line) => line.slice(0, 60))
  const body = list.map((t) => `${t.user || ''} ${t.assistant || ''}`).join('\n')
  const date = new Date(now).toISOString().slice(0, 10)

  const goal = firstUser.split('\n')[0].trim().slice(0, 80) || ''

  // 工具调用：去重并统计次数，比如 pwsh×3、read×2
  const toolCounts = new Map()
  for (const turn of list) {
    for (const name of turn.tools || []) {
      toolCounts.set(name, (toolCounts.get(name) || 0) + 1)
    }
  }
  const actions = [...toolCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count]) => (count > 1 ? `${name}×${count}` : name))

  const lastAssistant = [...list].reverse().find((t) => t.assistant)?.assistant || ''
  const outcome = lastAssistant.split(/[\n。！？!?]/u)[0].trim().slice(0, 80) || ''

  // 文件路径：够用就行，只认盘符路径和 ~/ 开头
  const files = new Set()
  for (const match of body.match(/[A-Za-z]:\\[^\s"'`<>|*?\n]+|~\/[^\s"'`<>|*?\n]+/gu) || []) {
    if (match.length > 3 && !match.includes('\\\\')) files.add(match)
    if (files.size >= 6) break
  }

  return {
    date,
    from,
    to,
    title,
    goal,
    actions,
    outcome,
    files: [...files],
    points,
    keywords: keywordsOf(body),
    tokens: estimateTokens(body),
    turns: list.length,
  }
}

export function cardLine(card) {
  return `${card.date} ${card.title}`
}