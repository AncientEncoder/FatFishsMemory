/**
 * 记忆目录（hot memory）。
 *
 * 人不是靠"被提醒"想起事情的，是靠知道自己脑子里有什么。
 * 这张目录就是给模型的"我知道什么"：极短、只有日期和标题，
 * 需要细节时它会自己去翻。
 *
 * 目标：不超过 200 token，宁短勿长——它每轮都要占着上下文。
 */

export function buildCatalog(cards, { maxEntries = 8, maxChars = 600, recallCommand = '', personaLHint = '' } = {}) {
  const list = (cards || []).filter(Boolean)
  if (list.length === 0 && !recallCommand && !personaLHint) return ''

  const recent = list.slice(-maxEntries)
  const head = '[记忆目录] 你之前经历过这些（细节需要时再查）：'
  const items = []
  for (const card of recent) {
    const title = String(card.title || '').trim()
    // 标题太短的多半是"来吧""要""35米"这种，放进目录只会浪费字数
    if (!title || title.length < 4 || title === '(无标题)') continue
    const date = card.date ? `${card.date} ` : ''
    items.push(`- ${date}${title}`)
  }
  // 两条"提示"永远保留：我是谁、怎么查。列表被挤掉也要留着它们。
  const hints = []
  if (personaLHint) hints.push(`（我是谁：${personaLHint}）`)
  if (recallCommand) hints.push(`（查细节：${recallCommand}）`)

  if (items.length === 0 && hints.length === 0) return ''

  // 先占住提示，剩下的预算再放卡片（最近的优先）
  const fixed = [head, ...hints].join('\n').length
  const body = []
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const next = [head, items[i], ...body, ...hints].join('\n')
    if (next.length > maxChars && body.length > 0) break
    body.unshift(items[i])
    if (next.length >= maxChars && body.length > 0 && fixed >= maxChars) break
  }
  return [head, ...body, ...hints].join('\n')
}

/** 内容指纹：目录变了才值得再注入一次。 */
export function catalogId(text) {
  let h = 2166136261
  const str = String(text || '')
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `fatfish-catalog-${(h >>> 0).toString(16)}`
}

/** 系统消息的形状，照抄 runtime 自己注册 system prompt 的那条。 */
export function buildCatalogMessage(text, { turn = 0, step = 1, id = catalogId(text) } = {}) {
  return {
    event: 'system/message',
    data: {
      turn,
      step,
      message: {
        id,
        role: 'system',
        // system/message 的 source 必须归 system-prompt 所有；用 plugin:* 会被
        // Session 校验拒绝（“message must have system-prompt source”）。
        source: { kind: 'system-prompt' },
        content: [{ type: 'text', text }],
      },
    },
  }
}
